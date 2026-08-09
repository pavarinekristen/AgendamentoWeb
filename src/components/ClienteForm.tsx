import { useEffect, useState, type FormEvent } from "react";
import { X, CircleNotch } from "@phosphor-icons/react";
import {
  criarCliente,
  atualizarCliente,
  listarEmpresas,
  ApiError,
  type ClientePayload,
  type ClienteDetalhe,
} from "../lib/api";
import { useToast } from "./Toast";

// Cadastro/edicao de cliente com paridade TOTAL com o desktop WPF (ClientesView):
// mesmos 18 campos, mesmos combos e mesmas validações do ClienteValidator.

const SEXOS = ["", "Masculino", "Feminino"];
const ESTADOS_CIVIS = ["", "Solteiro(a)", "Casado(a)", "Divorciado(a)", "Viuvo(a)", "Uniao estavel"];
const TIPOS_ENDERECO = ["Particular", "Empresa"];
const STATUS = ["Ativo", "Inativo"];

interface Props {
  cliente?: ClienteDetalhe; // presente = edicao (precisa vir do detalharCliente)
  // true = renderiza como bloco normal (secao Cadastro); false = overlay modal.
  inline?: boolean;
  onFechar?: () => void;
  onSalvo: (idLocal: string, nome: string) => void;
  onSessaoExpirada: () => void;
}

// Combos rejeitam valor fora da lista (a API valida): normaliza ignorando caixa.
function opcaoValida(valor: string | undefined, opcoes: string[], padrao: string): string {
  const v = (valor ?? "").trim();
  return opcoes.find((o) => o.toLowerCase() === v.toLowerCase()) ?? padrao;
}

