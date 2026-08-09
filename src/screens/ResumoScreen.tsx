import { useEffect, useMemo, useState } from "react";
import { ChartBar, TrendUp, Warning, CaretDown } from "@phosphor-icons/react";
import { obterRelatorios, ApiError, type RelatorioResponse, type VencimentoItem } from "../lib/api";
import { DonutChart, type DonutSegment } from "../components/DonutChart";
import { SkeletonLine } from "../components/Skeleton";
import { AvisosScreen } from "./AvisosScreen";

interface Props {
  onSessaoExpirada: () => void;
  vencimentos: VencimentoItem[];
  onBuscarCliente: (nome: string) => void;
}

const MESES_PT = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

// Cores de status validadas p/ daltonismo (index.css / skill dataviz).
const COR = {
  verde: "var(--color-spark-chart-green)",
  vermelho: "var(--color-spark-chart-red)",
  ambar: "var(--color-spark-chart-amber)",
  neutro: "var(--color-spark-chart-neutral)",
};

const PERIODOS = [3, 6, 12];

function rotuloMes(iso: string): string {
  const m = Number(iso.slice(5, 7));
  return MESES_PT[m - 1] ?? iso;
}

// Rotulo com ano para cabecalhos: em janeiro, "jan" sozinho nao diz se e o mes
// corrente ou o do ano passado.
function rotuloMesAno(iso: string): string {
  return `${rotuloMes(iso)}/${iso.slice(2, 4)}`;
}

