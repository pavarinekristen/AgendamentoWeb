import { create, get } from "@github/webauthn-json";

// Cliente HTTP da RetaguardaAgendamentoAPI (a MESMA API do SparkCore desktop).
//
// Rotas consumidas (mapeadas do AuthController e PortalClientesController):
//   POST /auth/login                -> { token, expiraEm, usuario, empresa }
//   GET  /auth/me                   -> valida o Bearer token da sessao
//   GET  /portal/clientes?nome=&limite=  -> PortalClienteResumo[] (busca do Ctrl+K)
//   GET  /portal/clientes/{idLocal} -> PortalClienteDetalhe (com historico)

const BASE_URL = (import.meta.env.VITE_API_BASE_URL || "/api").replace(/\/+$/, "");
const TOKEN_KEY = "agendamentoweb.token";

// Chave antiga: guardava nome/e-mail/perfil do usuario no localStorage, visiveis
// em DevTools > Application. Nao gravamos mais nada disso — o app pega os dados
// do /auth/me e mantem so em memoria. Isto apaga o residuo dos aparelhos que ja
// tinham a chave gravada por versoes anteriores.
const USER_KEY_LEGADO = "agendamentoweb.usuario";
try {
  localStorage.removeItem(USER_KEY_LEGADO);
} catch {
  /* modo privado/storage bloqueado: nada a limpar */
}

export interface AuthUsuario {
  nome?: string;
  email?: string;
}

export interface AuthResponse {
  token?: string;
  expiraEm?: string;
  usuario?: AuthUsuario;
  empresa?: { razaoSocial?: string; nomeFantasia?: string };
  mensagem?: string;
  requer2FA?: boolean;
}

export interface ClienteResumo {
  idLocal: string;
  idCadastro?: string;
  nome?: string;
  empresa?: string;
  cargo?: string;
  cpf?: string;
  rg?: string;
  email?: string;
  sexo?: string;
  telefone?: string;
  sincronizadoEm?: string;
}

export interface HistoricoItem {
  idLocal?: string;
  data?: string;
  horario?: string;
  funcionario?: string;
  empresa?: string;
  cargo?: string;
  motivo?: string;
  status?: string;
  tipoLaudo?: string;
  observacao?: string;
}

export interface ClienteDetalhe extends ClienteResumo {
  dataNascimento?: string; // "yyyy-MM-dd 00:00:00" ou vazio
  escolaridade?: string;
  estadoCivil?: string;
  naturalidade?: string;
  tipoEndereco?: string;
  endereco?: string;
  bairro?: string;
  cidade?: string;
  status?: string;
  observacoes?: string;
  historico?: HistoricoItem[];
}

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

// So o token e persistido (para a sessao sobreviver ao fechar o app). Nome,
// e-mail e perfil vivem apenas em memoria, vindos do /auth/me a cada abertura.
export const session = {
  get token(): string | null {
    return localStorage.getItem(TOKEN_KEY);
  },
  save(token: string) {
    localStorage.setItem(TOKEN_KEY, token);
  },
  clear() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY_LEGADO);
  },
};

async function request<T>(
  path: string,
  init: RequestInit = {},
  auth = true,
): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  if (init.body) headers.set("Content-Type", "application/json");
  if (auth && session.token) headers.set("Authorization", `Bearer ${session.token}`);

  let response: Response;
  try {
    response = await fetch(`${BASE_URL}${path}`, { ...init, headers });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    throw new ApiError("Sem conexao com a API. Verifique a internet.", 0);
  }

  const body = await response.text();

  if (!response.ok) {
    if (response.status === 401 && auth) session.clear();
    let message = `Erro ${response.status} na API.`;
    try {
      const parsed = JSON.parse(body) as { message?: string; mensagem?: string };
      message = parsed.message || parsed.mensagem || message;
    } catch {
      /* corpo nao-JSON: mantem a mensagem generica */
    }
    throw new ApiError(message, response.status);
  }

  return (body ? JSON.parse(body) : null) as T;
}

