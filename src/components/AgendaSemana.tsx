import { useEffect, useMemo, useState } from "react";
import { CaretLeft, CaretRight, Plus, Warning, CircleNotch } from "@phosphor-icons/react";
import type { AgendaItem } from "../lib/api";
import { statusInfo } from "../lib/status";
import { DIAS_SEMANA, diasDaSemana, formatarBr, MESES } from "../lib/datas";

// Grade de horarios da semana.
//
// O calendario mensal responde "o que ja esta marcado"; esta tela responde a
// pergunta inversa, que e a que a recepcao faz o dia inteiro: "onde tem vaga?".
// Por isso o slot vazio e o elemento clicavel — marcar acontece em cima da
// propria agenda, sem trocar de tela.
//
// Sobreposicao tambem so aparece aqui: duas consultas no mesmo horario com o
// mesmo profissional caem na mesma celula e sao destacadas como conflito.

const HORA_INICIO = 7;
const HORA_FIM = 19;
const PASSO_MIN = 30;
const SLOTS = ((HORA_FIM - HORA_INICIO) * 60) / PASSO_MIN;
const ALTURA_SLOT = 44; // px — tambem e o alvo de toque minimo da celula.

function rotuloSlot(i: number): string {
  const min = HORA_INICIO * 60 + i * PASSO_MIN;
  return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
}

