import { useState } from "react";
import { Phone, CaretRight, CalendarBlank, WhatsappLogo, PencilSimple, Trash, CircleNotch } from "@phosphor-icons/react";
import {
  detalharCliente,
  excluirCliente,
  ApiError,
  type ClienteResumo,
  type ClienteDetalhe,
} from "../lib/api";
import { numeroWhatsapp, linkWhatsapp } from "../lib/whatsapp";
import { ClienteForm } from "./ClienteForm";

interface Props {
  cliente: ClienteResumo;
  // Dispara depois de editar/excluir para a lista da busca se atualizar.
  onAtualizado?: () => void;
  onSessaoExpirada?: () => void;
}

function Linha({ rotulo, valor }: { rotulo: string; valor?: string }) {
  if (!valor) return null;
  return (
    <p className="text-sm leading-relaxed text-spark-body">
      <span className="text-spark-muted">{rotulo}: </span>
      {valor}
    </p>
  );
}

export function ClienteCard({ cliente, onAtualizado, onSessaoExpirada }: Props) {
  const [aberto, setAberto] = useState(false);
  const [detalhe, setDetalhe] = useState<ClienteDetalhe | null>(null);
  const [carregandoDetalhe, setCarregandoDetalhe] = useState(false);
  const [erroDetalhe, setErroDetalhe] = useState("");
  const [editando, setEditando] = useState(false);
  const [excluindo, setExcluindo] = useState(false);

  async function carregarDetalhe() {
    setCarregandoDetalhe(true);
    setErroDetalhe("");
    try {
      setDetalhe(await detalharCliente(cliente.idLocal));
    } catch {
      setErroDetalhe("Nao foi possivel carregar os detalhes.");
    } finally {
      setCarregandoDetalhe(false);
    }
  }

  async function toggle() {
    const abrindo = !aberto;
    setAberto(abrindo);
    if (!abrindo || detalhe || carregandoDetalhe || !cliente.idLocal) return;
    await carregarDetalhe();
  }

  async function excluir() {
    const nome = cliente.nome || "este cliente";
    if (!window.confirm(`Excluir o cadastro de ${nome}? Ele sai das buscas e da agenda.`)) return;

    setExcluindo(true);
    setErroDetalhe("");
    try {
      await excluirCliente(cliente.idLocal);
      onAtualizado?.();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        onSessaoExpirada?.();
        return;
      }
      setErroDetalhe(err instanceof ApiError ? err.message : "Falha ao excluir o cliente.");
    } finally {
      setExcluindo(false);
    }
  }

  const telefoneDigitos = (cliente.telefone ?? "").replace(/\D/g, "");
  const whatsappNumero = numeroWhatsapp(cliente.telefone);
  const inicial = (cliente.nome ?? "?").trim().charAt(0).toUpperCase() || "?";

  return (
    <li className="overflow-hidden rounded-2xl border border-spark-line bg-spark-panel shadow-[0_10px_24px_-20px_rgba(28,25,23,0.35)]">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={aberto}
        className="flex w-full items-center gap-3 px-4 py-4 text-left transition active:bg-spark-hover"
      >
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-spark-soft text-base font-semibold text-spark-accent-strong">
          {inicial}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-semibold text-spark-ink">
            {cliente.nome || "(sem nome)"}
          </p>
          <p className="truncate text-sm text-spark-muted">
            {[cliente.empresa, cliente.cargo].filter(Boolean).join(" | ") || "Sem empresa"}
          </p>
        </div>
        <CaretRight
          size={16}
          className={`shrink-0 text-spark-faint transition-transform ${aberto ? "rotate-90" : ""}`}
        />
      </button>

      <div className="flex flex-wrap gap-2 px-4 pb-4">
        {cliente.telefone && (
          <a
            href={`tel:${telefoneDigitos}`}
            onClick={(e) => e.stopPropagation()}
            className="flex items-center gap-1.5 rounded-full bg-spark-soft px-3 py-1.5 text-sm font-semibold text-spark-accent-strong transition active:scale-[0.97]"
          >
            <Phone size={15} weight="fill" />
            {cliente.telefone}
          </a>
        )}
        {whatsappNumero && (
          <a
            href={linkWhatsapp(whatsappNumero)}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="flex items-center gap-1.5 rounded-full bg-spark-success/10 px-3 py-1.5 text-sm font-semibold text-spark-success transition active:scale-[0.97]"
          >
            <WhatsappLogo size={15} weight="fill" />
            WhatsApp
          </a>
        )}
        {cliente.cpf && (
          <span className="rounded-full bg-spark-surface px-3 py-1.5 text-sm text-spark-body">
            CPF {cliente.cpf}
          </span>
        )}
        {cliente.idCadastro && (
          <span className="rounded-full bg-spark-surface px-3 py-1.5 text-sm text-spark-body">
            ID {cliente.idCadastro}
          </span>
        )}
      </div>

      {aberto && (
        <div className="border-t border-spark-line px-4 py-4">
          {carregandoDetalhe && (
            <div className="animate-pulse space-y-2">
              <div className="h-3.5 w-3/4 rounded bg-spark-surface" />
              <div className="h-3.5 w-1/2 rounded bg-spark-surface" />
              <div className="h-3.5 w-2/3 rounded bg-spark-surface" />
            </div>
          )}
          {erroDetalhe && <p className="text-sm text-spark-danger">{erroDetalhe}</p>}
          {detalhe && (
            <div className="flex flex-col gap-1">
              <Linha rotulo="E-mail" valor={detalhe.email} />
              <Linha rotulo="RG" valor={detalhe.rg} />
              <Linha rotulo="Estado civil" valor={detalhe.estadoCivil} />
              <Linha rotulo="Endereco" valor={detalhe.endereco} />
              <Linha rotulo="Observacoes" valor={detalhe.observacoes} />

              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => setEditando(true)}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-spark-soft px-3 py-2.5 text-sm font-semibold text-spark-accent-strong transition active:scale-[0.97]"
                >
                  <PencilSimple size={16} />
                  Editar cadastro
                </button>
                <button
                  type="button"
                  onClick={excluir}
                  disabled={excluindo}
                  className="flex items-center justify-center gap-1.5 rounded-xl bg-spark-danger/10 px-4 py-2.5 text-sm font-semibold text-spark-danger transition active:scale-[0.97] disabled:opacity-60"
                >
                  {excluindo ? <CircleNotch size={16} className="animate-spin" /> : <Trash size={16} />}
                  Excluir
                </button>
              </div>

              {detalhe.historico && detalhe.historico.length > 0 && (
                <div className="mt-3">
                  <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-spark-muted">
                    <CalendarBlank size={14} />
                    Ultimas consultas
                  </p>
                  <ul className="flex flex-col gap-2">
                    {detalhe.historico.slice(0, 5).map((h, i) => (
                      <li
                        key={h.idLocal ?? i}
                        className="rounded-xl bg-spark-surface px-3 py-2.5"
                      >
                        <p className="text-sm font-semibold text-spark-accent">
                          {[h.data, h.horario].filter(Boolean).join(" | ") || "Sem data"}
                        </p>
                        <p className="mt-0.5 text-[13px] text-spark-body">
                          {[h.motivo, h.status, h.tipoLaudo].filter(Boolean).join(" | ")}
                        </p>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {editando && detalhe && (
        <ClienteForm
          cliente={detalhe}
          onFechar={() => setEditando(false)}
          onSalvo={() => {
            setEditando(false);
            void carregarDetalhe();
            onAtualizado?.();
          }}
          onSessaoExpirada={() => onSessaoExpirada?.()}
        />
      )}
    </li>
  );
}
