import { useState } from "react";
import { MagnifyingGlass, WhatsappLogo, CaretDown } from "@phosphor-icons/react";
import { detalharCliente, ApiError, type VencimentoItem } from "../lib/api";
import { formatarBr } from "../lib/datas";
import { numeroWhatsapp, linkWhatsapp } from "../lib/whatsapp";

interface Props {
  itens: VencimentoItem[];
  onSessaoExpirada: () => void;
  onBuscarCliente: (nome: string) => void;
  // Modo compacto (dentro do Resumo): mostra so os criticos (<=30d, max 5) e um
  // botao "ver todos". Sem compacto, mostra a lista completa agrupada por faixa.
  compacto?: boolean;
}

const FAIXAS = [
  { titulo: "Vence em ate 30 dias", max: 30 },
  { titulo: "Vence em 31 a 60 dias", max: 60 },
  { titulo: "Vence em 61 a 90 dias", max: 90 },
];

const MAX_COMPACTO = 5;

function primeiroNome(nome: string): string {
  const p = nome.trim().split(/\s+/)[0] ?? "";
  return p.charAt(0).toUpperCase() + p.slice(1).toLowerCase();
}

function corDoPrazo(dias: number): string {
  if (dias <= 30) return "bg-spark-danger/10 text-spark-danger";
  if (dias <= 60) return "bg-spark-soft text-spark-accent-strong";
  return "bg-spark-surface text-spark-body";
}

export function AvisosScreen({ itens, onSessaoExpirada, onBuscarCliente, compacto = false }: Props) {
  const [waCarregando, setWaCarregando] = useState("");
  const [expandido, setExpandido] = useState(false);
  // Telefones ja buscados nesta sessao ("" = cliente sem telefone).
  const [telefones] = useState<Record<string, string>>(() => ({}));

  async function abrirWhatsapp(v: VencimentoItem) {
    if (waCarregando) return;
    setWaCarregando(v.clienteIdLocal);
    try {
      let telefone = telefones[v.clienteIdLocal];
      if (telefone === undefined) {
        const detalhe = await detalharCliente(v.clienteIdLocal);
        telefone = detalhe.telefone ?? "";
        telefones[v.clienteIdLocal] = telefone;
      }
      const numero = numeroWhatsapp(telefone);
      if (!numero) {
        alert("Este cliente nao tem telefone cadastrado.");
        return;
      }
      const texto =
        `Olá ${primeiroNome(v.clienteNome)}, tudo bem? ` +
        `Seu exame ocupacional periódico vence em ${formatarBr(v.vencimentoEm)}. ` +
        `Podemos agendar a renovação?`;
      window.location.href = linkWhatsapp(numero, texto);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        onSessaoExpirada();
        return;
      }
      alert("Nao foi possivel carregar o telefone do cliente.");
    } finally {
      setWaCarregando("");
    }
  }

  function Card({ v }: { v: VencimentoItem }) {
    return (
      <li className="rounded-2xl border border-spark-line bg-spark-panel px-4 py-3.5 shadow-[0_10px_24px_-20px_rgba(28,25,23,0.35)]">
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] font-semibold text-spark-ink">{v.clienteNome}</p>
            <p className="truncate text-[13px] text-spark-muted">
              {[v.empresa, v.cargo].filter(Boolean).join(" | ") || "Sem empresa"}
            </p>
            <p className="mt-1.5 text-[13px] text-spark-body">
              Vence em <span className="font-semibold">{formatarBr(v.vencimentoEm)}</span>
              <span className="text-spark-muted"> (ultima: {formatarBr(v.ultimaConsultaEm)})</span>
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-2">
            <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${corDoPrazo(v.diasRestantes)}`}>
              {v.diasRestantes}d
            </span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                aria-label={`Chamar ${v.clienteNome} no WhatsApp`}
                disabled={Boolean(waCarregando)}
                onClick={() => abrirWhatsapp(v)}
                className={`flex h-9 w-9 items-center justify-center rounded-full bg-spark-success/10 text-spark-success transition active:scale-95 ${
                  waCarregando === v.clienteIdLocal ? "animate-pulse" : ""
                }`}
              >
                <WhatsappLogo size={16} weight="fill" />
              </button>
              <button
                type="button"
                aria-label={`Buscar ${v.clienteNome}`}
                onClick={() => onBuscarCliente(v.clienteNome)}
                className="flex h-9 w-9 items-center justify-center rounded-full bg-spark-soft text-spark-accent-strong transition active:scale-95"
              >
                <MagnifyingGlass size={16} />
              </button>
            </div>
          </div>
        </div>
      </li>
    );
  }

  // ---- Modo compacto: so os criticos (<=30d), sem parede de cards ----
  if (compacto && !expandido) {
    const criticos = itens
      .filter((v) => v.diasRestantes <= 30)
      .sort((a, b) => a.diasRestantes - b.diasRestantes);
    const mostrados = criticos.slice(0, MAX_COMPACTO);
    const restam = itens.length - mostrados.length;

    return (
      <div>
        {mostrados.length > 0 ? (
          <ul className="flex flex-col gap-3">
            {mostrados.map((v) => (
              <Card key={`${v.clienteIdLocal}-${v.vencimentoEm}`} v={v} />
            ))}
          </ul>
        ) : (
          <p className="rounded-2xl border border-dashed border-spark-line px-4 py-4 text-center text-[13px] text-spark-muted">
            Nada urgente nos proximos 30 dias.
          </p>
        )}

        {restam > 0 && (
          <button
            type="button"
            onClick={() => setExpandido(true)}
            className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl border border-spark-line bg-spark-surface py-2.5 text-[13px] font-semibold text-spark-body transition active:scale-[0.99]"
          >
            Ver todos os {itens.length} a vencer
            <CaretDown size={15} weight="bold" />
          </button>
        )}
      </div>
    );
  }

  // ---- Lista completa agrupada por faixa ----
  if (itens.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-spark-line px-4 py-4 text-center text-[13px] text-spark-muted">
        Nenhum vencimento nos proximos 90 dias.
      </p>
    );
  }

  return (
    <div>
      {FAIXAS.map((faixa, i) => {
        const min = i === 0 ? 0 : FAIXAS[i - 1].max + 1;
        const grupo = itens.filter((v) => v.diasRestantes >= min && v.diasRestantes <= faixa.max);
        if (grupo.length === 0) return null;
        return (
          <div key={faixa.max} className="mb-5">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-spark-muted">
              {faixa.titulo} ({grupo.length})
            </p>
            <ul className="flex flex-col gap-3">
              {grupo.map((v) => (
                <Card key={`${v.clienteIdLocal}-${v.vencimentoEm}`} v={v} />
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
