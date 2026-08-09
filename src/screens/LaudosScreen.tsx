import { useCallback, useEffect, useState } from "react";
import { FileText, CircleNotch, FilePdf, Eye } from "@phosphor-icons/react";
import { listarAgenda, baixarLaudo, listarEmpresas, ApiError, type AgendaItem, type ResultadoLaudo } from "../lib/api";
import { formatarBr, hojeIso, paraIso } from "../lib/datas";
import { LaudoViewer } from "../components/LaudoViewer";
import { SectionHeader } from "../components/SectionHeader";
import { useToast } from "../components/Toast";
import { SkeletonList } from "../components/Skeleton";

// Secao de Laudos com paridade com o desktop (LaudosView): filtros por
// periodo/empresa/funcionario/motivo e download do laudo oficial — pagina
// "sem arma" ou "com arma" conforme a consulta. Baixar marca a consulta
// como "Baixado" no servidor (mesma regra do desktop).

const MOTIVOS = ["", "Admissao", "Periodico", "Retorno ao trabalho", "Mudanca de funcao", "Demissional"];

// Seletor do resultado (APTO/INAPTO) antes de gerar o laudo oficial. O laudo
// e um documento de aptidao psicologica; quem gera decide o resultado.
function SeletorResultado({
  consulta,
  onCancelar,
  onConfirmar,
}: {
  consulta: AgendaItem;
  onCancelar: () => void;
  onConfirmar: (r: ResultadoLaudo) => void;
}) {
  const comArma = consulta.tipoLaudo === "Com arma";
  const opcoes: { valor: ResultadoLaudo; rotulo: string }[] = comArma
    ? [
        { valor: "apto_arma", rotulo: "APTO ao manuseio de arma de fogo" },
        { valor: "apto_arma_profissao", rotulo: "APTO à arma e ao exercício da profissão" },
        { valor: "inapto", rotulo: "INAPTO" },
      ]
    : [
        { valor: "apto", rotulo: "APTO" },
        { valor: "inapto", rotulo: "INAPTO" },
      ];
  const [sel, setSel] = useState<ResultadoLaudo>(comArma ? "apto_arma_profissao" : "apto");

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center"
      onMouseDown={onCancelar}
    >
      <div
        className="w-full max-w-md rounded-t-2xl bg-spark-panel p-5 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] shadow-[0_-16px_40px_-16px_rgba(28,25,23,0.5)] sm:rounded-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <p className="text-[16px] font-semibold text-spark-ink">Resultado do laudo</p>
        <p className="mt-0.5 truncate text-[13px] text-spark-muted">
          {consulta.clienteNome || "Cliente"} · {consulta.tipoLaudo || "Sem arma"}
        </p>
        <div className="mt-4 flex flex-col gap-2">
          {opcoes.map((o) => {
            const ativo = sel === o.valor;
            return (
              <button
                key={o.valor}
                type="button"
                onClick={() => setSel(o.valor)}
                className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-left text-[14px] font-medium transition ${
                  ativo
                    ? "border-spark-accent bg-spark-soft text-spark-ink"
                    : "border-spark-inputline bg-spark-field text-spark-body"
                }`}
              >
                <span
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${
                    ativo ? "border-spark-accent" : "border-spark-inputline"
                  }`}
                >
                  {ativo && <span className="h-2.5 w-2.5 rounded-full bg-spark-accent" />}
                </span>
                {o.rotulo}
              </button>
            );
          })}
        </div>
        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={onCancelar}
            className="h-12 flex-1 rounded-xl border border-spark-inputline bg-spark-field text-[15px] font-semibold text-spark-body transition active:scale-[0.98]"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => onConfirmar(sel)}
            className="h-12 flex-[2] rounded-xl bg-spark-accent hover:bg-spark-accent-strong text-[15px] font-semibold text-white transition active:scale-[0.98]"
          >
            Gerar laudo
          </button>
        </div>
      </div>
    </div>
  );
}

interface Props {
  onSessaoExpirada: () => void;
  onVoltar?: () => void;
  refreshSeq?: number;
}

const inputCls =
  "h-11 w-full rounded-xl border border-spark-inputline bg-spark-field px-3 text-[14px] text-spark-ink outline-none transition placeholder:text-spark-faint focus:border-spark-accent focus:ring-2 focus:ring-spark-accent/20";
const labelCls = "mb-1 block text-[12px] font-semibold text-spark-label";

function primeiroDiaDoMes(): string {
  const d = new Date();
  return paraIso(new Date(d.getFullYear(), d.getMonth(), 1));
}

function contemSemAcento(texto: string, termo: string): boolean {
  const normalizar = (v: string) =>
    v.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();
  return normalizar(texto).includes(normalizar(termo));
}