export async function login(email: string, senha: string): Promise<AuthResponse> {
  const auth = await request<AuthResponse>(
    "/auth/login",
    { method: "POST", body: JSON.stringify({ email, senha }) },
    false,
  );

  // Conta com 2FA: a API nao devolve token aqui — o codigo foi enviado por
  // e-mail e a sessao sai do POST /auth/login/2fa (login2fa abaixo).
  if (auth?.requer2FA) return auth;

  if (!auth?.token) {
    throw new ApiError(
      auth?.mensagem ?? "Conta pendente de confirmacao de e-mail. Conclua pelo sistema desktop.",
      401,
    );
  }

  return auth;
}

export async function login2fa(email: string, codigo: string): Promise<AuthResponse> {
  const auth = await request<AuthResponse>(
    "/auth/login/2fa",
    { method: "POST", body: JSON.stringify({ email, codigo }) },
    false,
  );

  if (!auth?.token) {
    throw new ApiError(auth?.mensagem ?? "Codigo de verificacao invalido.", 401);
  }

  return auth;
}

// --- Passkeys / WebAuthn (login sem OTP: digital / PIN do Windows / QR) ------
//
// Modelo hibrido: a passkey vira o caminho principal e o OTP por e-mail
// (login/2fa acima) fica so como recuperacao. Rotas esperadas na API .NET:
//   POST /auth/passkey/register/begin   (Bearer) -> PublicKeyCredentialCreationOptions
//   POST /auth/passkey/register/finish  (Bearer) -> { sucesso, id, apelido }
//   POST /auth/passkey/login/begin      -> PublicKeyCredentialRequestOptions
//   POST /auth/passkey/login/finish     -> { token, expiraEm, usuario, empresa }
//   GET  /auth/passkey                  (Bearer) -> PasskeyInfo[]
//   DELETE /auth/passkey/{id}           (Bearer)
//
// Enquanto a API nao expoe essas rotas, o front mantem o botao escondido via
// VITE_PASSKEYS_ENABLED (o login por e-mail+senha+OTP continua intacto).

const PASSKEYS_ENABLED =
  String(import.meta.env.VITE_PASSKEYS_ENABLED ?? "").toLowerCase() === "true";

export interface PasskeyInfo {
  id: string;
  apelido: string;
  criadoEm: string;
  ultimoUsoEm?: string;
}

// Botao aparece so onde o navegador suporta E a API foi liberada pela flag.
export function passkeySuportada(): boolean {
  return (
    PASSKEYS_ENABLED &&
    typeof window !== "undefined" &&
    typeof window.PublicKeyCredential !== "undefined" &&
    !!navigator.credentials
  );
}

// Passkey so no CELULAR com o app instalado (PWA em standalone). No PC/web fica
// escondida — la o acesso e so por e-mail+senha (+codigo), por escolha do dono.
export function dispositivoPermitePasskey(): boolean {
  if (typeof window === "undefined") return false;
  const standalone =
    window.matchMedia?.("(display-mode: standalone)")?.matches === true ||
    (navigator as unknown as { standalone?: boolean }).standalone === true;
  const celular = /android|iphone|ipod|ipad|mobile/i.test(navigator.userAgent || "");
  return standalone && celular;
}

// Regra unica de exibicao da UI de passkey (login + "Meus dispositivos").
export function mostrarPasskeyUI(): boolean {
  return passkeySuportada() && dispositivoPermitePasskey();
}

// A API devolve no begin um handle (correlaciona o desafio guardado em cache) +
// as options ja no formato JSON do WebAuthn que o @github/webauthn-json consome.
interface PasskeyBegin {
  handle: string;
  options: Record<string, unknown>;
}

// Cadastra a passkey deste aparelho — exige estar logado (o portao e o OTP).
export async function cadastrarPasskey(apelido: string): Promise<void> {
  const begin = await request<PasskeyBegin>(
    "/auth/passkey/register/begin",
    { method: "POST", body: JSON.stringify({ apelido }) },
  );
  const credential = await create({ publicKey: begin.options as never });
  await request("/auth/passkey/register/finish", {
    method: "POST",
    body: JSON.stringify({ handle: begin.handle, apelido, resposta: credential }),
  });
}

