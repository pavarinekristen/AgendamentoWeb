import { useEffect, useMemo, useState } from "react";
import {
  CaretLeft,
  CaretRight,
  CalendarCheck,
  CalendarBlank,
  Kanban,
  GridFour,
  CircleNotch,
  MapPin,
  MagnifyingGlass,
  Plus,
  PencilSimple,
  Clock,
} from "@phosphor-icons/react";
import {
  listarAgenda,
  atualizarConsulta,
  listarProfissionaisSalas,
  listarTarefas,
  moverTarefa,
  ApiError,
  type AgendaItem,
  type ProfissionalSala,
  type TarefaItem,
} from "../lib/api";
import { ConsultaForm } from "../components/ConsultaForm";
import { AgendaQuadro, type QuadroItem } from "../components/AgendaQuadro";
import { AgendaSemana } from "../components/AgendaSemana";
import { statusInfo } from "../lib/status";
import { TarefaForm } from "../components/TarefaForm";
import { SkeletonList } from "../components/Skeleton";
import { useToast } from "../components/Toast";
import {
  MESES,
  DIAS_SEMANA,
  gradeDoMes,
  chaveMes,
  hojeIso,
  formatarBr,
  nomeDiaSemana,
  inicioSemana,
  somarDias,
} from "../lib/datas";

interface Props {
  onSessaoExpirada: () => void;
  onBuscarCliente: (nome: string) => void;
  // Leva para a secao Agendar com o dia selecionado (agendamento e separado).
  onAgendar: (dataIso: string) => void;
  // Avisa o App que a agenda mudou (editar/excluir consulta) para as outras
  // telas montadas (ex.: Laudos) rebuscarem e nao ficarem com dado obsoleto.
  onDadosAlterados?: () => void;
  // Incrementado quando algo e agendado fora desta tela: invalida o cache.
  refreshSeq?: number;
}

const porHorario = (a: AgendaItem, b: AgendaItem) => (a.horario || "").localeCompare(b.horario || "");

type Vista = "calendario" | "semana" | "quadro";

// Estado do formulario de consulta: edicao de uma existente, ou criacao a
// partir de um slot vazio da grade da semana (dia e hora ja preenchidos).
type FormState =
  | { modo: "editar"; item: AgendaItem }
  | { modo: "criar"; data: string; horario: string };

