import { useEffect, useMemo, useRef, useState } from "react";
import { BellSimple, CalendarCheck, WarningCircle, Check } from "@phosphor-icons/react";

// Sino de notificacoes do header: badge de nao-lidas + painel dropdown limpo.
// Abrir marca os itens como lidos (persistido em localStorage, para nao
// re-alarmar os mesmos eventos a cada abertura do app).

export interface Notificacao {
  id: string;
  tipo: "consulta" | "vencimento";
  titulo: string;
  descricao: string;
  quando?: string;
  onAbrir?: () => void;
}

const LIDAS_KEY = "agendamentoweb.notificacoes-lidas";

function carregarLidas(): Set<string> {
  try {
    const raw = localStorage.getItem(LIDAS_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

const ICONES = {
  consulta: CalendarCheck,
  vencimento: WarningCircle,
} as const;

export function NotificationBell({ itens }: { itens: Notificacao[] }) {
  const [aberto, setAberto] = useState(false);
  const [lidas, setLidas] = useState<Set<string>>(carregarLidas);
  const ref = useRef<HTMLDivElement>(null);

  const naoLidas = useMemo(() => itens.filter((i) => !lidas.has(i.id)).length, [itens, lidas]);

  // Fecha ao clicar fora ou apertar Esc.
  useEffect(() => {
    if (!aberto) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setAberto(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setAberto(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [aberto]);

  function abrir() {
    const proximo = !aberto;
    setAberto(proximo);
    // Ao abrir, marca tudo que esta na lista como lido.
    if (proximo && itens.length > 0) {
      const novo = new Set(lidas);
      for (const i of itens) novo.add(i.id);
      setLidas(novo);
      try {
        localStorage.setItem(LIDAS_KEY, JSON.stringify([...novo]));
      } catch {
        /* localStorage indisponivel: badge apenas nao persiste */
      }
    }
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={abrir}
        aria-label={`Notificacoes${naoLidas > 0 ? ` (${naoLidas} nao lidas)` : ""}`}
        aria-expanded={aberto}
        className={`relative flex h-10 w-10 items-center justify-center rounded-full text-spark-body transition hover:bg-spark-hover active:scale-95 ${
          aberto ? "bg-spark-hover" : ""
        }`}
      >
        <BellSimple size={21} weight={naoLidas > 0 ? "fill" : "regular"} />
        {naoLidas > 0 && (
          <span className="absolute right-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-spark-danger px-1 text-[10px] font-bold leading-none text-white ring-2 ring-spark-panel">
            {naoLidas > 9 ? "9+" : naoLidas}
          </span>
        )}
      </button>

      {aberto && (
        <>
          {/* backdrop sutil no mobile p/ foco */}
          <div className="fixed inset-0 z-40 bg-black/5 lg:hidden" aria-hidden="true" />
          <div
            role="dialog"
            aria-label="Notificacoes"
            className="absolute right-0 top-full z-50 mt-2 w-[min(20rem,calc(100vw-1.5rem))] origin-top-right overflow-hidden rounded-2xl border border-spark-line bg-spark-panel shadow-[0_24px_48px_-16px_rgba(28,25,23,0.35)]"
            style={{ animation: "tab-in 0.16s ease both" }}
          >
            <div className="flex items-center justify-between border-b border-spark-line px-4 py-3">
              <p className="font-display text-[15px] font-bold text-spark-ink">Notificacoes</p>
              <span className="text-[12px] font-medium text-spark-muted">
                {itens.length === 0 ? "nenhuma" : `${itens.length} evento(s)`}
              </span>
            </div>

            {itens.length === 0 ? (
              <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-spark-surface">
                  <Check size={22} className="text-spark-success" />
                </div>
                <p className="text-[13px] font-medium text-spark-text">Tudo em dia!</p>
                <p className="text-[12px] text-spark-muted">Sem eventos para revisar agora.</p>
              </div>
            ) : (
              <ul className="max-h-[min(24rem,60vh)] overflow-y-auto">
                {itens.map((n) => {
                  const Icone = ICONES[n.tipo];
                  const critico = n.tipo === "vencimento";
                  return (
                    <li key={n.id} className="border-b border-spark-line last:border-0">
                      <button
                        type="button"
                        onClick={() => {
                          n.onAbrir?.();
                          setAberto(false);
                        }}
                        className="flex w-full items-start gap-3 px-4 py-3 text-left transition hover:bg-spark-hover"
                      >
                        <span
                          className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                            critico ? "bg-spark-danger/10 text-spark-danger" : "bg-spark-soft text-spark-accent-strong"
                          }`}
                        >
                          <Icone size={17} weight="fill" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13.5px] font-semibold text-spark-ink">
                            {n.titulo}
                          </span>
                          <span className="mt-0.5 block truncate text-[12.5px] text-spark-body">
                            {n.descricao}
                          </span>
                          {n.quando && (
                            <span className="mt-1 inline-block rounded-full bg-spark-surface px-2 py-0.5 text-[11px] font-medium text-spark-muted">
                              {n.quando}
                            </span>
                          )}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}