// Login por passkey. email e opcional (com credencial "discoverable" o
// navegador ja sabe quem e o dono). Devolve o mesmo shape do login2fa.
export async function loginPasskey(email?: string): Promise<AuthResponse> {
  const begin = await request<PasskeyBegin>(
    "/auth/passkey/login/begin",
    { method: "POST", body: JSON.stringify(email ? { email } : {}) },
    false,
  );
  const assertion = await get({ publicKey: begin.options as never });
  const auth = await request<AuthResponse>(
    "/auth/passkey/login/finish",
    { method: "POST", body: JSON.stringify({ handle: begin.handle, resposta: assertion }) },
    false,
  );
  if (!auth?.token) {
    throw new ApiError(auth?.mensagem ?? "Nao foi possivel entrar com a passkey.", 401);
  }
  return auth;
}

export function listarPasskeys(): Promise<PasskeyInfo[]> {
  return request<PasskeyInfo[]>("/auth/passkey");
}

export async function revogarPasskey(id: string): Promise<void> {
  await request(`/auth/passkey/${encodeURIComponent(id)}`, { method: "DELETE" });
}

// Sessao devolvida pelo /auth/me: contem usuario e empresa (com id) — util
// para diagnosticar qual tenant a API enxerga para este login.
export interface SessaoInfo {
  usuario?: { nome?: string; email?: string } & Record<string, unknown>;
  empresa?: {
    id?: number;
    cnpj?: string;
    razaoSocial?: string;
    nomeFantasia?: string;
  } & Record<string, unknown>;
  [key: string]: unknown;
}

export function validarSessao(): Promise<SessaoInfo> {
  return request<SessaoInfo>("/auth/me");
}

// Teto imposto pelo servidor (Math.Clamp no PortalClienteService); a query em si
// varre a base inteira de clientes da empresa no Postgres — so a exibicao e capada.
export const LIMITE_MAXIMO = 100;

export function pesquisarClientes(
  termo: string,
  empresa: string,
  signal?: AbortSignal,
): Promise<ClienteResumo[]> {
  // O param "nome" da API faz LIKE em NOME e em DADOS_JSON: como telefone, CPF
  // e ID vivem dentro do DADOS_JSON, buscar por esses campos tambem funciona.
  // "empresa" filtra por EMPRESA/DADOS_JSON, combinavel (AND) com o termo.
  const query = new URLSearchParams({ limite: String(LIMITE_MAXIMO) });
  if (termo) query.set("nome", termo);
  if (empresa) query.set("empresa", empresa);
  return request<ClienteResumo[]>(`/portal/clientes?${query}`, { signal });
}

// GET /portal/clientes/empresas — todas as empresas cadastradas (o dropdown
// do desktop). Cache local do modulo: os formularios abrem varias vezes e a
// lista muda pouco (o servidor tambem cacheia por 5 min).
let empresasCache: string[] | null = null;

export async function listarEmpresas(): Promise<string[]> {
  if (empresasCache) return empresasCache;
  const lista = await request<string[]>("/portal/clientes/empresas");
  empresasCache = lista;
  return lista;
}

export function detalharCliente(
  idLocal: string,
  signal?: AbortSignal,
): Promise<ClienteDetalhe> {
  return request<ClienteDetalhe>(
    `/portal/clientes/${encodeURIComponent(idLocal)}`,
    { signal },
  );
}

// --- Agenda (GET /portal/agenda, adicionada na API em 17/07/2026) ---------

export interface AgendaItem {
  idLocal: string;
  data: string; // yyyy-MM-dd
  horario: string;
  clienteNome: string;
  clienteIdLocal: string;
  empresa: string;
  cargo: string;
  motivo: string;
  status: string;
  profissionalSala: string;
  local: string;
  tipoLaudo: string;
  observacoes: string;
}