export function AgendaScreen({
  onSessaoExpirada,
  onBuscarCliente,
  onAgendar,
  onDadosAlterados,
  refreshSeq = 0,
}: Props) {
  const hoje = hojeIso();
  const agora = new Date();
  const [ano, setAno] = useState(agora.getFullYear());
  const [mes, setMes] = useState(agora.getMonth());
  const [selecionado, setSelecionado] = useState(hoje);
  const [cache, setCache] = useState<Record<string, AgendaItem[]>>({});
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");
  // Formulario de consulta: null = fechado. Edicao abre com a consulta; a grade
  // da semana abre em modo criacao ja com dia e hora do slot clicado.
  const [form, setForm] = useState<FormState | null>(null);
  // Alternador de visao: mes (planejar) x semana (encaixar horario) x quadro
  // Kanban (operar o dia de hoje).
  const [vista, setVista] = useState<Vista>("calendario");
  // Semana visivel da grade de horarios, navegavel sem mexer no mes.
  const [semanaInicio, setSemanaInicio] = useState(() => inicioSemana(hojeIso()));
  const [cacheSemana, setCacheSemana] = useState<Record<string, AgendaItem[]>>({});
  const [carregandoSemana, setCarregandoSemana] = useState(false);
  // Lista de profissionais/salas: usada para reconstruir o payload ao mover um
  // card (a agenda so traz o NOME do profissional; casamos pelo nome -> id).
  const [profissionais, setProfissionais] = useState<ProfissionalSala[]>([]);
  const [movendo, setMovendo] = useState<Set<string>>(() => new Set());
  // Tarefas pessoais (agenda particular) do mes visivel + editor.
  const [tarefas, setTarefas] = useState<TarefaItem[]>([]);
  const [tarefaSeq, setTarefaSeq] = useState(0);
  const [tarefaAberta, setTarefaAberta] = useState(false);
  const [tarefaEditando, setTarefaEditando] = useState<TarefaItem | null>(null);
  const toast = useToast();

  const chave = chaveMes(ano, mes);
  const celulas = useMemo(() => gradeDoMes(ano, mes), [ano, mes]);

  // Consulta agendada em outra secao: derruba o cache para rebuscar o mes.
  useEffect(() => {
    if (refreshSeq > 0) setCache({});
  }, [refreshSeq]);

  // Profissionais/salas: carregados uma vez para o "mover" do quadro conseguir
  // reconstruir o payload do PUT sem apagar o vinculo do profissional.
  useEffect(() => {
    const controller = new AbortController();
    listarProfissionaisSalas(controller.signal)
      .then(setProfissionais)
      .catch(() => {});
    return () => controller.abort();
  }, []);

  // Tarefas pessoais do mes visivel (recarrega ao salvar/excluir ou refresh).
  useEffect(() => {
    const controller = new AbortController();
    const de = `${chave}-01`;
    const ultimoDia = new Date(ano, mes + 1, 0).getDate();
    const ate = `${chave}-${String(ultimoDia).padStart(2, "0")}`;
    listarTarefas(de, ate, controller.signal)
      .then(setTarefas)
      .catch(() => {});
    return () => controller.abort();
  }, [chave, ano, mes, refreshSeq, tarefaSeq]);

  useEffect(() => {
    if (cache[chave]) return;

    const controller = new AbortController();
    setCarregando(true);
    setErro("");

    const de = `${chave}-01`;
    const ultimoDia = new Date(ano, mes + 1, 0).getDate();
    const ate = `${chave}-${String(ultimoDia).padStart(2, "0")}`;

    listarAgenda(de, ate, controller.signal)
      .then((itens) => setCache((c) => ({ ...c, [chave]: itens })))
      .catch((err) => {
        if (controller.signal.aborted) return;
        if (err instanceof ApiError && err.status === 401) {
          onSessaoExpirada();
          return;
        }
        setErro("Não foi possível carregar a agenda deste mês.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setCarregando(false);
      });

    return () => controller.abort();
  }, [chave, ano, mes, cache, onSessaoExpirada]);

  // Grade da semana: intervalo proprio, e nao um recorte do cache mensal — uma
  // semana cruza a virada do mes e precisaria dos dois meses carregados.
  useEffect(() => {
    if (vista !== "semana" || cacheSemana[semanaInicio]) return;

    const controller = new AbortController();
    setCarregandoSemana(true);
    setErro("");

    listarAgenda(semanaInicio, somarDias(semanaInicio, 6), controller.signal)
      .then((itens) => setCacheSemana((c) => ({ ...c, [semanaInicio]: itens })))
      .catch((err) => {
        if (controller.signal.aborted) return;
        if (err instanceof ApiError && err.status === 401) {
          onSessaoExpirada();
          return;
        }
        setErro("Não foi possível carregar a semana.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setCarregandoSemana(false);
      });

    return () => controller.abort();
  }, [vista, semanaInicio, cacheSemana, onSessaoExpirada]);

  const itensSemana = useMemo(
    () => cacheSemana[semanaInicio] ?? [],
    [cacheSemana, semanaInicio],
  );

  const porDia = useMemo(() => {
    const mapa = new Map<string, AgendaItem[]>();
    for (const item of cache[chave] ?? []) {
      const lista = mapa.get(item.data);
      if (lista) lista.push(item);
      else mapa.set(item.data, [item]);
    }
    return mapa;
  }, [cache, chave]);

  const doDia = useMemo(
    () => [...(porDia.get(selecionado) ?? [])].sort(porHorario),
    [porDia, selecionado],
  );
  const consultasHoje = useMemo(
    () => [...(porDia.get(hoje) ?? [])].sort(porHorario),
    [porDia, hoje],
  );

  // Itens do quadro do dia: consultas de hoje + tarefas de hoje (convertidas,
  // marcadas com ehTarefa para o card/mover se comportarem diferente).
  const itensQuadro = useMemo<QuadroItem[]>(() => {
    const tarefasHoje: QuadroItem[] = tarefas
      .filter((t) => t.data === hoje)
      .map((t) => ({
        idLocal: t.idLocal,
        data: t.data,
        horario: t.horario,
        clienteNome: t.titulo,
        clienteIdLocal: "",
        empresa: "",
        cargo: "",
        motivo: "",
        status: t.status,
        profissionalSala: "",
        local: "",
        tipoLaudo: "",
        observacoes: t.observacoes,
        ehTarefa: true,
      }));
    return [...consultasHoje, ...tarefasHoje].sort(porHorario);
  }, [consultasHoje, tarefas, hoje]);

  // Proximos dias com consulta, a partir do dia selecionado (max. 5 dias).
  const proximos = useMemo(() => {
    const mapa = new Map<string, AgendaItem[]>();
    for (const item of cache[chave] ?? []) {
      if (item.data <= selecionado) continue;
      const lista = mapa.get(item.data);
      if (lista) lista.push(item);
      else mapa.set(item.data, [item]);
    }
    return [...mapa.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(0, 5)
      .map(([dia, itens]) => [dia, [...itens].sort(porHorario)] as [string, AgendaItem[]]);
  }, [cache, chave, selecionado]);

  const vendoMesAtual = hoje.startsWith(chave);

  function mudarMes(delta: number) {
    const alvo = new Date(ano, mes + delta, 1);
    setAno(alvo.getFullYear());
    setMes(alvo.getMonth());
  }

  function voltarParaHoje() {
    const d = new Date();
    setAno(d.getFullYear());
    setMes(d.getMonth());
    setSelecionado(hoje);
  }

  function atualizarAgenda() {
    setCacheSemana({});
    setCache((c) => {
      const novo = { ...c };
      delete novo[chave];
      return novo;
    });
  }

  function aposSalvar() {
    setForm(null);
    // A consulta salva pode ter caido em qualquer semana (o formulario deixa
    // trocar a data), entao a grade inteira e invalidada, nao so a visivel.
    setCacheSemana({});
    // Invalida o cache do mes visivel: o proximo render rebusca na API.
    setCache((c) => {
      const novo = { ...c };
      delete novo[chave];
      return novo;
    });
    // Propaga para o App: Laudos (e demais telas montadas) rebuscam, senao a
    // consulta editada/excluida continua aparecendo la com dado velho.
    onDadosAlterados?.();
  }

  // Ao entrar no quadro, garante que o mes carregado e o de hoje (o quadro e
  // sempre "do dia"), senao as consultas de hoje nao estariam no cache.
  function abrirQuadro() {
    voltarParaHoje();
    setVista("quadro");
  }

  // A semana abre sempre na do dia selecionado no mes: o usuario acabou de
  // apontar um dia no calendario, a grade tem que cair nele.
  function abrirSemana() {
    setSemanaInicio(inicioSemana(selecionado));
    setVista("semana");
  }

  // Mover um card do quadro = mudar o status da consulta (PUT). Atualizacao
  // otimista: o card anda na hora e volta se a API falhar.
  async function moverConsulta(item: AgendaItem, novoStatus: string) {
    if ((item.status || "") === novoStatus) return;

    // Salvaguarda: se a consulta tem profissional mas nao conseguimos casar o
    // id (lista ainda carregando ou nome divergente), nao arriscamos apagar o
    // vinculo num PUT — abrimos o editor completo.
    if (item.profissionalSala && !profissionais.some((p) => p.nome === item.profissionalSala)) {
      toast.info("Abra a consulta para mudar o status (vinculo de profissional).");
      setForm({ modo: "editar", item });
      return;
    }

    const anterior = item.status;
    const aplicar = (status: string) =>
      setCache((c) => ({
        ...c,
        [chave]: (c[chave] ?? []).map((i) =>
          i.idLocal === item.idLocal ? { ...i, status } : i,
        ),
      }));

    aplicar(novoStatus); // otimista
    setMovendo((s) => new Set(s).add(item.idLocal));
    try {
      const prof = profissionais.find((p) => p.nome === item.profissionalSala);
      await atualizarConsulta(item.idLocal, {
        clienteIdLocal: item.clienteIdLocal,
        data: item.data,
        horario: item.horario,
        local: item.local,
        profissionalSalaIdLocal: prof?.idLocal ?? "",
        status: novoStatus,
        motivo: item.motivo || "Admissao",
        trabalhaArmado: item.tipoLaudo === "Com arma",
        observacoes: item.observacoes ?? "",
      });
    } catch (err) {
      aplicar(anterior); // desfaz
      if (err instanceof ApiError && err.status === 401) {
        onSessaoExpirada();
        return;
      }
      toast.erro(err instanceof ApiError ? err.message : "Não foi possível mover a consulta.");
    } finally {
      setMovendo((s) => {
        const n = new Set(s);
        n.delete(item.idLocal);
        return n;
      });
    }
  }

  // Mover um card do quadro: ramifica entre consulta (API de consulta) e
  // tarefa (API de tarefa). Ambas com atualizacao otimista.
  function moverItem(item: QuadroItem, novoStatus: string) {
    if ((item.status || "") === novoStatus) return;
    if (item.ehTarefa) {
      moverTarefaStatus(item, novoStatus);
      return;
    }
    moverConsulta(item, novoStatus);
  }

  async function moverTarefaStatus(item: QuadroItem, novoStatus: string) {
    const anterior = item.status;
    const aplicar = (status: string) =>
      setTarefas((ts) => ts.map((t) => (t.idLocal === item.idLocal ? { ...t, status } : t)));

    aplicar(novoStatus); // otimista
    setMovendo((s) => new Set(s).add(item.idLocal));
    try {
      await moverTarefa(item.idLocal, novoStatus);
    } catch (err) {
      aplicar(anterior); // desfaz
      if (err instanceof ApiError && err.status === 401) {
        onSessaoExpirada();
        return;
      }
      toast.erro(err instanceof ApiError ? err.message : "Não foi possível mover a tarefa.");
    } finally {
      setMovendo((s) => {
        const n = new Set(s);
        n.delete(item.idLocal);
        return n;
      });
    }
  }

  // Editar um card: tarefa abre o mini-editor; consulta abre o formulario.
  function editarItem(item: QuadroItem) {
    if (item.ehTarefa) {
      const t = tarefas.find((x) => x.idLocal === item.idLocal);
      if (t) {
        setTarefaEditando(t);
        setTarefaAberta(true);
      }
      return;
    }
    setForm({ modo: "editar", item });
  }

  function novaTarefa() {
    setTarefaEditando(null);
    setTarefaAberta(true);
  }

  return (
    <div className="px-4 py-4 lg:px-0 lg:py-2">
      {/* Alternador: Calendario (planejar) x Quadro do dia (operar) */}
      <div className="mb-4 inline-flex rounded-xl border border-spark-line bg-spark-surface p-1">
        <button
          type="button"
          onClick={() => setVista("calendario")}
          aria-pressed={vista === "calendario"}
          className={`flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-[13px] font-semibold transition ${
            vista === "calendario"
              ? "bg-spark-panel text-spark-accent-strong shadow-sm"
              : "text-spark-muted hover:text-spark-body"
          }`}
        >
          <CalendarBlank size={16} weight={vista === "calendario" ? "fill" : "regular"} />
          Mes
        </button>
        <button
          type="button"
          onClick={abrirSemana}
          aria-pressed={vista === "semana"}
          className={`flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-[13px] font-semibold transition ${
            vista === "semana"
              ? "bg-spark-panel text-spark-accent-strong shadow-sm"
              : "text-spark-muted hover:text-spark-body"
          }`}
        >
          <GridFour size={16} weight={vista === "semana" ? "fill" : "regular"} />
          Semana
        </button>
        <button
          type="button"
          onClick={abrirQuadro}
          aria-pressed={vista === "quadro"}
          className={`flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-[13px] font-semibold transition ${
            vista === "quadro"
              ? "bg-spark-panel text-spark-accent-strong shadow-sm"
              : "text-spark-muted hover:text-spark-body"
          }`}
        >
          <Kanban size={16} weight={vista === "quadro" ? "fill" : "regular"} />
          Quadro do dia
        </button>
      </div>

      {vista === "quadro" ? (
        <AgendaQuadro
          dia={hoje}
          itens={itensQuadro}
          carregando={carregando}
          movendo={movendo}
          onMover={moverItem}
          onEditar={editarItem}
          onBuscarCliente={onBuscarCliente}
          onAgendar={onAgendar}
          onNovaTarefa={novaTarefa}
        />
      ) : vista === "semana" ? (
        <>
          {erro && (
            <p className="mb-3 rounded-xl border border-spark-danger/20 bg-spark-danger/5 px-4 py-3 text-center text-sm text-spark-danger">
              {erro}
            </p>
          )}
          <AgendaSemana
            inicio={semanaInicio}
            itens={itensSemana}
            hoje={hoje}
            carregando={carregandoSemana}
            onMudarSemana={(delta) => setSemanaInicio((s) => somarDias(s, delta * 7))}
            onHoje={() => setSemanaInicio(inicioSemana(hoje))}
            onSlotLivre={(data, horario) => setForm({ modo: "criar", data, horario })}
            onEditar={(item) => setForm({ modo: "editar", item })}
          />
        </>
      ) : (
      <div className="lg:grid lg:grid-cols-[360px_minmax(0,1fr)] lg:items-start lg:gap-6">
        {/* ── Coluna esquerda: hoje + calendario (fixa no desktop) ── */}
        <div className="space-y-4 lg:sticky lg:top-2">
          {/* Resumo de hoje */}
          {vendoMesAtual && (
            <div className="flex items-center gap-3 rounded-2xl border border-spark-line bg-spark-panel px-4 py-3.5">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-spark-accent text-white">
                <CalendarCheck size={22} weight="fill" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-spark-faint">
                  Sua agenda hoje
                </p>
                <p className="text-[15px] font-bold text-spark-ink">
                  {consultasHoje.length === 0
                    ? "Nenhuma consulta"
                    : consultasHoje.length === 1
                      ? "1 consulta"
                      : `${consultasHoje.length} consultas`}
                </p>
                {consultasHoje.length > 0 && (
                  <p className="mt-0.5 flex items-center gap-1 truncate text-[13px] text-spark-muted">
                    <Clock size={13} weight="bold" className="shrink-0 text-spark-accent" />
                    <span className="truncate">
                      <span className="font-semibold text-spark-body">Proxima {consultasHoje[0].horario}</span>{" "}
                      · {consultasHoje[0].clienteNome}
                    </span>
                  </p>
                )}
              </div>
              {selecionado !== hoje && (
                <button
                  type="button"
                  onClick={voltarParaHoje}
                  className="shrink-0 rounded-sm bg-spark-soft px-3 py-1.5 text-[13px] font-semibold text-spark-accent-strong transition active:scale-95"
                >
                  Ver hoje
                </button>
              )}
            </div>
          )}

          {/* Calendario */}
          <div className="rounded-2xl border border-spark-line bg-spark-panel p-4">
            <div className="mb-3 flex items-center justify-between">
              <p className="font-display text-lg font-bold text-spark-ink">
                {MESES[mes]} <span className="font-medium text-spark-muted">{ano}</span>
              </p>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  aria-label="Atualizar agenda"
                  onClick={atualizarAgenda}
                  disabled={carregando}
                  className="mr-0.5 flex h-9 w-9 items-center justify-center rounded-sm text-spark-muted transition hover:bg-spark-hover hover:text-spark-body disabled:opacity-60"
                >
                  <CircleNotch size={17} className={carregando ? "animate-spin" : ""} />
                </button>
                {!vendoMesAtual && (
                  <button
                    type="button"
                    onClick={voltarParaHoje}
                    className="mr-0.5 rounded-sm bg-spark-soft px-3 py-1.5 text-[13px] font-semibold text-spark-accent-strong transition active:scale-95"
                  >
                    Hoje
                  </button>
                )}
                <button
                  type="button"
                  aria-label="Mês anterior"
                  onClick={() => mudarMes(-1)}
                  className="flex h-9 w-9 items-center justify-center rounded-sm text-spark-body transition hover:bg-spark-hover"
                >
                  <CaretLeft size={17} weight="bold" />
                </button>
                <button
                  type="button"
                  aria-label="Próximo mês"
                  onClick={() => mudarMes(1)}
                  className="flex h-9 w-9 items-center justify-center rounded-sm text-spark-body transition hover:bg-spark-hover"
                >
                  <CaretRight size={17} weight="bold" />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-7 text-center">
              {DIAS_SEMANA.map((d, i) => (
                <span
                  key={i}
                  className={`pb-2 text-[11px] font-bold uppercase ${
                    i === 0 || i === 6 ? "text-spark-faint" : "text-spark-muted"
                  }`}
                >
                  {d}
                </span>
              ))}
            </div>

            <div
              className={`grid grid-cols-7 gap-y-0.5 transition-opacity ${carregando ? "opacity-50" : ""}`}
            >
              {celulas.map((cel) => {
                const count = porDia.get(cel.iso)?.length ?? 0;
                const temConsulta = count > 0;
                const ehHoje = cel.iso === hoje;
                const ativo = cel.iso === selecionado;
                const corPonto = ativo ? "bg-white/90" : ehHoje ? "bg-spark-accent" : "bg-spark-danger";
                return (
                  <button
                    key={cel.iso}
                    type="button"
                    onClick={() => setSelecionado(cel.iso)}
                    className="flex flex-col items-center py-0.5"
                  >
                    <span
                      className={`flex h-10 w-10 items-center justify-center rounded-sm text-[15px] transition ${
                        ativo
                          ? "bg-spark-accent font-bold text-white"
                          : ehHoje
                            ? "bg-spark-soft font-bold text-spark-accent-strong ring-1 ring-spark-accent/30"
                            : cel.doMes
                              ? `font-medium text-spark-text hover:bg-spark-hover ${temConsulta ? "font-semibold" : ""}`
                              : "text-spark-faint"
                      }`}
                    >
                      {cel.dia}
                    </span>
                    {/* Marcacao de dias com consulta em vermelho (ate 3 pontinhos). */}
                    <span className="mt-0.5 flex h-1.5 items-center gap-0.5">
                      {temConsulta &&
                        Array.from({ length: Math.min(count, 3) }).map((_, i) => (
                          <span key={i} className={`h-1.5 w-1.5 rounded-full ${corPonto}`} />
                        ))}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {erro && (
            <p className="rounded-xl border border-spark-danger/20 bg-spark-danger/5 px-4 py-3 text-center text-sm text-spark-danger">
              {erro}
            </p>
          )}
        </div>

        {/* ── Coluna direita: consultas do dia + proximos dias ── */}
        <div className="mt-5 space-y-6 lg:mt-0">
          {/* Consultas do dia selecionado */}
          <section>
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-spark-faint">
                  {selecionado === hoje ? "Hoje" : "Dia selecionado"}
                </p>
                <p className="truncate font-display text-[17px] font-bold capitalize text-spark-ink">
                  {nomeDiaSemana(selecionado)}, {formatarBr(selecionado)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => onAgendar(selecionado)}
                className="flex shrink-0 items-center gap-1 rounded-sm bg-spark-accent hover:bg-spark-accent-strong px-3.5 py-2 text-[13px] font-semibold text-white transition active:scale-95"
              >
                <Plus size={15} weight="bold" />
                Agendar
              </button>
            </div>

            {carregando && doDia.length === 0 && <SkeletonList n={3} />}

            {doDia.length === 0 && !carregando && (
              <div className="flex flex-col items-center rounded-2xl border border-dashed border-spark-inputline bg-spark-surface/60 px-4 py-10 text-center">
                <div className="mb-2 flex h-11 w-11 items-center justify-center rounded-sm bg-spark-soft/70">
                  <CalendarCheck size={22} className="text-spark-accent/70" />
                </div>
                <p className="text-sm font-medium text-spark-body">Nenhuma consulta neste dia</p>
                <p className="mt-0.5 text-[13px] text-spark-muted">Toque em “Agendar” para adicionar.</p>
              </div>
            )}

            <ol className="flex flex-col gap-3">
              {doDia.map((c) => {
                const st = statusInfo(c.status);
                return (
                  <li
                    key={c.idLocal}
                    className="relative overflow-hidden rounded-2xl border border-spark-line bg-spark-panel"
                  >
                    <span className={`absolute inset-y-0 left-0 w-1.5 ${st.bar}`} />
                    <div className="flex items-start gap-3 py-3.5 pl-5 pr-3.5">
                      <div className="flex w-[46px] shrink-0 flex-col items-start pt-0.5">
                        <span className="tabular text-[16px] font-bold leading-none text-spark-ink">
                          {c.horario || "--:--"}
                        </span>
                        <span className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-spark-faint">
                          hora
                        </span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[15px] font-semibold text-spark-ink">
                          {c.clienteNome || "(sem nome)"}
                        </p>
                        {(c.empresa || c.cargo) && (
                          <p className="truncate text-[13px] text-spark-muted">
                            {[c.empresa, c.cargo].filter(Boolean).join(" · ")}
                          </p>
                        )}
                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
                          {c.status && (
                            <span
                              className={`rounded-sm px-2.5 py-1 text-xs font-semibold ${st.chip}`}
                            >
                              {c.status}
                            </span>
                          )}
                          {c.motivo && (
                            <span className="rounded-sm bg-spark-surface px-2.5 py-1 text-xs font-medium text-spark-body">
                              {c.motivo}
                            </span>
                          )}
                          {c.tipoLaudo && (
                            <span className="rounded-sm bg-spark-surface px-2.5 py-1 text-xs font-medium text-spark-body">
                              {c.tipoLaudo}
                            </span>
                          )}
                        </div>
                        {(c.profissionalSala || c.local) && (
                          <p className="mt-2 flex items-center gap-1 text-xs text-spark-muted">
                            <MapPin size={13} />
                            {[c.profissionalSala, c.local].filter(Boolean).join(" · ")}
                          </p>
                        )}
                      </div>
                      <div className="flex shrink-0 flex-col items-center gap-1.5">
                        <button
                          type="button"
                          aria-label="Editar consulta"
                          onClick={() => setForm({ modo: "editar", item: c })}
                          className="flex h-9 w-9 items-center justify-center rounded-sm bg-spark-surface text-spark-body transition hover:bg-spark-hover active:scale-95"
                        >
                          <PencilSimple size={16} />
                        </button>
                        {c.clienteNome && (
                          <button
                            type="button"
                            aria-label={`Buscar ${c.clienteNome}`}
                            onClick={() => onBuscarCliente(c.clienteNome)}
                            className="flex h-9 w-9 items-center justify-center rounded-sm bg-spark-soft text-spark-accent-strong transition hover:brightness-95 active:scale-95"
                          >
                            <MagnifyingGlass size={16} />
                          </button>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>
          </section>

          {/* Proximos dias */}
          {proximos.length > 0 && (
            <section>
              <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.12em] text-spark-faint">
                Próximos dias
              </p>
              <div className="flex flex-col gap-3">
                {proximos.map(([dia, itens]) => (
                  <button
                    key={dia}
                    type="button"
                    onClick={() => setSelecionado(dia)}
                    className="group w-full rounded-2xl border border-spark-line bg-spark-panel p-3 text-left transition hover:border-spark-inputline active:scale-[0.99]"
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-10 w-10 shrink-0 flex-col items-center justify-center rounded-xl bg-spark-soft leading-none">
                        <span className="tabular text-[15px] font-bold text-spark-accent-strong">
                          {Number(dia.split("-")[2])}
                        </span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-semibold capitalize text-spark-text">
                          {nomeDiaSemana(dia)}
                        </p>
                        <p className="text-[11px] text-spark-muted">{formatarBr(dia)}</p>
                      </div>
                      <span className="flex items-center gap-1 rounded-sm bg-spark-surface px-2.5 py-1 text-[11px] font-semibold text-spark-body">
                        {itens.length} {itens.length === 1 ? "consulta" : "consultas"}
                        <CaretRight
                          size={12}
                          weight="bold"
                          className="text-spark-faint transition group-hover:translate-x-0.5 group-hover:text-spark-accent"
                        />
                      </span>
                    </div>
                    <ul className="mt-2.5 flex flex-col gap-2 border-t border-spark-line pt-2.5">
                      {itens.slice(0, 4).map((c) => {
                        const st = statusInfo(c.status);
                        return (
                          <li key={c.idLocal} className="flex items-center gap-2.5">
                            <span className="tabular w-11 shrink-0 text-right text-[13px] font-bold text-spark-accent-strong">
                              {c.horario || "--:--"}
                            </span>
                            <span className={`h-2 w-2 shrink-0 rounded-full ${st.dot}`} />
                            <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-spark-text">
                              {c.clienteNome || "(sem nome)"}
                            </span>
                            {c.motivo && (
                              <span className="hidden shrink-0 rounded-sm bg-spark-surface px-2 py-0.5 text-[11px] text-spark-body sm:inline">
                                {c.motivo}
                              </span>
                            )}
                          </li>
                        );
                      })}
                      {itens.length > 4 && (
                        <li className="pl-[54px] text-[11px] font-medium text-spark-muted">
                          + {itens.length - 4} mais
                        </li>
                      )}
                    </ul>
                  </button>
                ))}
              </div>
            </section>
          )}
        </div>
      </div>
      )}

      {form !== null && (
        <ConsultaForm
          dataInicial={form.modo === "criar" ? form.data : selecionado}
          horarioInicial={form.modo === "criar" ? form.horario : undefined}
          consulta={form.modo === "editar" ? form.item : undefined}
          onFechar={() => setForm(null)}
          onSalvo={aposSalvar}
          onSessaoExpirada={onSessaoExpirada}
        />
      )}

      {tarefaAberta && (
        <TarefaForm
          dia={hoje}
          tarefa={tarefaEditando ?? undefined}
          onFechar={() => {
            setTarefaAberta(false);
            setTarefaEditando(null);
          }}
          onSalvo={() => {
            setTarefaAberta(false);
            setTarefaEditando(null);
            setTarefaSeq((s) => s + 1);
          }}
          onSessaoExpirada={onSessaoExpirada}
        />
      )}
    </div>
  );
}