// yyyy-MM-dd do fuso do aparelho (toISOString daria UTC: vira "amanha" a noite).
function hoje(): string {
  const d = new Date();
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mes}-${dia}`;
}

function mascaraCpf(v: string): string {
  const d = v.replace(/\D/g, "").slice(0, 11);
  return d
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
}

function mascaraTelefone(v: string): string {
  const d = v.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 10) return d.replace(/(\d{2})(\d)/, "($1) $2").replace(/(\d{4})(\d)/, "$1-$2");
  return d.replace(/(\d{2})(\d)/, "($1) $2").replace(/(\d{5})(\d)/, "$1-$2");
}

function cpfValido(cpf: string): boolean {
  const d = cpf.replace(/\D/g, "");
  if (d.length !== 11 || /^(\d)\1+$/.test(d)) return false;
  for (const etapa of [9, 10]) {
    let soma = 0;
    for (let i = 0; i < etapa; i++) soma += Number(d[i]) * (etapa + 1 - i);
    if (((soma * 10) % 11) % 10 !== Number(d[etapa])) return false;
  }
  return true;
}

const inputCls =
  "h-12 w-full rounded-xl border border-spark-inputline bg-spark-field px-3.5 text-[15px] text-spark-ink outline-none transition placeholder:text-spark-faint focus:border-spark-accent focus:ring-2 focus:ring-spark-accent/20";
const labelCls = "mb-1.5 block text-[12.5px] font-semibold text-spark-label";

export function ClienteForm({ cliente, inline = false, onFechar, onSalvo, onSessaoExpirada }: Props) {
  const editando = Boolean(cliente?.idLocal);
  const toast = useToast();
  const [f, setF] = useState<ClientePayload>(() => ({
    nome: cliente?.nome ?? "",
    empresa: cliente?.empresa ?? "",
    cargo: cliente?.cargo ?? "",
    cpf: mascaraCpf(cliente?.cpf ?? ""),
    rg: cliente?.rg ?? "",
    // A API devolve "yyyy-MM-dd 00:00:00"; o input date quer so os 10 primeiros.
    dataNascimento: (cliente?.dataNascimento ?? "").slice(0, 10),
    // Data do cadastro (criado_em): novo cliente ja vem com hoje, edicao com a
    // data gravada — em ambos os casos da pra corrigir/retroagir.
    dataCadastro: (cliente?.dataCadastro ?? "").slice(0, 10) || hoje(),
    sexo: opcaoValida(cliente?.sexo, SEXOS, ""),
    telefone: mascaraTelefone(cliente?.telefone ?? ""),
    email: cliente?.email ?? "",
    escolaridade: cliente?.escolaridade ?? "",
    estadoCivil: opcaoValida(cliente?.estadoCivil, ESTADOS_CIVIS, ""),
    naturalidade: cliente?.naturalidade ?? "",
    tipoEndereco: opcaoValida(cliente?.tipoEndereco, TIPOS_ENDERECO, "Particular"),
    endereco: cliente?.endereco ?? "",
    bairro: cliente?.bairro ?? "",
    cidade: cliente?.cidade ?? "",
    observacoes: cliente?.observacoes ?? "",
    status: opcaoValida(cliente?.status, STATUS, "Ativo"),
  }));
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [empresas, setEmpresas] = useState<string[]>([]);

  // Sugestoes de empresa: todas as cadastradas, como o dropdown do desktop.
  useEffect(() => {
    listarEmpresas().then(setEmpresas).catch(() => {});
  }, []);

  function campo<K extends keyof ClientePayload>(k: K, v: ClientePayload[K]) {
    setF((atual) => ({ ...atual, [k]: v }));
  }

  async function salvar(e: FormEvent) {
    e.preventDefault();
    setErro("");

    if (!f.nome.trim()) return setErro("Nome e obrigatório.");
    if (!f.empresa.trim()) return setErro("Empresa é obrigatória.");
    if (!f.cargo.trim()) return setErro("Cargo e obrigatório.");
    if (f.cpf && !cpfValido(f.cpf)) return setErro("CPF inválido.");
    const telDigitos = f.telefone.replace(/\D/g, "");
    if (telDigitos && telDigitos.length < 10) return setErro("Telefone deve ter 10 ou 11 dígitos (com DDD).");
    if (f.dataNascimento && f.dataNascimento > hoje())
      return setErro("Data de nascimento não pode ser futura.");
    if (!f.dataCadastro) return setErro("Data do cadastro é obrigatória.");
    if (f.dataCadastro > hoje()) return setErro("Data do cadastro não pode ser futura.");

    setSalvando(true);
    try {
      const payload = {
        ...f,
        cpf: f.cpf.replace(/\D/g, ""),
        telefone: telDigitos,
        email: f.email.trim().toLowerCase(),
      };
      const r = editando
        ? await atualizarCliente(cliente!.idLocal, payload)
        : await criarCliente(payload);
      toast.sucesso(editando ? "Cliente atualizado." : "Cliente cadastrado.");
      onSalvo(r.idLocal, f.nome.trim());
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        onSessaoExpirada();
        return;
      }
      setErro(err instanceof ApiError ? err.message : "Falha ao salvar o cliente.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className={inline ? "flex flex-col" : "fixed inset-0 z-50 flex flex-col bg-spark-page"}>
      {!inline && (
        <header className="flex flex-none items-center justify-between border-b border-spark-line bg-spark-panel px-4 pb-3 pt-[calc(env(safe-area-inset-top)+0.75rem)]">
          <p className="text-[16px] font-semibold text-spark-ink">
            {editando ? "Editar cliente" : "Novo cliente"}
          </p>
          <button
            type="button"
            aria-label="Fechar"
            onClick={onFechar}
            className="flex h-10 w-10 items-center justify-center rounded-sm text-spark-body transition active:bg-spark-hover"
          >
            <X size={20} />
          </button>
        </header>
      )}

      <form
        onSubmit={salvar}
        className={
          inline
            ? "py-1"
            : "flex-1 overflow-y-auto px-4 py-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]"
        }
      >
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-spark-muted">Identificacao</p>

        <label className="mb-3 block">
          <span className={labelCls}>Data do cadastro *</span>
          <input
            type="date"
            className={inputCls}
            max={hoje()}
            value={f.dataCadastro}
            onChange={(e) => campo("dataCadastro", e.target.value)}
          />
        </label>
        <label className="mb-3 block">
          <span className={labelCls}>Nome completo *</span>
          <input className={inputCls} value={f.nome} onChange={(e) => campo("nome", e.target.value)} maxLength={160} />
        </label>
        <label className="mb-3 block">
          <span className={labelCls}>Empresa *</span>
          <input
            className={inputCls}
            value={f.empresa}
            onChange={(e) => campo("empresa", e.target.value)}
            maxLength={160}
            list="empresas-cadastradas"
            placeholder="Toque para ver as cadastradas"
          />
          <datalist id="empresas-cadastradas">
            {empresas.map((e) => (
              <option key={e} value={e} />
            ))}
          </datalist>
        </label>
        <label className="mb-3 block">
          <span className={labelCls}>Cargo *</span>
          <input className={inputCls} value={f.cargo} onChange={(e) => campo("cargo", e.target.value)} maxLength={120} />
        </label>

        <div className="mb-3 grid grid-cols-2 gap-3">
          <label className="block">
            <span className={labelCls}>CPF</span>
            <input
              className={inputCls}
              inputMode="numeric"
              value={f.cpf}
              onChange={(e) => campo("cpf", mascaraCpf(e.target.value))}
              placeholder="000.000.000-00"
            />
          </label>
          <label className="block">
            <span className={labelCls}>RG</span>
            <input className={inputCls} value={f.rg} onChange={(e) => campo("rg", e.target.value)} maxLength={30} />
          </label>
        </div>

        <div className="mb-3 grid grid-cols-2 gap-3">
          <label className="block">
            <span className={labelCls}>Nascimento</span>
            <input type="date" className={inputCls} value={f.dataNascimento} onChange={(e) => campo("dataNascimento", e.target.value)} />
          </label>
          <label className="block">
            <span className={labelCls}>Sexo</span>
            <select className={inputCls} value={f.sexo} onChange={(e) => campo("sexo", e.target.value)}>
              {SEXOS.map((s) => (
                <option key={s} value={s}>{s || "—"}</option>
              ))}
            </select>
          </label>
        </div>

        <p className="mb-3 mt-5 text-xs font-semibold uppercase tracking-wide text-spark-muted">Contato</p>

        <div className="mb-3 grid grid-cols-2 gap-3">
          <label className="block">
            <span className={labelCls}>Telefone</span>
            <input
              className={inputCls}
              inputMode="tel"
              value={f.telefone}
              onChange={(e) => campo("telefone", mascaraTelefone(e.target.value))}
              placeholder="(00) 00000-0000"
            />
          </label>
          <label className="block">
            <span className={labelCls}>E-mail</span>
            <input type="email" className={inputCls} value={f.email} onChange={(e) => campo("email", e.target.value)} maxLength={180} />
          </label>
        </div>

        <p className="mb-3 mt-5 text-xs font-semibold uppercase tracking-wide text-spark-muted">Dados complementares</p>

        <div className="mb-3 grid grid-cols-2 gap-3">
          <label className="block">
            <span className={labelCls}>Escolaridade</span>
            <input className={inputCls} value={f.escolaridade} onChange={(e) => campo("escolaridade", e.target.value)} maxLength={80} />
          </label>
          <label className="block">
            <span className={labelCls}>Estado civil</span>
            <select className={inputCls} value={f.estadoCivil} onChange={(e) => campo("estadoCivil", e.target.value)}>
              {ESTADOS_CIVIS.map((s) => (
                <option key={s} value={s}>{s || "—"}</option>
              ))}
            </select>
          </label>
        </div>

        <label className="mb-3 block">
          <span className={labelCls}>Naturalidade</span>
          <input className={inputCls} value={f.naturalidade} onChange={(e) => campo("naturalidade", e.target.value)} maxLength={120} />
        </label>

        <p className="mb-3 mt-5 text-xs font-semibold uppercase tracking-wide text-spark-muted">Endereço</p>

        <div className="mb-3 grid grid-cols-2 gap-3">
          <label className="block">
            <span className={labelCls}>Tipo de endereço</span>
            <select className={inputCls} value={f.tipoEndereco} onChange={(e) => campo("tipoEndereco", e.target.value)}>
              {TIPOS_ENDERECO.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className={labelCls}>Bairro</span>
            <input className={inputCls} value={f.bairro} onChange={(e) => campo("bairro", e.target.value)} maxLength={120} />
          </label>
        </div>

        <label className="mb-3 block">
          <span className={labelCls}>Endereço</span>
          <input className={inputCls} value={f.endereco} onChange={(e) => campo("endereco", e.target.value)} maxLength={240} />
        </label>
        <label className="mb-3 block">
          <span className={labelCls}>Cidade</span>
          <input className={inputCls} value={f.cidade} onChange={(e) => campo("cidade", e.target.value)} maxLength={120} />
        </label>

        <p className="mb-3 mt-5 text-xs font-semibold uppercase tracking-wide text-spark-muted">Outros</p>

        <label className="mb-3 block">
          <span className={labelCls}>Status</span>
          <select className={inputCls} value={f.status} onChange={(e) => campo("status", e.target.value)}>
            {STATUS.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </label>
        <label className="mb-4 block">
          <span className={labelCls}>Observações</span>
          <textarea
            className={`${inputCls} h-24 resize-none py-2.5`}
            value={f.observacoes}
            onChange={(e) => campo("observacoes", e.target.value)}
          />
        </label>

        {erro && (
          <p role="alert" className="mb-4 rounded-xl border border-spark-danger/20 bg-spark-danger/5 px-4 py-3 text-sm text-spark-danger">
            {erro}
          </p>
        )}

        <button
          type="submit"
          disabled={salvando}
          className="flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-spark-accent hover:bg-spark-accent-strong text-base font-semibold text-white transition active:scale-[0.98] disabled:opacity-60"
        >
          {salvando && <CircleNotch size={20} className="animate-spin" />}
          {salvando ? "Salvando..." : editando ? "Salvar alterações" : "Salvar cliente"}
        </button>
      </form>
    </div>
  );
}
