import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { CheckCircle, WarningCircle, Info, X } from "@phosphor-icons/react";

// Feedback nao-intrusivo (pesquisa UX: toast > modal para confirmar acoes leves).
// Some sozinho em ~3.5s, empilha, tem aria-live e nao bloqueia a tela.

type ToastTipo = "sucesso" | "erro" | "info";

interface ToastItem {
  id: number;
  tipo: ToastTipo;
  texto: string;
}

interface ToastAPI {
  sucesso: (texto: string) => void;
  erro: (texto: string) => void;
  info: (texto: string) => void;
}

const ToastCtx = createContext<ToastAPI | null>(null);

// Fora do provider (ex.: testes) vira no-op em vez de quebrar a tela.
const NOOP: ToastAPI = { sucesso: () => {}, erro: () => {}, info: () => {} };

export function useToast(): ToastAPI {
  return useContext(ToastCtx) ?? NOOP;
}

const ICONE = { sucesso: CheckCircle, erro: WarningCircle, info: Info } as const;
const COR = {
  sucesso: "text-spark-success",
  erro: "text-spark-danger",
  info: "text-spark-accent-strong",
} as const;

const DURACAO_MS = 3500;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [itens, setItens] = useState<ToastItem[]>([]);
  const seq = useRef(0);
  const timers = useRef<Record<number, number>>({});

  const remover = useCallback((id: number) => {
    setItens((a) => a.filter((t) => t.id !== id));
    const timer = timers.current[id];
    if (timer) {
      window.clearTimeout(timer);
      delete timers.current[id];
    }
  }, []);

  const push = useCallback(
    (tipo: ToastTipo, texto: string) => {
      const id = ++seq.current;
      setItens((a) => [...a.slice(-2), { id, tipo, texto }]); // no maximo 3 na tela
      timers.current[id] = window.setTimeout(() => remover(id), DURACAO_MS);
    },
    [remover],
  );

  const api = useMemo<ToastAPI>(
    () => ({
      sucesso: (t) => push("sucesso", t),
      erro: (t) => push("erro", t),
      info: (t) => push("info", t),
    }),
    [push],
  );

  // Limpa timers pendentes ao desmontar (evita setState em componente morto).
  useEffect(() => {
    const registrados = timers.current;
    return () => Object.values(registrados).forEach(window.clearTimeout);
  }, []);

  return (
    <ToastCtx.Provider value={api}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 z-[70] flex flex-col items-center gap-2 px-4"
        style={{ bottom: "calc(env(safe-area-inset-bottom) + 5.5rem)" }}
      >
        {itens.map((t) => {
          const Icone = ICONE[t.tipo];
          return (
            <div
              key={t.id}
              role="status"
              className="toast-in pointer-events-auto flex w-full max-w-sm items-center gap-2.5 rounded-xl border border-spark-line bg-spark-panel px-4 py-3 shadow-[0_16px_40px_-16px_rgba(28,25,23,0.5)]"
            >
              <Icone size={20} weight="fill" className={`shrink-0 ${COR[t.tipo]}`} />
              <p className="flex-1 text-[14px] font-medium text-spark-ink">{t.texto}</p>
              <button
                type="button"
                aria-label="Fechar aviso"
                onClick={() => remover(t.id)}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-spark-muted transition active:bg-spark-hover"
              >
                <X size={15} />
              </button>
            </div>
          );
        })}
      </div>
    </ToastCtx.Provider>
  );
}
