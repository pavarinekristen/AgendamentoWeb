import { useId, useState } from "react";

// Donut chart em SVG puro (sem dependencia). Segue a skill dataviz:
//  - cores de status validadas p/ daltonismo (o texto fica sempre em tinta,
//    nunca na cor da serie; a cor vive so no arco e no ponto da legenda);
//  - gap de 2px entre segmentos (o papel aparece entre as fatias);
//  - camada de hover: passar/tocar um segmento (ou item da legenda) destaca a
//    fatia e mostra o detalhe no centro — sem tooltip flutuante que estoura no
//    mobile; legenda sempre presente com rotulo + valor + %.

export interface DonutSegment {
  label: string;
  value: number;
  color: string;
}

interface Props {
  segments: DonutSegment[];
  size?: number;
  thickness?: number;
  centerLabel?: string; // rotulo sob o numero central quando nada esta em foco
}

const TAU = Math.PI * 2;

export function DonutChart({ segments, size = 168, thickness = 22, centerLabel = "total" }: Props) {
  const [ativo, setAtivo] = useState<number | null>(null);
  const gradId = useId();

  const total = segments.reduce((s, seg) => s + Math.max(0, seg.value), 0);
  const r = (size - thickness) / 2;
  const cx = size / 2;
  const c = TAU * r;
  const gap = total > 0 ? 2 : 0; // px de papel entre fatias

  // Angulos acumulados (comeca no topo, -90deg).
  let acc = 0;
  const arcs = segments.map((seg, i) => {
    const frac = total > 0 ? Math.max(0, seg.value) / total : 0;
    const len = frac * c;
    const arc = { seg, i, dash: Math.max(0, len - gap), offset: -acc, frac };
    acc += len;
    return arc;
  });

  const emFoco = ativo != null ? segments[ativo] : null;
  const centroValor = emFoco ? emFoco.value : total;
  const centroRotulo = emFoco
    ? `${emFoco.label} · ${total > 0 ? Math.round((emFoco.value / total) * 100) : 0}%`
    : centerLabel;

  const resumo = segments.map((s) => `${s.label}: ${s.value}`).join(", ");

  return (
    <div className="flex min-w-0 flex-col items-center gap-4">
      <div
        className="relative shrink-0"
        style={{ width: size, height: size }}
        role="img"
        aria-label={`Gráfico de rosca. ${resumo}.`}
        onMouseLeave={() => setAtivo(null)}
      >
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
          {/* trilho de fundo */}
          <circle cx={cx} cy={cx} r={r} fill="none" stroke="var(--color-spark-surface)" strokeWidth={thickness} />
          {total === 0 && (
            <circle cx={cx} cy={cx} r={r} fill="none" stroke="var(--color-spark-line)" strokeWidth={thickness} />
          )}
          {arcs.map((a) => (
            <circle
              key={a.i}
              cx={cx}
              cy={cx}
              r={r}
              fill="none"
              stroke={a.seg.color}
              strokeWidth={ativo === a.i ? thickness + 4 : thickness}
              strokeDasharray={`${a.dash} ${c - a.dash}`}
              strokeDashoffset={a.offset}
              strokeLinecap="butt"
              className="cursor-pointer transition-[stroke-width,opacity] duration-200"
              style={{ opacity: ativo == null || ativo === a.i ? 1 : 0.35 }}
              onMouseEnter={() => setAtivo(a.i)}
              onClick={() => setAtivo(ativo === a.i ? null : a.i)}
            />
          ))}
        </svg>
        {/* centro: numero grande + rotulo/percentual em foco */}
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-6 text-center">
          <span className="tabular font-display text-[30px] font-extrabold leading-none text-spark-ink">
            {centroValor}
          </span>
          <span className="mt-1 max-w-full truncate text-[11px] font-medium text-spark-muted">
            {centroRotulo}
          </span>
        </div>
        <span className="sr-only" aria-hidden="false">{`Identificador do gráfico ${gradId}`}</span>
      </div>

      {/* legenda: sempre presente, com rotulo + valor + % (identidade nunca so por cor) */}
      <ul className="flex w-full min-w-0 flex-col gap-2">
        {segments.map((s, i) => {
          const pct = total > 0 ? Math.round((s.value / total) * 100) : 0;
          return (
            <li key={s.label}>
              <button
                type="button"
                onMouseEnter={() => setAtivo(i)}
                onMouseLeave={() => setAtivo(null)}
                onClick={() => setAtivo(ativo === i ? null : i)}
                className={`grid w-full min-w-0 grid-cols-[10px_minmax(0,1fr)_auto_36px] items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition ${
                  ativo === i ? "bg-spark-hover" : "hover:bg-spark-hover"
                }`}
              >
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: s.color }}
                  aria-hidden="true"
                />
                <span className="min-w-0 truncate text-[13px] font-medium text-spark-text">{s.label}</span>
                <span className="tabular justify-self-end whitespace-nowrap text-[13px] font-semibold text-spark-ink">
                  {s.value}
                </span>
                <span className="tabular w-9 justify-self-end whitespace-nowrap text-right text-[12px] text-spark-muted">
                  {pct}%
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