export interface VencimentoItem {
  clienteIdLocal: string;
  clienteNome: string;
  empresa: string;
  cargo: string;
  ultimaConsultaEm: string; // yyyy-MM-dd
  vencimentoEm: string; // yyyy-MM-dd
  diasRestantes: number;
}

export function listarAgenda(
  deIso: string,
  ateIso: string,
  signal?: AbortSignal,
): Promise<AgendaItem[]> {
  const query = new URLSearchParams({ de: deIso, ate: ateIso });
  return request<AgendaItem[]>(`/portal/agenda?${query}`, { signal });
}

export function listarVencimentos(
  dias = 90,
  signal?: AbortSignal,
): Promise<VencimentoItem[]> {
  return request<VencimentoItem[]>(`/portal/agenda/vencimentos?dias=${dias}`, {
    signal,
  });
}

// --- Escrita pelo portal (POST/PUT /portal/consultas e /portal/clientes) ---

export interface ConsultaPayload {
  clienteIdLocal: string;
  data: string; // yyyy-MM-dd
  horario: string; // HH:mm
  local: string;
  profissionalSalaIdLocal: string;
  status: string;
  motivo: string;
  trabalhaArmado: boolean;
  observacoes: string;
}

export interface ClientePayload {
  nome: string;
  empresa: string;
  cargo: string;
  cpf: string;
  rg: string;
  dataNascimento: string; // yyyy-MM-dd ou ""
  sexo: string;
  telefone: string;
  email: string;
  escolaridade: string;
  estadoCivil: string;
  naturalidade: string;
  tipoEndereco: string;
  endereco: string;
  bairro: string;
  cidade: string;
  observacoes: string;
  status: string;
}

export interface EscritaResponse {
  sucesso: boolean;
  idLocal: string;
  mensagem: string;
}

export interface ProfissionalSala {
  idLocal: string;
  nome: string;
  tipo: string;
  especialidadeFuncao: string;
}