export function ResumoScreen({ onSessaoExpirada, vencimentos, onBuscarCliente }: Props) {
  const [dados, setDados] = useState<RelatorioResponse | null>(null);
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [meses, setMeses] = useState(6);
  // Mes em foco nos graficos, guardado pela chave "yyyy-MM" e nao pelo indice:
  // ao trocar o periodo o array muda de tamanho e um indice ficaria apontando
  // para outro mes. null = o mais recente.
  const [mesSelecionado, setMesSelecionado] = useState<string | null>(null);
  const [verGraficos, setVerGraficos] = useState(false);
  const [verRanking, setVerRanking] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setCarregando(true);
    setErro("");

    obterRelatorios(meses, controller.signal)
      .then((d) => {
        setDados(d);
        setMesSelecionado(null);
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        if (err instanceof ApiError && err.status === 401) {
          onSessaoExpirada();
          return;
        }
        setErro("Não foi possível carregar o resumo.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setCarregando(false);
      });

    return () => controller.abort();
  }, [onSessaoExpirada, meses]);

  // A ordem da API nao e contrato: ordenamos aqui. Como "mês" e "yyyy-MM", a
  // comparacao textual ja da a ordem cronologica.
  const mesesOrdenados = useMemo(
    () => [...(dados?.meses ?? [])].sort((a, b) => a.mes.localeCompare(b.mes)),
    [dados],
  );

  const semDados = !!dados && mesesOrdenados.every((m) => m.total === 0);

  // Mes em foco: o escolhido na barra, ou o mais recente do periodo.
  const mesFoco =
    mesesOrdenados.find((m) => m.mes === mesSelecionado) ??
    mesesOrdenados[mesesOrdenados.length - 1];

  const total = mesFoco?.total ?? 0;
  const realizadas = mesFoco?.realizadas ?? 0;
  const canceladas = mesFoco?.canceladas ?? 0;
  const faltas = mesFoco?.faltas ?? 0;
  const restantes = Math.max(0, total - realizadas - canceladas - faltas);
  const criticos = vencimentos.filter((v) => v.diasRestantes <= 30).length;

  // Fora do map: antes eram recalculados uma vez por barra.
  const maxTotal = useMemo(
    () => Math.max(1, ...mesesOrdenados.map((m) => m.total)),
    [mesesOrdenados],
  );
  const maxEmpresa = useMemo(
    () => Math.max(1, ...(dados?.topEmpresas ?? []).map((e) => e.total)),
    [dados],
  );

  return (
    <div className="px-4 py-4 lg:px-0 lg:py-2">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3 lg:mb-6">
        <div>
          <h2 className="text-[22px] font-extrabold text-spark-ink lg:text-[26px]">Resumo</h2>
          <p className="text-sm text-spark-muted">O que precisa de atenção hoje.</p>
        </div>

        {/* Periodo: a API ja aceita o parametro, so nao estava exposto. */}
        <div className="inline-flex rounded-xl border border-spark-line bg-spark-surface p-1">
          {PERIODOS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setMeses(p)}
              aria-pressed={meses === p}
              className={`rounded-lg px-3 py-1.5 text-[12.5px] font-semibold transition ${
                meses === p
                  ? "bg-spark-panel text-spark-accent-strong shadow-sm"
                  : "text-spark-muted hover:text-spark-body"
              }`}
            >
              {p}m
            </button>
          ))}
        </div>
      </div>

      {/* Coluna unica no celular; no desktop a acao (avisos) vira trilho fixo a
          direita e a analise ocupa a coluna principal. */}
      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start lg:gap-7">
        {/* ── Linha enxuta do mes em foco ─────────────────────────────── */}
        {carregando ? (
          <div className="mb-5 rounded-2xl border border-spark-line bg-spark-panel px-4 py-3.5 lg:col-start-1 lg:row-start-1">
            <div className="flex items-baseline justify-between gap-2">
              <SkeletonLine className="h-4 w-32" />
              <SkeletonLine className="h-6 w-10" />
            </div>
            <div className="mt-3 flex gap-4">
              <SkeletonLine className="h-3.5 w-24" />
              <SkeletonLine className="h-3.5 w-24" />
              <SkeletonLine className="h-3.5 w-20" />
            </div>
          </div>
        ) : (
          dados &&
          !semDados && (
            <div className="mb-5 rounded-2xl border border-spark-line bg-spark-panel px-4 py-3.5 lg:col-start-1 lg:row-start-1">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[13px] font-medium text-spark-muted">
                  {rotuloMesAno(mesFoco?.mes ?? "")} · consultas
                </span>
                <span className="tabular font-display text-[26px] font-extrabold leading-none text-spark-ink">
                  {total}
                </span>
              </div>
              <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-[12.5px]">
                <MiniStat cor={COR.verde} label="realizadas" valor={realizadas} />
                <MiniStat cor={COR.vermelho} label="canceladas" valor={canceladas} />
                <MiniStat cor={COR.ambar} label="faltas" valor={faltas} />
              </div>
            </div>
          )
        )}

        {/* ── ACAO: laudos a vencer ───────────────────────────────────── */}
        <section className="mb-6 lg:sticky lg:top-2 lg:col-start-2 lg:row-start-1 lg:row-span-2 lg:mb-0">
          <div className="mb-2.5 flex items-center gap-1.5">
            <Warning size={15} weight="fill" className="text-spark-accent" />
            <h3 className="text-[13px] font-bold uppercase tracking-wide text-spark-body">
              Precisa de atencao
            </h3>
            {criticos > 0 && (
              <span className="ml-auto rounded-sm bg-spark-danger/10 px-2 py-0.5 text-[11px] font-bold text-spark-danger">
                {criticos} em ate 30 dias
              </span>
            )}
          </div>
          <AvisosScreen
            itens={vencimentos}
            onSessaoExpirada={onSessaoExpirada}
            onBuscarCliente={onBuscarCliente}
            compacto
          />
        </section>

        {/* ── REFLEXAO: graficos ──────────────────────────────────────── */}
        <div className="lg:col-start-1 lg:row-start-2">
          {erro ? (
            <p className="rounded-xl border border-spark-danger/20 bg-spark-danger/5 px-4 py-3 text-center text-sm text-spark-danger">
              {erro}
            </p>
          ) : carregando ? (
            <div className="rounded-2xl border border-spark-line bg-spark-panel p-4">
              <SkeletonLine className="mb-4 h-4 w-40" />
              <SkeletonLine className="h-36 w-full" />
            </div>
          ) : semDados ? (
            <div className="mt-6 flex flex-col items-center text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-spark-surface">
                <ChartBar size={30} className="text-spark-muted" />
              </div>
              <p className="mt-4 text-sm font-semibold text-spark-text">Sem consultas no período.</p>
            </div>
          ) : (
            <section>
              {/* O sanfonar existe para caber em 390px. No desktop sobra espaco,
                  entao o conteudo ja vem aberto e o botao some. */}
              <button
                type="button"
                onClick={() => setVerGraficos((v) => !v)}
                aria-expanded={verGraficos}
                className="flex w-full items-center gap-1.5 py-1 lg:hidden"
              >
                <ChartBar size={15} className="text-spark-muted" />
                <h3 className="text-[13px] font-bold uppercase tracking-wide text-spark-body">
                  Como estamos
                </h3>
                <CaretDown
                  size={15}
                  weight="bold"
                  className={`ml-auto text-spark-muted transition-transform ${verGraficos ? "rotate-180" : ""}`}
                />
              </button>

              {dados && (
                <div className={`mt-3 lg:mt-0 lg:block ${verGraficos ? "" : "hidden"}`}>
                  {/* Tendencia mensal */}
                  <Painel
                    titulo="Consultas por mês"
                    icone={<TrendUp size={15} className="text-spark-accent" />}
                    sub="Toque num mês para detalhar"
                  >
                    <div className="flex h-40 items-end justify-between gap-2 border-b border-spark-line pt-2">
                      {mesesOrdenados.map((m) => {
                        const foco = m.mes === (mesFoco?.mes ?? "");
                        // Sem altura minima artificial: mes zerado tem que
                        // encostar na linha de base, senao le como atividade.
                        const altura = m.total === 0 ? 0 : Math.max(3, (m.total / maxTotal) * 100);
                        return (
                          <button
                            type="button"
                            key={m.mes}
                            onClick={() => setMesSelecionado(m.mes)}
                            aria-pressed={foco}
                            aria-label={`${rotuloMesAno(m.mes)}: ${m.total} consultas`}
                            className="group flex h-full flex-1 flex-col items-center justify-end gap-1.5"
                          >
                            {/* Valor sempre visivel: no celular nao existe hover
                                e antes so o ultimo mes mostrava numero. */}
                            <span
                              className={`tabular text-[11px] font-bold ${
                                foco ? "text-spark-ink" : "text-spark-body"
                              }`}
                            >
                              {m.total}
                            </span>
                            <div
                              className={`w-full rounded-t-lg transition-[height,background-color] duration-300 ${
                                foco
                                  ? "bg-spark-accent"
                                  : "bg-spark-soft group-hover:bg-spark-accent-light"
                              }`}
                              style={{ height: `${altura}px` }}
                            />
                          </button>
                        );
                      })}
                    </div>
                    <div className="flex justify-between gap-2 pt-1.5">
                      {mesesOrdenados.map((m) => {
                        const foco = m.mes === (mesFoco?.mes ?? "");
                        return (
                          <span
                            key={m.mes}
                            className={`flex-1 text-center text-[11px] font-semibold ${
                              foco ? "text-spark-accent-strong" : "text-spark-muted"
                            }`}
                          >
                            {rotuloMes(m.mes)}
                          </span>
                        );
                      })}
                    </div>
                  </Painel>

                  {/* Status do mes em foco */}
                  <div className="mt-4">
                    <Painel
                      titulo="Status das consultas"
                      sub={`Mês de ${rotuloMesAno(mesFoco?.mes ?? "")}`}
                    >
                      <StatusDonut
                        realizadas={realizadas}
                        canceladas={canceladas}
                        faltas={faltas}
                        restantes={restantes}
                      />
                    </Painel>
                  </div>

                  {/* Ranking de empresas (secundario) */}
                  {dados.topEmpresas.length > 0 && (
                    <div className="mt-4">
                      <button
                        type="button"
                        onClick={() => setVerRanking((v) => !v)}
                        aria-expanded={verRanking}
                        className="flex w-full items-center gap-1.5 py-1 text-[12.5px] font-semibold text-spark-muted lg:hidden"
                      >
                        Empresas com mais consultas
                        <CaretDown
                          size={14}
                          weight="bold"
                          className={`ml-auto transition-transform ${verRanking ? "rotate-180" : ""}`}
                        />
                      </button>
                      <p className="hidden pb-2 text-[12.5px] font-semibold text-spark-muted lg:block">
                        Empresas com mais consultas
                      </p>
                      <ul
                        className={`mt-2 flex flex-col gap-3 lg:mt-0 lg:flex ${verRanking ? "" : "hidden"}`}
                      >
                        {dados.topEmpresas.map((e, i) => (
                          <li key={e.empresa}>
                            <div className="mb-1.5 flex items-baseline justify-between gap-2">
                              <span className="flex min-w-0 items-center gap-2">
                                <span className="tabular w-4 text-[12px] font-bold text-spark-body">
                                  {i + 1}
                                </span>
                                <span className="truncate text-[13px] font-medium text-spark-ink">
                                  {e.empresa}
                                </span>
                              </span>
                              <span className="tabular text-[13px] font-semibold text-spark-body">
                                {e.total}
                              </span>
                            </div>
                            <div className="h-2 overflow-hidden rounded-sm bg-spark-surface">
                              <div
                                className="h-full rounded-sm bg-spark-accent"
                                style={{ width: `${(e.total / maxEmpresa) * 100}%` }}
                              />
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

function StatusDonut({
  realizadas,
  canceladas,
  faltas,
  restantes,
}: {
  realizadas: number;
  canceladas: number;
  faltas: number;
  restantes: number;
}) {
  const segs: DonutSegment[] = [
    { label: "Realizadas", value: realizadas, color: COR.verde },
    { label: "Canceladas", value: canceladas, color: COR.vermelho },
    { label: "Faltas", value: faltas, color: COR.ambar },
    { label: "Restantes", value: restantes, color: COR.neutro },
  ].filter((s) => s.value > 0);

  if (segs.length === 0) {
    return (
      <div className="flex h-[168px] items-center justify-center text-center">
        <p className="text-[13px] text-spark-muted">Sem consultas classificadas neste mês.</p>
      </div>
    );
  }
  return <DonutChart segments={segs} centerLabel="consultas" />;
}

function MiniStat({ cor, label, valor }: { cor: string; label: string; valor: number }) {
  return (
    <span className="flex items-center gap-1.5 text-spark-body">
      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: cor }} aria-hidden="true" />
      <span className="tabular font-semibold text-spark-ink">{valor}</span>
      <span className="text-spark-muted">{label}</span>
    </span>
  );
}

function Painel({
  titulo,
  sub,
  icone,
  children,
}: {
  titulo: string;
  sub?: string;
  icone?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="min-w-0 overflow-hidden rounded-2xl border border-spark-line bg-spark-panel p-4">
      <div className="mb-3 flex min-w-0 items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          {icone}
          <h3 className="min-w-0 truncate text-[13px] font-bold uppercase tracking-wide text-spark-body">{titulo}</h3>
        </div>
        {sub && <span className="shrink-0 text-[11px] font-medium text-spark-muted">{sub}</span>}
      </div>
      {children}
    </section>
  );
}
