import { useCallback, useEffect, useState } from "react";
import {
  CalendarPlus,
  UserPlus,
  MagnifyingGlass,
  CalendarBlank,
  Plus,
} from "@phosphor-icons/react";
import {
  listarAgenda,
  listarTarefas,
  pesquisarClientes,
  ApiError,
  LIMITE_MAXIMO,
  type AgendaItem,
  type TarefaItem,
} from "../lib/api";
import { hojeIso, paraIso } from "../lib/datas";
import { TarefaForm } from "../components/TarefaForm";

// Tela Inicio (dashboard do Desktop-1 do Figma): acoes rapidas, os quatro
// indicadores do dia, a agenda de hoje e a lista de tarefas pessoais.

interface Props {
  onSessaoExpirada: () => void;
  onNovaConsulta: () => void;
  onNovoCliente: () => void;
  onBuscarCliente: () => void;
  onAbrirAgenda: () => void;
  refreshSeq?: number;
}

// Janela das "consultas futuras": de amanha ate 90 dias a frente.
const DIAS_FUTURO = 90;

const CANCELADA = /cancel/i;
const CONCLUIDA = /conclu|realiz|baixad/i;

function dataExtenso(iso: string): string {
  const [ano, mes, dia] = iso.split("-").map(Number);
  const texto = new Date(ano, mes - 1, dia).toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

export function InicioScreen({
  onSessaoExpirada,
  onNovaConsulta,
  onNovoCliente,
  onBuscarCliente,
  onAbrirAgenda,
  refreshSeq = 0,
}: Props) {
  const hoje = hojeIso();

  const [agenda, setAgenda] = useState<AgendaItem[]>([]);
  const [tarefas, setTarefas] = useState<TarefaItem[]>([]);
  const [baseClientes, setBaseClientes] = useState<number | null>(null);
  const [novaTarefa, setNovaTarefa] = useState(false);
  const [tarefasSeq, setTarefasSeq] = useState(0);

  const tratarErro = useCallback(
    (err: unknown) => {
      if (err instanceof ApiError && err.status === 401) onSessaoExpirada();
    },
    [onSessaoExpirada],
  );

  // Uma unica chamada cobre hoje + os proximos 90 dias: os quatro indicadores
  // e a lista da agenda saem todos desse mesmo intervalo.
  useEffect(() => {
    const controller = new AbortController();
    const limite = new Date();
    limite.setDate(limite.getDate() + DIAS_FUTURO);

    listarAgenda(hoje, paraIso(limite), controller.signal)
      .then(setAgenda)
      .catch((err) => {
        if (!controller.signal.aborted) tratarErro(err);
      });

    return () => controller.abort();
  }, [hoje, refreshSeq, tratarErro]);

  useEffect(() => {
    const controller = new AbortController();
    listarTarefas(hoje, hoje, controller.signal)
      .then(setTarefas)
      .catch((err) => {
        if (!controller.signal.aborted) tratarErro(err);
      });
    return () => controller.abort();
  }, [hoje, tarefasSeq, refreshSeq, tratarErro]);

  // "Base de clientes": a API nao expoe contagem, entao usamos a busca vazia,
  // que o servidor capa em LIMITE_MAXIMO — dai o "100+" quando bate no teto.
  useEffect(() => {
    const controller = new AbortController();
    pesquisarClientes("", "", controller.signal)
      .then((lista) => setBaseClientes(lista.length))
      .catch((err) => {
        if (!controller.signal.aborted) tratarErro(err);
      });
    return () => controller.abort();
  }, [tratarErro]);

  const doDia = agenda
    .filter((c) => c.data === hoje && !CANCELADA.test(c.status ?? ""))
    .sort((a, b) => (a.horario || "").localeCompare(b.horario || ""));

  const futuras = agenda.filter(
    (c) => c.data > hoje && !CANCELADA.test(c.status ?? ""),
  ).length;

  const concluidas = doDia.filter((c) => CONCLUIDA.test(c.status ?? "")).length;

  // "Horarios": o proximo compromisso ainda por vir hoje (--:-- se nao houver).
  const agora = new Date().toTimeString().slice(0, 5);
  const proximo =
    doDia.find((c) => (c.horario || "") >= agora && !CONCLUIDA.test(c.status ?? "")) ??
    doDia.find((c) => !CONCLUIDA.test(c.status ?? ""));

  const baseTexto =
    baseClientes === null
      ? "—"
      : baseClientes >= LIMITE_MAXIMO
        ? `${LIMITE_MAXIMO}+`
        : String(baseClientes);

  return (
    <div className="px-4 py-4">
      <div className="mb-4">
        <h2 className="text-[26px] font-extrabold leading-tight text-spark-ink">Inicio</h2>
        <p className="text-[13px] text-spark-muted">{dataExtenso(hoje)}</p>
      </div>

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        {/* ── Coluna principal ──────────────────────────────────────── */}
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          {/* Acoes rapidas */}
          <section className="rounded-2xl border border-spark-line bg-spark-panel p-4 shadow-[0_10px_24px_-20px_rgba(28,25,23,0.35)]">
            <h3 className="mb-3 text-[13px] font-semibold text-spark-body">Acoes Rapidas</h3>
            <div className="flex flex-col gap-2.5 sm:flex-row">
              <button
                type="button"
                onClick={onNovaConsulta}
                className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-spark-accent px-4 text-[14px] font-semibold text-white shadow-sm transition hover:bg-spark-accent-strong active:scale-[0.99]"
              >
                <CalendarPlus size={18} weight="bold" />
                Nova Consulta
              </button>
              <button
                type="button"
                onClick={onNovoCliente}
                className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-spark-inputline bg-spark-panel px-4 text-[14px] font-medium text-spark-body transition hover:bg-spark-hover active:scale-[0.99]"
              >
                <UserPlus size={18} />
                Novo Cliente
              </button>
              <button
                type="button"
                onClick={onBuscarCliente}
                className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-spark-inputline bg-spark-panel px-4 text-[14px] font-medium text-spark-body transition hover:bg-spark-hover active:scale-[0.99]"
              >
                <MagnifyingGlass size={18} />
                Buscar Cliente
              </button>
            </div>
          </section>

          {/* Indicadores do dia */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Indicador rotulo="Consultas hoje" valor={String(doDia.length)} />
            <Indicador rotulo="Horarios" valor={proximo?.horario || "--:--"} />
            <Indicador rotulo="Consultas futuras" valor={String(futuras)} cor="text-spark-accent" />
            <Indicador
              rotulo="Consultas concluidas"
              valor={String(concluidas)}
              cor="text-spark-success"
            />
          </div>

          {/* Consultas de hoje */}
          <section className="rounded-2xl border border-spark-line bg-spark-panel p-4 shadow-[0_10px_24px_-20px_rgba(28,25,23,0.35)]">
            <h3 className="mb-3 text-[13px] font-semibold text-spark-body">Consultas hoje</h3>
            {doDia.length === 0 ? (
              <div className="flex flex-col items-center py-10 text-center">
                <CalendarBlank size={44} className="text-spark-ink" />
                <p className="mt-5 text-[13px] text-spark-muted">
                  Nenhuma consulta agendada para hoje
                </p>
                <div className="mt-4 flex flex-wrap justify-center gap-2.5">
                  <button
                    type="button"
                    onClick={onNovaConsulta}
                    className="flex h-10 items-center gap-2 rounded-xl bg-spark-accent px-4 text-[13.5px] font-semibold text-white shadow-sm transition hover:bg-spark-accent-strong active:scale-[0.99]"
                  >
                    <Plus size={16} weight="bold" />
                    Nova Consulta
                  </button>
                  <button
                    type="button"
                    onClick={onAbrirAgenda}
                    className="flex h-10 items-center gap-2 rounded-xl border border-spark-inputline bg-spark-panel px-4 text-[13.5px] font-medium text-spark-body transition hover:bg-spark-hover active:scale-[0.99]"
                  >
                    <CalendarBlank size={16} />
                    Abrir Agenda
                  </button>
                </div>
              </div>
            ) : (
              <ul className="flex flex-col gap-2">
                {doDia.map((c) => (
                  <li key={c.idLocal}>
                    <button
                      type="button"
                      onClick={onAbrirAgenda}
                      className="flex w-full items-center gap-3 rounded-xl border border-spark-line bg-spark-surface px-3 py-2.5 text-left transition hover:bg-spark-hover"
                    >
                      <span className="tabular w-12 shrink-0 text-[13px] font-bold text-spark-accent-strong">
                        {c.horario || "--:--"}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[14px] font-semibold text-spark-ink">
                          {c.clienteNome || "Consulta"}
                        </span>
                        <span className="block truncate text-[12px] text-spark-muted">
                          {[c.motivo, c.local].filter(Boolean).join(" · ") || c.empresa}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        {/* ── Coluna direita ────────────────────────────────────────── */}
        <div className="flex flex-col gap-4 lg:w-[220px] lg:shrink-0">
          {/* Base de clientes */}
          <section className="rounded-2xl border border-spark-line bg-spark-panel p-4 shadow-[0_10px_24px_-20px_rgba(28,25,23,0.35)]">
            <h3 className="text-[13px] font-semibold text-spark-body">Base de clientes</h3>
            <p className="tabular mt-1 font-display text-[32px] font-extrabold leading-none text-spark-ink">
              {baseTexto}
            </p>
          </section>

          {/* Agenda (proximos dias) */}
          <section className="flex min-h-[150px] flex-col rounded-2xl border border-spark-line bg-spark-panel p-4 shadow-[0_10px_24px_-20px_rgba(28,25,23,0.35)]">
            <h3 className="mb-2 text-[13px] font-semibold text-spark-body">Agenda</h3>
            {futuras === 0 ? (
              <p className="my-auto text-center text-[12px] text-spark-faint">
                Nada nos proximos dias
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {agenda
                  .filter((c) => c.data > hoje && !CANCELADA.test(c.status ?? ""))
                  .sort((a, b) => `${a.data}${a.horario}`.localeCompare(`${b.data}${b.horario}`))
                  .slice(0, 4)
                  .map((c) => (
                    <li key={c.idLocal}>
                      <button
                        type="button"
                        onClick={onAbrirAgenda}
                        className="w-full rounded-lg px-1.5 py-1 text-left transition hover:bg-spark-hover"
                      >
                        <span className="tabular block text-[11px] font-semibold text-spark-accent-strong">
                          {c.data.slice(8, 10)}/{c.data.slice(5, 7)} · {c.horario || "--:--"}
                        </span>
                        <span className="block truncate text-[12.5px] text-spark-body">
                          {c.clienteNome || "Consulta"}
                        </span>
                      </button>
                    </li>
                  ))}
              </ul>
            )}
          </section>

          {/* Lista de tarefas pessoais */}
          <section className="flex flex-col items-center rounded-2xl border border-spark-line bg-spark-panel p-4 text-center shadow-[0_10px_24px_-20px_rgba(28,25,23,0.35)]">
            <h3 className="mb-3 w-full text-left text-[13px] font-semibold text-spark-body">
              Lista de tarefas
            </h3>

            {tarefas.length === 0 ? (
              <>
                <button
                  type="button"
                  onClick={() => setNovaTarefa(true)}
                  aria-label="Nova tarefa"
                  className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-spark-ink text-spark-ink transition hover:bg-spark-hover active:scale-95"
                >
                  <Plus size={26} />
                </button>
                <p className="mt-3 text-[12px] text-spark-muted">Nada de tarefas por enquanto</p>
              </>
            ) : (
              <ul className="mb-3 flex w-full flex-col gap-1.5 text-left">
                {tarefas.map((t) => (
                  <li key={t.idLocal} className="rounded-lg bg-spark-surface px-2.5 py-1.5">
                    <span className="block truncate text-[12.5px] font-medium text-spark-ink">
                      {t.titulo}
                    </span>
                    {t.horario && (
                      <span className="tabular block text-[11px] text-spark-muted">{t.horario}</span>
                    )}
                  </li>
                ))}
              </ul>
            )}

            <button
              type="button"
              onClick={() => setNovaTarefa(true)}
              className="mt-4 flex h-9 w-full items-center justify-center gap-1.5 rounded-xl bg-spark-accent px-3 text-[12.5px] font-semibold text-white shadow-sm transition hover:bg-spark-accent-strong active:scale-[0.99]"
            >
              <Plus size={14} weight="bold" />
              Nova tarefa
            </button>
          </section>
        </div>
      </div>

      {novaTarefa && (
        <TarefaForm
          dia={hoje}
          onFechar={() => setNovaTarefa(false)}
          onSalvo={() => {
            setNovaTarefa(false);
            setTarefasSeq((s) => s + 1);
          }}
          onSessaoExpirada={onSessaoExpirada}
        />
      )}
    </div>
  );
}

function Indicador({
  rotulo,
  valor,
  cor = "text-spark-ink",
}: {
  rotulo: string;
  valor: string;
  cor?: string;
}) {
  return (
    <div className="rounded-2xl border border-spark-line bg-spark-panel p-4 shadow-[0_10px_24px_-20px_rgba(28,25,23,0.35)]">
      <p className="truncate text-[12.5px] font-medium text-spark-body">{rotulo}</p>
      <p className={`tabular mt-1.5 font-display text-[32px] font-extrabold leading-none ${cor}`}>
        {valor}
      </p>
    </div>
  );
}