export function criarConsulta(payload: ConsultaPayload): Promise<EscritaResponse> {
  return request<EscritaResponse>("/portal/consultas", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function atualizarConsulta(idLocal: string, payload: ConsultaPayload): Promise<EscritaResponse> {
  return request<EscritaResponse>(`/portal/consultas/${encodeURIComponent(idLocal)}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export function criarCliente(payload: ClientePayload): Promise<EscritaResponse> {
  return request<EscritaResponse>("/portal/clientes", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function atualizarCliente(idLocal: string, payload: ClientePayload): Promise<EscritaResponse> {
  return request<EscritaResponse>(`/portal/clientes/${encodeURIComponent(idLocal)}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

// Exclusao e sempre soft-delete no servidor (paridade com o desktop): o
// registro some das buscas/agenda mas permanece no banco.
export function excluirCliente(idLocal: string): Promise<EscritaResponse> {
  return request<EscritaResponse>(`/portal/clientes/${encodeURIComponent(idLocal)}`, {
    method: "DELETE",
  });
}

export function excluirConsulta(idLocal: string): Promise<EscritaResponse> {
  return request<EscritaResponse>(`/portal/consultas/${encodeURIComponent(idLocal)}`, {
    method: "DELETE",
  });
}

export function listarProfissionaisSalas(signal?: AbortSignal): Promise<ProfissionalSala[]> {
  return request<ProfissionalSala[]>("/portal/profissionais-salas", { signal });
}

// --- Tarefas pessoais (agenda particular do "Quadro do dia") --------------
// Tabela web-only na API: nao vinculam cliente nem sincronizam com o desktop.
export interface TarefaItem {
  idLocal: string;
  data: string; // yyyy-MM-dd
  horario: string; // HH:mm (pode ser vazio)
  titulo: string;
  observacoes: string;
  status: string;
}

export interface TarefaPayload {
  data: string; // yyyy-MM-dd
  horario: string; // HH:mm ou ""
  titulo: string;
  observacoes: string;
  status: string;
}

export function listarTarefas(
  deIso: string,
  ateIso: string,
  signal?: AbortSignal,
): Promise<TarefaItem[]> {
  const query = new URLSearchParams({ de: deIso, ate: ateIso });
  return request<TarefaItem[]>(`/portal/tarefas?${query}`, { signal });
}

export function criarTarefa(payload: TarefaPayload): Promise<EscritaResponse> {
  return request<EscritaResponse>("/portal/tarefas", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function atualizarTarefa(idLocal: string, payload: TarefaPayload): Promise<EscritaResponse> {
  return request<EscritaResponse>(`/portal/tarefas/${encodeURIComponent(idLocal)}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

// Arrastar/mover no quadro: muda so o status (payload minimo).
export function moverTarefa(idLocal: string, status: string): Promise<EscritaResponse> {
  const query = new URLSearchParams({ status });
  return request<EscritaResponse>(
    `/portal/tarefas/${encodeURIComponent(idLocal)}/status?${query}`,
    { method: "PUT" },
  );
}

export function excluirTarefa(idLocal: string): Promise<EscritaResponse> {
  return request<EscritaResponse>(`/portal/tarefas/${encodeURIComponent(idLocal)}`, {
    method: "DELETE",
  });
}

// POST /portal/consultas/{idLocal}/laudo — devolve o PDF oficial (pagina
// com/sem arma conforme a consulta) e marca a consulta como "Baixado" no
// servidor (o desktop recebe a mudanca pelo sync, como no fluxo original).
// Resultado escolhido na tela antes de gerar. Sem arma: "apto" | "inapto".
// Com arma: "apto_arma" | "apto_arma_profissao" | "inapto".
export type ResultadoLaudo =
  | "apto"
  | "inapto"
  | "apto_arma"
  | "apto_arma_profissao";

export async function baixarLaudo(
  idLocal: string,
  resultado?: ResultadoLaudo,
): Promise<{ blob: Blob; nomeArquivo: string }> {
  const headers = new Headers({ Accept: "application/pdf" });
  if (session.token) headers.set("Authorization", `Bearer ${session.token}`);

  const query = resultado ? `?resultado=${encodeURIComponent(resultado)}` : "";

  let response: Response;
  try {
    response = await fetch(
      `${BASE_URL}/portal/consultas/${encodeURIComponent(idLocal)}/laudo${query}`,
      { method: "POST", headers, cache: "no-store" },
    );
  } catch (err) {
    const detalhe = err instanceof Error && err.message ? ` (${err.message})` : "";
    throw new ApiError(
      `Nao foi possivel chamar a API para gerar o laudo${detalhe}. Feche e abra o app novamente se estiver usando o atalho instalado.`,
      0,
    );
  }

  if (!response.ok) {
    if (response.status === 401) session.clear();
    let message = `Erro ${response.status} na API.`;
    try {
      const parsed = (await response.json()) as { message?: string; mensagem?: string };
      message = parsed.message || parsed.mensagem || message;
    } catch {
      /* corpo nao-JSON: mantem a mensagem generica */
    }
    throw new ApiError(message, response.status);
  }

  const contentDisposition = response.headers.get("Content-Disposition") ?? "";
  const match = /filename\*?=(?:UTF-8''|")?([^";]+)/i.exec(contentDisposition);
  const nomeArquivo = match
    ? decodeURIComponent(match[1].replace(/"/g, "").trim())
    : "laudo.pdf";

  return { blob: await response.blob(), nomeArquivo };
}

// GET /portal/relatorios — agregados do mini-dashboard (aba Resumo).
export interface RelatorioMes {
  mes: string; // "yyyy-MM"
  total: number;
  realizadas: number;
  canceladas: number;
  faltas: number;
}

export interface RelatorioResponse {
  meses: RelatorioMes[];
  vencimentos: {
    vencidosSemRenovacao: number;
    em30Dias: number;
    em90Dias: number;
  };
  topEmpresas: { empresa: string; total: number }[];
}

export function obterRelatorios(
  meses = 6,
  signal?: AbortSignal,
): Promise<RelatorioResponse> {
  return request<RelatorioResponse>(`/portal/relatorios?meses=${meses}`, {
    signal,
  });
}