function minutosDoHorario(h?: string): number | null {
  const m = /^(\d{1,2}):(\d{2})/.exec((h ?? "").trim());
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

// Indice do slot, ou null quando o horario esta vazio ou fora do expediente —
// esses itens nao somem, vao para a lista "fora da grade" abaixo da tabela.
function indiceSlot(h?: string): number | null {
  const min = minutosDoHorario(h);
  if (min === null) return null;
  const i = Math.floor((min - HORA_INICIO * 60) / PASSO_MIN);
  return i >= 0 && i < SLOTS ? i : null;
}

function normalizar(s?: string): string {
  return (s ?? "").trim().toLowerCase();
}

interface Props {
  inicio: string; // domingo da semana visivel
  itens: AgendaItem[];
  hoje: string;
  carregando: boolean;
  onMudarSemana: (delta: number) => void;
  onHoje: () => void;
  onSlotLivre: (data: string, horario: string) => void;
  onEditar: (item: AgendaItem) => void;
}

export function AgendaSemana({
  inicio,
  itens,
  hoje,
  carregando,
  onMudarSemana,
  onHoje,
  onSlotLivre,
  onEditar,
}: Props) {
  const dias = useMemo(() => diasDaSemana(inicio), [inicio]);

  // Relogio de parede da linha do "agora": atualiza a cada minuto para a marca
  // nao ficar mentindo durante um plantao com a tela aberta.
  const [agora, setAgora] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setAgora(new Date()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  // Distribuicao dos itens por celula (dia + slot) e o que sobrou fora dela.
  const { celulas, foraDaGrade, conflitos } = useMemo(() => {
    const celulas = new Map<string, AgendaItem[]>();
    const foraDaGrade = new Map<string, AgendaItem[]>();

    for (const item of itens) {
      const i = indiceSlot(item.horario);
      const mapa = i === null ? foraDaGrade : celulas;
      const chave = i === null ? item.data : `${item.data}|${i}`;
      const lista = mapa.get(chave);
      if (lista) lista.push(item);
      else mapa.set(chave, [item]);
    }

    // Conflito = mesma celula, mesmo profissional/sala. Duas consultas no mesmo
    // horario com profissionais diferentes sao legitimas (duas salas).
    let conflitos = 0;
    for (const lista of celulas.values()) {
      if (lista.length < 2) continue;
      const vistos = new Set<string>();
      for (const c of lista) {
        const p = normalizar(c.profissionalSala);
        if (!p) continue;
        if (vistos.has(p)) {
          conflitos += 1;
          break;
        }
        vistos.add(p);
      }
    }

    return { celulas, foraDaGrade, conflitos };
  }, [itens]);

  function temConflito(lista: AgendaItem[]): boolean {
    if (lista.length < 2) return false;
    const vistos = new Set<string>();
    for (const c of lista) {
      const p = normalizar(c.profissionalSala);
      if (!p) continue;
      if (vistos.has(p)) return true;
      vistos.add(p);
    }
    return false;
  }

  // Linha do horario atual: so quando a semana visivel contem o dia de hoje.
  const minutosAgora = agora.getHours() * 60 + agora.getMinutes();
  const dentroDoExpediente =
    minutosAgora >= HORA_INICIO * 60 && minutosAgora < HORA_FIM * 60;
  const mostrarAgora = dias.includes(hoje) && dentroDoExpediente;
  const topoAgora = ((minutosAgora - HORA_INICIO * 60) / PASSO_MIN) * ALTURA_SLOT;

  const colunas = `56px repeat(7, minmax(88px, 1fr))`;
  const inicioBr = formatarBr(inicio);
  const fimBr = formatarBr(dias[6]);
  const [, mesInicio] = inicio.split("-").map(Number);

  return (
    <div className="rounded-2xl border border-spark-line bg-spark-panel">
      {/* ── Navegacao da semana ─────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-spark-line px-4 py-3">
        <div className="min-w-0">
          <p className="font-display text-[17px] font-bold text-spark-ink">
            {inicioBr.slice(0, 5)} a {fimBr.slice(0, 5)}
            <span className="ml-2 font-medium text-spark-muted">{MESES[mesInicio - 1]}</span>
          </p>
          {conflitos > 0 ? (
            <p className="mt-0.5 flex items-center gap-1 text-[12.5px] font-semibold text-spark-danger">
              <Warning size={14} weight="fill" />
              {conflitos === 1
                ? "1 horário com conflito de profissional"
                : `${conflitos} horários com conflito de profissional`}
            </p>
          ) : (
            <p className="mt-0.5 text-[12.5px] text-spark-muted">
              Toque num horário livre para agendar
            </p>
          )}
        </div>

        <div className="flex items-center gap-1">
          {carregando && (
            <CircleNotch size={16} className="mr-1 animate-spin text-spark-muted" />
          )}
          <button
            type="button"
            aria-label="Semana anterior"
            onClick={() => onMudarSemana(-1)}
            className="flex h-9 w-9 items-center justify-center rounded-sm text-spark-body transition hover:bg-spark-hover"
          >
            <CaretLeft size={17} weight="bold" />
          </button>
          <button
            type="button"
            onClick={onHoje}
            className="rounded-sm bg-spark-soft px-3 py-1.5 text-[13px] font-semibold text-spark-accent-strong transition hover:brightness-95 active:scale-95"
          >
            Hoje
          </button>
          <button
            type="button"
            aria-label="Próxima semana"
            onClick={() => onMudarSemana(1)}
            className="flex h-9 w-9 items-center justify-center rounded-sm text-spark-body transition hover:bg-spark-hover"
          >
            <CaretRight size={17} weight="bold" />
          </button>
        </div>
      </div>

      {/* ── Grade ───────────────────────────────────────────────────────
          Rola dentro do proprio container (nunca a pagina): no celular a
          semana inteira nao cabe em 390px, entao a coluna de horas fica
          fixa a esquerda e os dias deslizam por baixo dela. */}
      <div className="app-scroll max-h-[68vh] overflow-auto">
        <div className="min-w-[680px]">
          {/* Cabecalho dos dias */}
          <div
            className="sticky top-0 z-20 grid border-b border-spark-line bg-spark-panel"
            style={{ gridTemplateColumns: colunas }}
          >
            <div className="sticky left-0 z-30 bg-spark-panel" />
            {dias.map((d, i) => {
              const ehHoje = d === hoje;
              const fimDeSemana = i === 0 || i === 6;
              return (
                <div
                  key={d}
                  className={`border-l border-spark-line px-2 py-2 text-center ${
                    fimDeSemana ? "bg-spark-surface/50" : ""
                  }`}
                >
                  <p
                    className={`text-[11px] font-bold uppercase ${
                      ehHoje
                        ? "text-spark-accent"
                        : fimDeSemana
                          ? "text-spark-faint"
                          : "text-spark-muted"
                    }`}
                  >
                    {DIAS_SEMANA[i]}
                  </p>
                  <p
                    className={`tabular text-[15px] font-bold ${
                      ehHoje ? "text-spark-accent" : "text-spark-text"
                    }`}
                  >
                    {d.slice(8, 10)}
                  </p>
                </div>
              );
            })}
          </div>

          {/* Corpo: 24 faixas de 30 min */}
          <div
            className="relative grid"
            style={{
              gridTemplateColumns: colunas,
              gridTemplateRows: `repeat(${SLOTS}, ${ALTURA_SLOT}px)`,
            }}
          >
            {Array.from({ length: SLOTS }, (_, i) => {
              const rot = rotuloSlot(i);
              const cheia = i % 2 === 0; // rotulo so na hora cheia

              return [
                // Coluna de horas: gruda na esquerda ao rolar na horizontal.
                <div
                  key={`h-${i}`}
                  className={`sticky left-0 z-10 bg-spark-panel pr-2 text-right ${
                    cheia ? "border-t border-spark-line" : ""
                  }`}
                >
                  {cheia && (
                    <span className="tabular relative -top-2 text-[11px] font-semibold text-spark-muted">
                      {rot}
                    </span>
                  )}
                </div>,

                ...dias.map((d, di) => {
                  const lista = celulas.get(`${d}|${i}`) ?? [];
                  const fimDeSemana = di === 0 || di === 6;
                  const conflito = temConflito(lista);
                  const borda = `border-l border-spark-line ${
                    cheia ? "border-t border-spark-line" : "border-t border-spark-line/40"
                  }`;

                  if (lista.length === 0) {
                    return (
                      <button
                        key={`${d}-${i}`}
                        type="button"
                        onClick={() => onSlotLivre(d, rot)}
                        aria-label={`Agendar ${formatarBr(d)} às ${rot}`}
                        className={`group flex items-center justify-center transition hover:bg-spark-hover active:bg-spark-soft ${borda} ${
                          fimDeSemana ? "bg-spark-surface/40" : ""
                        }`}
                      >
                        <Plus
                          size={14}
                          weight="bold"
                          className="text-spark-accent opacity-0 transition-opacity group-hover:opacity-100"
                        />
                      </button>
                    );
                  }

                  return (
                    <div
                      key={`${d}-${i}`}
                      className={`flex flex-col gap-px overflow-hidden p-px ${borda} ${
                        fimDeSemana ? "bg-spark-surface/40" : ""
                      } ${conflito ? "bg-spark-danger/8 ring-1 ring-inset ring-spark-danger/60" : ""}`}
                    >
                      {lista.map((c) => {
                        const st = statusInfo(c.status);
                        return (
                          <button
                            key={c.idLocal}
                            type="button"
                            onClick={() => onEditar(c)}
                            title={`${c.horario} · ${c.clienteNome}${
                              c.profissionalSala ? ` · ${c.profissionalSala}` : ""
                            }`}
                            className={`flex min-h-0 flex-1 items-center gap-1 overflow-hidden rounded-sm border px-1.5 text-left transition hover:brightness-95 ${st.bloco}`}
                          >
                            {conflito && (
                              <Warning
                                size={11}
                                weight="fill"
                                className="shrink-0 text-spark-danger"
                              />
                            )}
                            <span className="truncate text-[11.5px] font-semibold leading-tight">
                              {c.clienteNome || "Consulta"}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  );
                }),
              ];
            })}

            {/* Linha do agora, por cima da grade inteira. */}
            {mostrarAgora && (
              <div
                className="pointer-events-none absolute inset-x-0 z-10 flex items-center"
                style={{ top: `${topoAgora}px` }}
                aria-hidden="true"
              >
                <span className="ml-[52px] h-1.5 w-1.5 shrink-0 rounded-full bg-spark-danger" />
                <span className="h-px flex-1 bg-spark-danger/70" />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Fora do expediente ──────────────────────────────────────────
          Consulta sem horario ou fora da faixa 07:00-19:00 nao pode sumir da
          tela: numa agenda, item invisivel vira item esquecido. */}
      {foraDaGrade.size > 0 && (
        <div className="border-t border-spark-line px-4 py-3">
          <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.12em] text-spark-faint">
            Fora do expediente
          </p>
          <ul className="flex flex-col gap-1.5">
            {dias
              .filter((d) => foraDaGrade.has(d))
              .map((d) => (
                <li key={d} className="flex flex-wrap items-center gap-2">
                  <span className="tabular text-[12px] font-semibold text-spark-muted">
                    {formatarBr(d).slice(0, 5)}
                  </span>
                  {(foraDaGrade.get(d) ?? []).map((c) => {
                    const st = statusInfo(c.status);
                    return (
                      <button
                        key={c.idLocal}
                        type="button"
                        onClick={() => onEditar(c)}
                        className={`flex items-center gap-1.5 rounded-sm border px-2 py-1 text-[12px] font-medium transition hover:brightness-95 ${st.bloco}`}
                      >
                        <span className="tabular font-bold">{c.horario || "--:--"}</span>
                        <span className="max-w-[160px] truncate">
                          {c.clienteNome || "Consulta"}
                        </span>
                      </button>
                    );
                  })}
                </li>
              ))}
          </ul>
        </div>
      )}
    </div>
  );
}
