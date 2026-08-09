import { useState } from "react";
import { MagnifyingGlass, PencilSimple, ArrowRight, Plus, PushPin } from "@phosphor-icons/react";
import type { AgendaItem } from "../lib/api";
import { formatarBr, nomeDiaSemana, hojeIso } from "../lib/datas";

// Item do quadro: consulta (da agenda) OU tarefa pessoal. A flag distingue o
// comportamento de mover/editar e a aparencia do card.
export type QuadroItem = AgendaItem & { ehTarefa?: boolean };

// Quadro Kanban do dia: as consultas do dia fluem por Pendente -> Em andamento
// -> Concluido, com uma raia de Cancelado. Os status reais (compartilhados com
// o desktop) sao agrupados nas 4 colunas; ao mover, gravamos o status canonico.
interface Coluna {
  id: string;
  titulo: string;
  escreve: string; // status gravado ao soltar/mover para esta coluna
  aceita: string[]; // status reais que caem nesta coluna
  ponto: string; // cor do indicador
  chip: string; // classe do chip
}

export const COLUNAS_QUADRO: Coluna[] = [
  {
    id: "pendente",
    titulo: "Pendente",
    escreve: "Agendada",
    aceita: ["Agendada", "Confirmada"],
    ponto: "bg-spark-muted",
    chip: "bg-spark-surface text-spark-body",
  },
  {
    id: "andamento",
    titulo: "Em andamento",
    escreve: "Aguardando",
    aceita: ["Aguardando"],
    ponto: "bg-spark-accent",
    chip: "bg-spark-soft text-spark-accent-strong",
  },
  {
    id: "concluido",
    titulo: "Concluido",
    escreve: "Concluida",
    aceita: ["Concluida", "Baixado"],
    ponto: "bg-spark-success",
    chip: "bg-spark-success/10 text-spark-success",
  },
  {
    id: "cancelado",
    titulo: "Cancelado",
    escreve: "Cancelada",
    aceita: ["Cancelada"],
    ponto: "bg-spark-danger",
    chip: "bg-spark-danger/10 text-spark-danger",
  },
];

function colunaDoItem(status: string): Coluna {
  const s = (status || "").toLowerCase();
  return COLUNAS_QUADRO.find((c) => c.aceita.some((a) => a.toLowerCase() === s)) ?? COLUNAS_QUADRO[0];
}

interface Props {
  dia: string; // yyyy-MM-dd (o dia do quadro)
  itens: QuadroItem[]; // consultas + tarefas do dia, ja ordenadas por horario
  carregando?: boolean;
  movendo: Set<string>; // idLocal com PUT em andamento (mostra opacidade)
  onMover: (item: QuadroItem, novoStatus: string) => void;
  onEditar: (item: QuadroItem) => void;
  onBuscarCliente: (nome: string) => void;
  onAgendar: (dataIso: string) => void;
  onNovaTarefa: () => void;
}

