import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CalendarPlus,
  Plus,
  Clock,
  Warning,
  CaretRight,
  Check,
  TrendUp,
  TrendDown,
  Minus,
} from "@phosphor-icons/react";
import {
  listarAgenda,
  listarTarefas,
  ApiError,
  type AgendaItem,
  type TarefaItem,
  type VencimentoItem,
} from "../lib/api";
import { hojeIso, paraIso, formatarBr, somarDias } from "../lib/datas";
import { TarefaForm } from "../components/TarefaForm";

// Tela Início: o que exige atenção HOJE.
//
// A versão anterior abria com saudação por hora do dia, um emoji, um cartão de
// "Ações Rápidas" repetindo o que ja esta na navegacao e quatro numeros grandes
// sem ponto de comparacao — inclusive uma "Base de clientes" que na verdade era
// o teto da busca (a API nao expoe contagem), e que custava uma varredura da
// base a cada montagem so para exibir "100+".
//
// Agora a primeira linha e a data e um resumo factual do dia, e o corpo e a
// agenda de hoje. O que exige acao (vencimentos, tarefas) fica no trilho.

interface Props {
  onSessaoExpirada: () => void;
  onNovaConsulta: () => void;
  onAbrirAgenda: () => void;
  // Recebe o nome: abre a aba de busca ja com o cliente pesquisado.
  onBuscarCliente: (nome: string) => void;
  onAbrirAvisos: () => void;
  // Vem do App, que ja carrega os vencimentos para o sino de notificacoes —
  // nenhuma chamada nova de API por causa desta tela.
  vencimentos: VencimentoItem[];
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
  });
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

function plural(n: number, singular: string, plural: string): string {
  return `${n} ${n === 1 ? singular : plural}`;
}

