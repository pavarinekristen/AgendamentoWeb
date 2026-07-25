import { useEffect, useState } from "react";
import { ChartBar, TrendUp, Warning, CaretDown } from "@phosphor-icons/react";
import { obterRelatorios, ApiError, type RelatorioResponse, type VencimentoItem } from "../lib/api";
import { DonutChart, type DonutSegment } from "../components/DonutChart";
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

function rotuloMes(iso: string): string {
  const m = Number(iso.slice(5, 7));
  return MESES_PT[m - 1] ?? iso;
}

export function ResumoScreen({ onSessaoExpirada, vencimentos, onBuscarCliente }: Props) {
  const [dados, setDados] = useState<RelatorioResponse | null>(null);
  const [erro, setErro] = useState("");
  const [mesHover, setMesHover] = useState<number | null>(null);
  const [verGraficos, setVerGraficos] = useState(false);
  const [verRanking, setVerRanking] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    obterRelatorios(6, controller.signal)
      .then(setDados)
      .catch((err) => {
        if (controller.signal.aborted) return;
        if (err instanceof ApiError && err.status === 401) {
          onSessaoExpirada();
          return;
        }
        setErro("Nao foi possivel carregar o resumo.");
      });
    return () => controller.abort();
  }, [onSessaoExpirada]);

  const mesAtual = dados?.meses[dados.meses.length - 1];
  const semDados = !!dados && dados.meses.every((m) => m.total === 0);

  const total = mesAtual?.total ?? 0;
  const realizadas = mesAtual?.realizadas ?? 0;
  const canceladas = mesAtual?.canceladas ?? 0;
  const faltas = mesAtual?.faltas ?? 0;
  const restantes = Math.max(0, total - realizadas - canceladas - faltas);
  const criticos = vencimentos.filter((v) => v.diasRestantes <= 30).length;

  return (
    <div className="px-4 py-4">
      <div className="mb-4">
        <h2 className="text-[22px] font-extrabold text-spark-ink">Resumo</h2>
        <p className="text-sm text-spark-muted">O que precisa de atencao hoje.</p>
      </div>

      {/* ── Linha enxuta do mes (substitui os 4 cards) ─────────────── */}
      {dados && !semDados && (
        <div className="mb-5 rounded-2xl border border-spark-line bg-spark-panel px-4 py-3.5 shadow-[0_10px_24px_-20px_rgba(28,25,23,0.35)]">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-[13px] font-medium capitalize text-spark-muted">
              {rotuloMes(mesAtual?.mes ?? "")} · consultas
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
      )}

      {/* ── AÇÃO: laudos a vencer (criticos primeiro) ──────────────── */}
      <section className="mb-6">
        <div className="mb-2.5 flex items-center gap-1.5">
          <Warning size={15} weight="fill" className="text-spark-accent" />
          <h3 className="text-[13px] font-bold uppercase tracking-wide text-spark-body">
            Precisa de atencao
          </h3>
          {criticos > 0 && (
            <span className="ml-auto rounded-full bg-spark-danger/10 px-2 py-0.5 text-[11px] font-bold text-spark-danger">
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

      {/* ── REFLEXÃO: graficos (recolhidos por padrao) ─────────────── */}
      {erro ? (
        <p className="rounded-xl border border-spark-danger/20 bg-spark-danger/5 px-4 py-3 text-center text-sm text-spark-danger">
          {erro}
        </p>
      ) : semDados ? (
        <div className="mt-6 flex flex-col items-center text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-spark-surface">
            <ChartBar size={30} className="text-spark-muted" />
          </div>
          <p className="mt-4 text-sm font-semibold text-spark-text">Sem consultas no periodo.</p>
        </div>
      ) : (
        <section>
          <button
            type="button"
            onClick={() => setVerGraficos((v) => !v)}
            className="flex w-full items-center gap-1.5 py-1"
          >
            <ChartBar size={15} className="text-spark-muted" />
            <h3 className="text-[13px] font-bold uppercase tracking-wide text-spark-body">Como estamos</h3>
            <CaretDown
              size={15}
              weight="bold"
              className={`ml-auto text-spark-muted transition-transform ${verGraficos ? "rotate-180" : ""}`}
            />
          </button>

          {verGraficos && dados && (
            <div className="mt-3">
              {/* Tendencia mensal */}
              <Painel titulo="Consultas por mes" icone={<TrendUp size={15} className="text-spark-accent" />}>
                <div className="flex h-36 items-end justify-between gap-2 pt-2">
                  {dados.meses.map((m, i) => {
                    const ultimo = i === dados.meses.length - 1;
                    const foco = mesHover === i;
                    const maxTotal = Math.max(1, ...dados.meses.map((x) => x.total));
                    return (
                      <button
                        type="button"
                        key={m.mes}
                        onMouseEnter={() => setMesHover(i)}
                        onMouseLeave={() => setMesHover(null)}
                        className="group flex flex-1 flex-col items-center gap-1.5"
                      >
                        <span
                          className={`tabular text-[11px] font-bold transition ${
                            foco || ultimo ? "text-spark-ink" : "text-spark-body opacity-0 group-hover:opacity-100"
                          }`}
                        >
                          {m.total}
                        </span>
                        <div
                          className={`w-full rounded-t-lg transition-[height,background-color] duration-300 ${
                            ultimo ? "bg-spark-accent" : foco ? "bg-spark-accent-light" : "bg-spark-soft"
                          }`}
                          style={{ height: `${Math.max(6, (m.total / maxTotal) * 96)}px` }}
                        />
                        <span
                          className={`text-[11px] font-semibold ${
                            ultimo ? "text-spark-accent-strong" : "text-spark-muted"
                          }`}
                        >
                          {rotuloMes(m.mes)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </Painel>

              {/* Status do mes */}
              <div className="mt-4">
                <Painel titulo="Status das consultas" sub={`Mes de ${rotuloMes(mesAtual?.mes ?? "")}`}>
                  <StatusDonut realizadas={realizadas} canceladas={canceladas} faltas={faltas} restantes={restantes} />
                </Painel>
              </div>

              {/* Ranking de empresas (secundario) */}
              {dados.topEmpresas.length > 0 && (
                <div className="mt-4">
                  <button
                    type="button"
                    onClick={() => setVerRanking((v) => !v)}
                    className="flex w-full items-center gap-1.5 py-1 text-[12.5px] font-semibold text-spark-muted"
                  >
                    Empresas com mais consultas
                    <CaretDown
                      size={14}
                      weight="bold"
                      className={`ml-auto transition-transform ${verRanking ? "rotate-180" : ""}`}
                    />
                  </button>
                  {verRanking && (
                    <ul className="mt-2 flex flex-col gap-3">
                      {dados.topEmpresas.map((e, i) => {
                        const maxEmpresa = Math.max(1, ...dados.topEmpresas.map((x) => x.total));
                        return (
                          <li key={e.empresa}>
                            <div className="mb-1.5 flex items-baseline justify-between gap-2">
                              <span className="flex min-w-0 items-center gap-2">
                                <span className="tabular w-4 text-[12px] font-bold text-spark-faint">{i + 1}</span>
                                <span className="truncate text-[13px] font-medium text-spark-ink">{e.empresa}</span>
                              </span>
                              <span className="tabular text-[13px] font-semibold text-spark-body">{e.total}</span>
                            </div>
                            <div className="h-2 overflow-hidden rounded-full bg-spark-surface">
                              <div
                                className="h-full rounded-full bg-gradient-to-r from-spark-accent-light to-spark-accent"
                                style={{ width: `${(e.total / maxEmpresa) * 100}%` }}
                              />
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              )}
            </div>
          )}
        </section>
      )}
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
        <p className="text-[13px] text-spark-muted">Sem consultas classificadas neste mes.</p>
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
    <section className="min-w-0 overflow-hidden rounded-2xl border border-spark-line bg-spark-panel p-4 shadow-[0_10px_24px_-20px_rgba(28,25,23,0.35)]">
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