export function AgendaQuadro({
  dia,
  itens,
  carregando,
  movendo,
  onMover,
  onEditar,
  onBuscarCliente,
  onAgendar,
  onNovaTarefa,
}: Props) {
  // Desktop: arrastar. Mobile: menu "Mover". Estados de interacao:
  const [dragId, setDragId] = useState<string | null>(null);
  const [overCol, setOverCol] = useState<string | null>(null);
  const [menuId, setMenuId] = useState<string | null>(null);

  const grupos = COLUNAS_QUADRO.map((col) => ({
    col,
    lista: itens.filter((i) => colunaDoItem(i.status).id === col.id),
  }));

  function soltarNa(col: Coluna) {
    const item = itens.find((i) => i.idLocal === dragId);
    setOverCol(null);
    setDragId(null);
    if (item) onMover(item, col.escreve);
  }

  const rotuloDia = dia === hojeIso() ? "Hoje" : nomeDiaSemana(dia);

  const renderCard = (c: QuadroItem, col: Coluna) => {
    const salvando = movendo.has(c.idLocal);
    const destinos = COLUNAS_QUADRO.filter((x) => x.id !== col.id);
    return (
      <div
        key={c.idLocal}
        draggable={!salvando}
        onDragStart={(e) => {
          setDragId(c.idLocal);
          e.dataTransfer.effectAllowed = "move";
        }}
        onDragEnd={() => {
          setDragId(null);
          setOverCol(null);
        }}
        className={`group relative rounded-xl border bg-spark-panel p-2.5 transition ${
          c.ehTarefa ? "border-spark-soft ring-1 ring-spark-accent/15" : "border-spark-line"
        } ${salvando ? "opacity-50" : ""} ${
          dragId === c.idLocal ? "opacity-40" : ""
        } lg:cursor-grab lg:active:cursor-grabbing`}
      >
        <div className="flex items-start gap-2">
          {c.ehTarefa ? (
            <span className="tabular flex shrink-0 items-center gap-1 rounded-md bg-spark-soft px-1.5 py-0.5 text-[12px] font-bold text-spark-accent-strong">
              <PushPin size={11} weight="fill" />
              {c.horario || "Tarefa"}
            </span>
          ) : (
            <span className="tabular shrink-0 rounded-md bg-spark-surface px-1.5 py-0.5 text-[12px] font-bold text-spark-ink">
              {c.horario || "--:--"}
            </span>
          )}
          <p className="min-w-0 flex-1 truncate pt-0.5 text-[13px] font-semibold text-spark-ink">
            {c.clienteNome || "(sem nome)"}
          </p>
        </div>
        {c.ehTarefa
          ? c.observacoes && (
              <p className="mt-1 truncate text-[11px] text-spark-muted">{c.observacoes}</p>
            )
          : (c.empresa || c.motivo) && (
              <p className="mt-1 truncate text-[11px] text-spark-muted">
                {[c.empresa, c.motivo].filter(Boolean).join(" · ")}
              </p>
            )}
        <div className="mt-2 flex items-center justify-end gap-1">
          {!c.ehTarefa && c.clienteNome && (
            <button
              type="button"
              aria-label={`Buscar ${c.clienteNome}`}
              onClick={() => onBuscarCliente(c.clienteNome)}
              className="flex h-7 w-7 items-center justify-center rounded-sm text-spark-muted transition hover:bg-spark-hover hover:text-spark-body"
            >
              <MagnifyingGlass size={14} />
            </button>
          )}
          <button
            type="button"
            aria-label="Editar consulta"
            onClick={() => onEditar(c)}
            className="flex h-7 w-7 items-center justify-center rounded-sm text-spark-muted transition hover:bg-spark-hover hover:text-spark-body"
          >
            <PencilSimple size={14} />
          </button>
          {/* Mover: apenas no mobile (no desktop e arrastar) */}
          <button
            type="button"
            aria-label="Mover consulta"
            onClick={() => setMenuId((v) => (v === c.idLocal ? null : c.idLocal))}
            className="flex h-7 items-center gap-1 rounded-sm bg-spark-soft px-2 text-[11px] font-semibold text-spark-accent-strong transition active:scale-95 lg:hidden"
          >
            Mover <ArrowRight size={12} weight="bold" />
          </button>
        </div>

        {/* Menu "mover para" (mobile) */}
        {menuId === c.idLocal && (
          <>
            <button
              type="button"
              aria-hidden
              tabIndex={-1}
              className="fixed inset-0 z-10 cursor-default"
              onClick={() => setMenuId(null)}
            />
            <div className="absolute right-2 top-full z-20 mt-1 w-44 overflow-hidden rounded-xl border border-spark-line bg-spark-panel shadow-[0_16px_40px_-16px_rgba(28,25,23,0.5)]">
              <p className="px-3 py-2 text-[10px] font-bold uppercase tracking-wide text-spark-faint">
                Mover para
              </p>
              {destinos.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => {
                    setMenuId(null);
                    onMover(c, d.escreve);
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-[13px] font-medium text-spark-text transition active:bg-spark-hover"
                >
                  <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${d.ponto}`} />
                  {d.titulo}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    );
  };

  return (
    <div>
      {/* Cabecalho do quadro */}
      <div className="mb-1 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-spark-faint">
            Quadro do dia
          </p>
          <p className="truncate font-display text-[17px] font-bold capitalize text-spark-ink">
            {rotuloDia}, {formatarBr(dia)}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={onNovaTarefa}
            className="flex items-center gap-1 rounded-sm border border-spark-inputline bg-spark-panel px-3 py-2 text-[13px] font-semibold text-spark-body transition hover:bg-spark-hover active:scale-95"
          >
            <PushPin size={14} weight="bold" />
            Tarefa
          </button>
          <button
            type="button"
            onClick={() => onAgendar(dia)}
            className="flex items-center gap-1 rounded-sm bg-spark-accent hover:bg-spark-accent-strong px-3.5 py-2 text-[13px] font-semibold text-white transition active:scale-95"
          >
            <Plus size={15} weight="bold" />
            Agendar
          </button>
        </div>
      </div>

      <p className="mb-4 text-[12px] text-spark-muted">
        <span className="hidden lg:inline">Arraste os cartões entre as colunas para mudar o status.</span>
        <span className="lg:hidden">Toque em “Mover” no cartão para mudar o status.</span>
      </p>

      {/* Colunas: empilhadas no mobile, lado a lado (4) no desktop */}
      <div className="flex flex-col gap-3 lg:grid lg:grid-cols-4 lg:items-start lg:gap-3">
        {grupos.map(({ col, lista }) => (
          <div
            key={col.id}
            onDragOver={(e) => {
              e.preventDefault();
              setOverCol(col.id);
            }}
            onDragLeave={() => setOverCol((v) => (v === col.id ? null : v))}
            onDrop={() => soltarNa(col)}
            className={`flex flex-col rounded-2xl border bg-spark-surface p-2.5 transition ${
              overCol === col.id
                ? "border-spark-accent ring-2 ring-spark-accent/20"
                : "border-spark-line"
            }`}
          >
            <div className="mb-2 flex items-center gap-2 px-1">
              <span className={`h-2.5 w-2.5 rounded-full ${col.ponto}`} />
              <p className="text-[13px] font-bold text-spark-text">{col.titulo}</p>
              <span className="ml-auto min-w-5 rounded-full bg-spark-panel px-1.5 py-0.5 text-center text-[11px] font-bold text-spark-body">
                {lista.length}
              </span>
            </div>
            <div className="flex flex-col gap-2">
              {lista.length === 0 && (
                <p className="rounded-xl border border-dashed border-spark-inputline px-3 py-4 text-center text-[12px] text-spark-faint">
                  {carregando ? "Carregando..." : "Nenhuma"}
                </p>
              )}
              {lista.map((c) => renderCard(c, col))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