export function InicioScreen({
  onSessaoExpirada,
  onNovaConsulta,
  onAbrirAgenda,
  onBuscarCliente,
  onAbrirAvisos,
  vencimentos,
  refreshSeq = 0,
}: Props) {
  const hoje = hojeIso();

  const [agenda, setAgenda] = useState<AgendaItem[]>([]);
  // Passado recente: existe SO para dar referencia aos indicadores. Numero de
  // painel sem ponto de comparacao e enfeite — "31 consultas" nao diz se a
  // semana foi cheia ou vazia sem saber quanto foi a anterior.
  const [passado, setPassado] = useState<AgendaItem[] | null>(null);
  const [tarefas, setTarefas] = useState<TarefaItem[]>([]);
  const [novaTarefa, setNovaTarefa] = useState(false);
  const [tarefasSeq, setTarefasSeq] = useState(0);

  const tratarErro = useCallback(
    (err: unknown) => {
      if (err instanceof ApiError && err.status === 401) onSessaoExpirada();
    },
    [onSessaoExpirada],
  );

  // Uma unica chamada cobre hoje + os proximos 90 dias.
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

  // 13 dias anteriores: cobre as duas janelas de 7 dias que os indicadores
  // comparam entre si (a atual inclui hoje, que ja vem da chamada acima).
  useEffect(() => {
    const controller = new AbortController();
    listarAgenda(somarDias(hoje, -13), somarDias(hoje, -1), controller.signal)
      .then(setPassado)
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

  const doDia = agenda
    .filter((c) => c.data === hoje && !CANCELADA.test(c.status ?? ""))
    .sort((a, b) => (a.horario || "").localeCompare(b.horario || ""));

  const proximosDias = agenda
    .filter((c) => c.data > hoje && !CANCELADA.test(c.status ?? ""))
    .sort((a, b) => `${a.data}${a.horario}`.localeCompare(`${b.data}${b.horario}`));

  // Proxima consulta ainda por vir hoje (ou a primeira em aberto, se o horario
  // ja passou mas ninguem deu baixa).
  const agora = new Date().toTimeString().slice(0, 5);
  const emAberto = doDia.filter((c) => !CONCLUIDA.test(c.status ?? ""));
  const proxima = emAberto.find((c) => (c.horario || "") >= agora) ?? emAberto[0];

  const criticos = vencimentos.filter((v) => v.diasRestantes <= 30);

  // ── Indicadores ────────────────────────────────────────────────────────
  // Cada um so aparece com a referencia ao lado. As duas janelas comparadas
  // sao ambas do passado (7 dias contra os 7 anteriores): comparar agendamento
  // futuro com realizado passado seria confrontar grandezas diferentes.
  const indicadores = useMemo(() => {
    const naoCancelada = (c: AgendaItem) => !CANCELADA.test(c.status ?? "");
    const entre = (lista: AgendaItem[], de: string, ate: string) =>
      lista.filter((c) => c.data >= de && c.data <= ate && naoCancelada(c)).length;

    const feitasHoje = doDia.filter((c) => CONCLUIDA.test(c.status ?? "")).length;

    if (passado === null) return { feitasHoje, semana: null, anterior: null, proximos7: null };

    // Janela recente inclui hoje (vem de `agenda`); a anterior e so passado.
    const semana = entre(passado, somarDias(hoje, -6), somarDias(hoje, -1)) + doDia.length;
    const anterior = entre(passado, somarDias(hoje, -13), somarDias(hoje, -7));
    const proximos7 = entre(agenda, somarDias(hoje, 1), somarDias(hoje, 7));

    return { feitasHoje, semana, anterior, proximos7 };
  }, [agenda, passado, doDia, hoje]);

  // Resumo factual do dia, no lugar da saudacao.
  const resumo = [
    doDia.length === 0 ? "Nenhuma consulta hoje" : plural(doDia.length, "consulta", "consultas"),
    proxima?.horario ? `próxima às ${proxima.horario}` : null,
    criticos.length > 0 ? `${plural(criticos.length, "laudo", "laudos")} vencendo` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="px-4 py-4 lg:px-0 lg:py-2">
      {/* ── Cabeçalho: data + resumo do dia, sem moldura ───────────────── */}
      <header className="mb-5 flex flex-wrap items-end justify-between gap-3 border-b border-spark-line pb-4 lg:mb-7">
        <div className="min-w-0">
          <h1 className="text-[21px] font-bold leading-tight text-spark-ink lg:text-[27px]">
            {dataExtenso(hoje)}
          </h1>
          <p className="mt-1 text-[13px] text-spark-body lg:text-[14px]">{resumo}</p>
        </div>
        <button
          type="button"
          onClick={onNovaConsulta}
          className="flex h-10 shrink-0 items-center gap-2 rounded-xl bg-spark-accent px-4 text-[13.5px] font-semibold text-white transition hover:bg-spark-accent-strong active:scale-[0.99] lg:h-11 lg:px-5"
        >
          <CalendarPlus size={17} weight="bold" />
          Nova consulta
        </button>
      </header>

      {/* ── Indicadores: sempre com a referência ao lado ────────────────
          Faixa dividida por réguas, não quatro cartões. */}
      <div className="mb-6 grid grid-cols-3 divide-x divide-spark-line border-b border-spark-line pb-4 lg:mb-7">
        <Indicador
          rotulo="Hoje"
          valor={doDia.length === 0 ? "—" : `${indicadores.feitasHoje}/${doDia.length}`}
          referencia={doDia.length === 0 ? "sem consultas" : "concluídas"}
          progresso={doDia.length > 0 ? indicadores.feitasHoje / doDia.length : undefined}
        />
        <Indicador
          rotulo="Últimos 7 dias"
          valor={indicadores.semana === null ? "—" : String(indicadores.semana)}
          referencia={
            indicadores.semana === null || indicadores.anterior === null
              ? "carregando"
              : `${indicadores.anterior} nos 7 anteriores`
          }
          variacao={
            indicadores.semana !== null && indicadores.anterior !== null
              ? { atual: indicadores.semana, base: indicadores.anterior }
              : undefined
          }
        />
        <Indicador
          rotulo="Próximos 7 dias"
          valor={indicadores.proximos7 === null ? "—" : String(indicadores.proximos7)}
          referencia={
            indicadores.semana === null
              ? "carregando"
              : `contra ${indicadores.semana} na última semana`
          }
        />
      </div>

      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start lg:gap-7">
        {/* ── Coluna principal: a agenda de hoje ──────────────────────── */}
        <section className="lg:col-start-1">
          <Titulo>Hoje</Titulo>

          {doDia.length === 0 ? (
            <p className="rounded-xl border border-dashed border-spark-inputline px-4 py-8 text-center text-[13px] text-spark-muted">
              Nenhuma consulta agendada para hoje.
            </p>
          ) : (
            <ol className="flex flex-col gap-2">
              {doDia.map((c) => {
                const ehProxima = c.idLocal === proxima?.idLocal;
                const feita = CONCLUIDA.test(c.status ?? "");
                return (
                  <li key={c.idLocal}>
                    <button
                      type="button"
                      onClick={onAbrirAgenda}
                      className={`relative flex w-full items-center gap-3 overflow-hidden rounded-xl border px-3 py-2.5 text-left transition lg:gap-4 lg:px-4 lg:py-3 ${
                        ehProxima
                          ? "border-spark-accent/40 bg-spark-soft/50"
                          : "border-spark-line bg-spark-panel hover:bg-spark-hover"
                      }`}
                    >
                      {ehProxima && (
                        <span className="absolute inset-y-0 left-0 w-1 bg-spark-accent" aria-hidden="true" />
                      )}
                      <span
                        className={`tabular w-12 shrink-0 text-[14px] font-bold lg:w-14 lg:text-[15px] ${
                          ehProxima ? "text-spark-accent-strong" : "text-spark-body"
                        } ${feita ? "line-through opacity-60" : ""}`}
                      >
                        {c.horario || "--:--"}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span
                          className={`block truncate text-[14px] font-semibold text-spark-ink ${
                            feita ? "opacity-60" : ""
                          }`}
                        >
                          {c.clienteNome || "Consulta"}
                        </span>
                        <span className="block truncate text-[12px] text-spark-muted">
                          {[c.motivo, c.local, c.profissionalSala].filter(Boolean).join(" · ") ||
                            c.empresa ||
                            "Sem detalhes"}
                        </span>
                      </span>
                      {feita ? (
                        <Check size={16} weight="bold" className="shrink-0 text-spark-success" />
                      ) : ehProxima ? (
                        <span className="flex shrink-0 items-center gap-1 text-[11px] font-bold uppercase tracking-wide text-spark-accent-strong">
                          <Clock size={13} weight="fill" />
                          Próxima
                        </span>
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ol>
          )}
        </section>

        {/* ── Trilho: o que exige ação ────────────────────────────────── */}
        <div className="mt-7 flex flex-col gap-6 lg:col-start-2 lg:mt-0 lg:sticky lg:top-2">
          {criticos.length > 0 && (
            <section>
              <Titulo
                acao={criticos.length > 3 ? { texto: "Ver todos", onClick: onAbrirAvisos } : undefined}
              >
                <Warning size={14} weight="fill" className="text-spark-danger" />
                Vencendo em 30 dias
              </Titulo>
              <ul className="flex flex-col gap-1.5">
                {criticos.slice(0, 3).map((v) => (
                  <li key={`${v.clienteIdLocal}-${v.vencimentoEm}`}>
                    <button
                      type="button"
                      onClick={() => onBuscarCliente(v.clienteNome)}
                      className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition hover:bg-spark-hover"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-medium text-spark-ink">
                          {v.clienteNome}
                        </span>
                        <span className="block truncate text-[11.5px] text-spark-muted">
                          {v.empresa || "Sem empresa"}
                        </span>
                      </span>
                      <span
                        className={`tabular shrink-0 text-[11.5px] font-bold ${
                          v.diasRestantes <= 0 ? "text-spark-danger" : "text-spark-body"
                        }`}
                      >
                        {v.diasRestantes <= 0 ? "vencido" : `${v.diasRestantes}d`}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Tarefas pessoais do dia */}
          <section>
            <Titulo acao={{ texto: "Nova", onClick: () => setNovaTarefa(true) }}>Tarefas</Titulo>
            {tarefas.length === 0 ? (
              <button
                type="button"
                onClick={() => setNovaTarefa(true)}
                className="flex w-full items-center gap-2 rounded-lg border border-dashed border-spark-inputline px-3 py-2.5 text-left text-[12.5px] text-spark-muted transition hover:bg-spark-hover"
              >
                <Plus size={14} weight="bold" />
                Nada para hoje — adicionar tarefa
              </button>
            ) : (
              <ul className="flex flex-col gap-1">
                {tarefas.map((t) => (
                  <li
                    key={t.idLocal}
                    className="flex items-center gap-2 rounded-lg bg-spark-surface px-2.5 py-1.5"
                  >
                    {t.horario && (
                      <span className="tabular shrink-0 text-[11.5px] font-bold text-spark-accent-strong">
                        {t.horario}
                      </span>
                    )}
                    <span className="truncate text-[12.5px] text-spark-body">{t.titulo}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Próximos dias */}
          <section>
            <Titulo acao={{ texto: "Abrir agenda", onClick: onAbrirAgenda }}>Próximos dias</Titulo>
            {proximosDias.length === 0 ? (
              <p className="px-2 text-[12.5px] text-spark-muted">Nada nos próximos dias.</p>
            ) : (
              <ul className="flex flex-col gap-1">
                {proximosDias.slice(0, 4).map((c) => (
                  <li key={c.idLocal}>
                    <button
                      type="button"
                      onClick={onAbrirAgenda}
                      className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition hover:bg-spark-hover"
                    >
                      <span className="tabular shrink-0 text-[11.5px] font-semibold text-spark-body">
                        {formatarBr(c.data).slice(0, 5)}
                      </span>
                      <span className="tabular shrink-0 text-[11.5px] text-spark-muted">
                        {c.horario || "--:--"}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-[12.5px] text-spark-ink">
                        {c.clienteNome || "Consulta"}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
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

// Indicador com referencia obrigatoria: o numero grande nunca aparece sozinho.
// `variacao` desenha a seta e o percentual contra a base; `progresso` desenha a
// barra de avanco (usado no "X de Y concluidas" do dia).
function Indicador({
  rotulo,
  valor,
  referencia,
  variacao,
  progresso,
}: {
  rotulo: string;
  valor: string;
  referencia: string;
  variacao?: { atual: number; base: number };
  progresso?: number;
}) {
  // Sem base nao ha percentual honesto: mostramos "novo" em vez de dividir por 0.
  const pct =
    variacao && variacao.base > 0
      ? Math.round(((variacao.atual - variacao.base) / variacao.base) * 100)
      : null;
  const Seta = pct === null ? Minus : pct > 0 ? TrendUp : pct < 0 ? TrendDown : Minus;
  const corSeta =
    pct === null || pct === 0 ? "text-spark-muted" : pct > 0 ? "text-spark-success" : "text-spark-body";

  return (
    <div className="px-3 first:pl-0 last:pr-0">
      <p className="truncate text-[10.5px] font-bold uppercase tracking-[0.08em] text-spark-faint">
        {rotulo}
      </p>
      <p className="tabular mt-1 font-display text-[26px] font-bold leading-none text-spark-ink lg:text-[30px]">
        {valor}
      </p>

      {progresso !== undefined && (
        <div className="mt-2 h-1 overflow-hidden rounded-sm bg-spark-surface">
          <div
            className="h-full rounded-sm bg-spark-accent transition-[width] duration-500"
            style={{ width: `${Math.round(progresso * 100)}%` }}
          />
        </div>
      )}

      <p className="mt-1.5 flex items-center gap-1 truncate text-[11.5px] text-spark-muted">
        {variacao && (
          <span className={`flex shrink-0 items-center gap-0.5 font-bold ${corSeta}`}>
            <Seta size={12} weight="bold" />
            {pct === null ? "" : `${pct > 0 ? "+" : ""}${pct}%`}
          </span>
        )}
        <span className="truncate">{referencia}</span>
      </p>
    </div>
  );
}

// Cabecalho de secao: regua + rotulo. Substitui a moldura de cartao que envolvia
// cada bloco — num painel denso a linha ja separa, e devolve o espaco que os
// 28px de padding consumiam.
function Titulo({
  children,
  acao,
}: {
  children: React.ReactNode;
  acao?: { texto: string; onClick: () => void };
}) {
  return (
    <div className="mb-2.5 flex items-center gap-1.5 border-b border-spark-line pb-1.5">
      <h2 className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.08em] text-spark-body">
        {children}
      </h2>
      {acao && (
        <button
          type="button"
          onClick={acao.onClick}
          className="ml-auto flex items-center gap-0.5 text-[11.5px] font-semibold text-spark-accent-strong transition hover:brightness-90"
        >
          {acao.texto}
          <CaretRight size={12} weight="bold" />
        </button>
      )}
    </div>
  );
}