export function LaudosScreen({ onSessaoExpirada, onVoltar, refreshSeq = 0 }: Props) {
  const [de, setDe] = useState(primeiroDiaDoMes());
  const [ate, setAte] = useState(hojeIso());
  const [empresa, setEmpresa] = useState("");
  const [funcionario, setFuncionario] = useState("");
  const [motivo, setMotivo] = useState("");

  const [itens, setItens] = useState<AgendaItem[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");
  const [baixando, setBaixando] = useState<string | null>(null);
  const [buscou, setBuscou] = useState(false);
  const [viewer, setViewer] = useState<{ blob: Blob | null; nomeArquivo: string; titulo: string } | null>(null);
  const [empresas, setEmpresas] = useState<string[]>([]);
  const [escolhendo, setEscolhendo] = useState<AgendaItem | null>(null);
  const toast = useToast();

  useEffect(() => {
    listarEmpresas().then(setEmpresas).catch(() => {});
  }, []);

  const buscar = useCallback(async () => {
    if (!de || !ate) return setErro("Informe o período.");
    if (de > ate) return setErro("A data inicial não pode ser maior que a final.");

    setCarregando(true);
    setErro("");
    setAviso("");
    try {
      const lista = await listarAgenda(de, ate);
      setItens(lista);
      setBuscou(true);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        onSessaoExpirada();
        return;
      }
      setErro(err instanceof ApiError ? err.message : "Falha ao carregar os laudos.");
    } finally {
      setCarregando(false);
    }
  }, [de, ate, onSessaoExpirada]);

  // Primeira carga: mes atual.
  useEffect(() => {
    void buscar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (refreshSeq > 0) void buscar();
  }, [refreshSeq, buscar]);

  // Filtros de texto sao locais (mesma semantica do desktop: empresa por
  // trecho, funcionario por nome OU cargo, motivo exato).
  const filtrados = itens.filter((c) => {
    if (empresa && !contemSemAcento(c.empresa ?? "", empresa)) return false;
    if (
      funcionario &&
      !contemSemAcento(c.clienteNome ?? "", funcionario) &&
      !contemSemAcento(c.cargo ?? "", funcionario)
    )
      return false;
    if (motivo && c.motivo !== motivo) return false;
    return true;
  });

  // Abre o laudo no visualizador (Baixar/Compartilhar ficam la dentro);
  // o servidor ja marca a consulta como "Baixado" ao servir o PDF.
  // Abre a tela na hora (blob null = carregando) e preenche quando chega.
  async function abrir(c: AgendaItem, resultado: ResultadoLaudo) {
    setBaixando(c.idLocal);
    setErro("");
    setAviso("");
    const titulo = `${c.clienteNome || "Laudo"} · ${c.tipoLaudo || "Sem arma"}`;
    setViewer({ blob: null, nomeArquivo: "laudo.pdf", titulo });
    try {
      const { blob, nomeArquivo } = await baixarLaudo(c.idLocal, resultado);
      setViewer({ blob, nomeArquivo, titulo });
      // Reflete o status "Baixado" sem rebuscar tudo.
      setItens((atual) =>
        atual.map((i) => (i.idLocal === c.idLocal ? { ...i, status: "Baixado" } : i)),
      );
    } catch (err) {
      setViewer(null);
      if (err instanceof ApiError && err.status === 401) {
        onSessaoExpirada();
        return;
      }
      // Detalhe tecnico fica no console; a diretoria ve uma mensagem tranquila.
      console.error("Falha ao baixar o laudo:", err);

      // Toast, e nao setErro: a mensagem de erro da tela fica no topo, dentro do
      // card de filtros. Com a lista rolada, o usuario clicava num laudo la
      // embaixo e a falha aparecia fora do campo de visao — parecia que o botao
      // simplesmente nao fazia nada. O toast e fixo na base, sempre visivel.
      if (err instanceof ApiError && err.status === 0) {
        toast.erro(err.message); // "Sem conexao com a API..." — ja e amigavel
      } else if (err instanceof ApiError && (err.status === 409 || err.status >= 500)) {
        toast.erro(
          "Laudo temporariamente indisponível. Tente de novo em instantes; se persistir, avise o suporte.",
        );
      } else {
        toast.erro(
          err instanceof ApiError
            ? `Não foi possível abrir o laudo (${err.status}). Tente novamente.`
            : "Não foi possível abrir o laudo. Tente novamente.",
        );
      }
    } finally {
      setBaixando(null);
    }
  }

  return (
    <div className="px-4 py-4">
      <SectionHeader
        titulo="Laudos"
        subtitulo="Histórico de agendamentos e o laudo oficial (com/sem arma)."
        Icone={FileText}
        onVoltar={onVoltar}
      />

      {/* Filtros */}
      <div className="rounded-2xl border border-spark-line bg-spark-panel p-4">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <label className="block">
            <span className={labelCls}>De</span>
            <input type="date" className={inputCls} value={de} onChange={(e) => setDe(e.target.value)} />
          </label>
          <label className="block">
            <span className={labelCls}>Ate</span>
            <input type="date" className={inputCls} value={ate} onChange={(e) => setAte(e.target.value)} />
          </label>
          <label className="block">
            <span className={labelCls}>Empresa</span>
            <input
              className={inputCls}
              value={empresa}
              onChange={(e) => setEmpresa(e.target.value)}
              placeholder="Todas as cadastradas"
              list="laudos-empresas"
            />
            <datalist id="laudos-empresas">
              {empresas.map((e) => (
                <option key={e} value={e} />
              ))}
            </datalist>
          </label>
          <label className="block">
            <span className={labelCls}>Funcionário</span>
            <input
              className={inputCls}
              value={funcionario}
              onChange={(e) => setFuncionario(e.target.value)}
              placeholder="Nome ou cargo"
            />
          </label>
          <label className="block">
            <span className={labelCls}>Motivo</span>
            <select className={inputCls} value={motivo} onChange={(e) => setMotivo(e.target.value)}>
              {MOTIVOS.map((m) => (
                <option key={m} value={m}>{m || "Todos"}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={buscar}
            disabled={carregando}
            className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-spark-accent hover:bg-spark-accent-strong text-[15px] font-semibold text-white transition active:scale-[0.98] disabled:opacity-60 lg:flex-none lg:w-56"
          >
            {carregando && <CircleNotch size={18} className="animate-spin" />}
            {carregando ? "Carregando..." : "Filtrar"}
          </button>
          <button
            type="button"
            onClick={buscar}
            disabled={carregando}
            aria-label="Atualizar laudos"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-spark-soft text-spark-accent-strong transition active:scale-[0.98] disabled:opacity-60"
          >
            <CircleNotch size={18} className={carregando ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      {erro && (
        <p className="mt-4 rounded-xl border border-spark-danger/20 bg-spark-danger/5 px-4 py-3 text-center text-sm text-spark-danger">
          {erro}
        </p>
      )}
      {aviso && (
        <p className="mt-4 rounded-xl border border-spark-success/25 bg-spark-success/5 px-4 py-3 text-center text-sm text-spark-success">
          {aviso}
        </p>
      )}

      {/* Lista */}
      <div className="mt-5">
        {buscou && (
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-spark-muted">
            {filtrados.length} registro(s) de {formatarBr(de)} ate {formatarBr(ate)}
          </p>
        )}

        {carregando && itens.length === 0 && <SkeletonList n={4} />}

        {buscou && filtrados.length === 0 && !carregando && (
          <div className="rounded-2xl border border-dashed border-spark-inputline bg-spark-surface/60 px-4 py-8 text-center">
            <p className="text-sm text-spark-muted">Nenhum agendamento no período/filtros.</p>
          </div>
        )}

        <ul className="flex flex-col gap-3">
          {filtrados.map((c) => (
            <li
              key={c.idLocal}
              className="rounded-2xl border border-spark-line bg-spark-panel px-4 py-3.5"
            >
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-bold text-spark-accent">
                    {formatarBr(c.data)} {c.horario}
                  </p>
                  <p className="truncate text-[15px] font-semibold text-spark-ink">
                    {c.clienteNome || "(sem nome)"}
                  </p>
                  {(c.empresa || c.cargo) && (
                    <p className="truncate text-[13px] text-spark-muted">
                      {[c.empresa, c.cargo].filter(Boolean).join(" | ")}
                    </p>
                  )}
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    {c.motivo && (
                      <span className="rounded-sm bg-spark-surface px-2.5 py-1 text-xs font-medium text-spark-body">
                        {c.motivo}
                      </span>
                    )}
                    <span
                      className={`flex items-center gap-1 rounded-sm px-2.5 py-1 text-xs font-semibold ${
                        c.tipoLaudo === "Com arma"
                          ? "bg-spark-danger/10 text-spark-danger"
                          : "bg-spark-soft text-spark-accent-strong"
                      }`}
                    >
                      <FilePdf size={13} weight="fill" />
                      {c.tipoLaudo || "Sem arma"}
                    </span>
                    {c.status && (
                      <span
                        className={`rounded-sm px-2.5 py-1 text-xs font-semibold ${
                          c.status === "Baixado"
                            ? "bg-spark-success/10 text-spark-success"
                            : "bg-spark-surface text-spark-body"
                        }`}
                      >
                        {c.status}
                      </span>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setEscolhendo(c)}
                  disabled={baixando === c.idLocal}
                  className="flex shrink-0 items-center gap-1.5 rounded-xl bg-spark-soft px-3.5 py-2.5 text-[13px] font-semibold text-spark-accent-strong transition active:scale-95 disabled:opacity-60"
                >
                  {baixando === c.idLocal ? (
                    <CircleNotch size={16} className="animate-spin" />
                  ) : (
                    <Eye size={16} weight="bold" />
                  )}
                  Abrir laudo
                </button>
              </div>
            </li>
          ))}
        </ul>
      </div>

      {escolhendo && (
        <SeletorResultado
          consulta={escolhendo}
          onCancelar={() => setEscolhendo(null)}
          onConfirmar={(r) => {
            const c = escolhendo;
            setEscolhendo(null);
            void abrir(c, r);
          }}
        />
      )}

      {viewer && (
        <LaudoViewer
          blob={viewer.blob}
          nomeArquivo={viewer.nomeArquivo}
          titulo={viewer.titulo}
          onFechar={() => setViewer(null)}
        />
      )}
    </div>
  );
}
