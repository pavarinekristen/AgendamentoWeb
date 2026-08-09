import { useEffect, useMemo, useRef, useState } from "react";
import { MagnifyingGlass, UserCircle, ArrowRight, ArrowUp, ArrowDown, CornersOut } from "@phosphor-icons/react";
import { pesquisarClientes, type ClienteResumo } from "../lib/api";
import { ABAS, type Aba } from "./BottomNav";

// Command palette estilo Linear/Superhuman (pesquisa UX desktop): abre no
// Cmd/Ctrl+K, navega por teclado, busca cliente com debounce. So faz sentido
// no desktop da recepcao — no mobile o app ja tem a aba Busca dedicada.

interface Props {
  aberto: boolean;
  onFechar: () => void;
  onNavegar: (aba: Aba) => void;
  onAbrirCliente: (nome: string) => void;
}

interface Acao {
  chave: string;
  grupo: "Ir para" | "Clientes";
  rotulo: string;
  detalhe?: string;
  Icone: typeof UserCircle;
  executar: () => void;
}

const DEBOUNCE_MS = 250;

function normalizar(v: string): string {
  return (v || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

export function CommandPalette({ aberto, onFechar, onNavegar, onAbrirCliente }: Props) {
  const [termo, setTermo] = useState("");
  const [clientes, setClientes] = useState<ClienteResumo[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [sel, setSel] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listaRef = useRef<HTMLDivElement>(null);

  // Ao abrir: foca o campo e zera o estado.
  useEffect(() => {
    if (!aberto) return;
    setTermo("");
    setClientes([]);
    setSel(0);
    const t = window.setTimeout(() => inputRef.current?.focus(), 20);
    return () => window.clearTimeout(t);
  }, [aberto]);

  // Busca de cliente com debounce + cancelamento (>=2 caracteres).
  useEffect(() => {
    if (!aberto) return;
    const t = termo.trim();
    if (t.length < 2) {
      setClientes([]);
      setBuscando(false);
      return;
    }
    const controller = new AbortController();
    setBuscando(true);
    const timer = window.setTimeout(() => {
      pesquisarClientes(t, "", controller.signal)
        .then((lista) => {
          if (!controller.signal.aborted) setClientes(lista.slice(0, 6));
        })
        .catch(() => {
          /* best-effort: sessao/erros sao tratados nos fluxos principais */
        })
        .finally(() => {
          if (!controller.signal.aborted) setBuscando(false);
        });
    }, DEBOUNCE_MS);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [termo, aberto]);

  // Monta a lista achatada (navegacao + clientes) que o teclado percorre.
  const acoes = useMemo<Acao[]>(() => {
    const q = normalizar(termo);
    const nav: Acao[] = ABAS.filter((a) => !q || normalizar(a.rotulo).includes(q)).map((a) => ({
      chave: `nav-${a.id}`,
      grupo: "Ir para",
      rotulo: a.rotulo,
      Icone: a.Icone,
      executar: () => {
        onNavegar(a.id);
        onFechar();
      },
    }));
    const cli: Acao[] = clientes.map((c) => ({
      chave: `cli-${c.idLocal}`,
      grupo: "Clientes",
      rotulo: c.nome || "(sem nome)",
      detalhe: [c.empresa, c.cargo].filter(Boolean).join(" · "),
      Icone: UserCircle,
      executar: () => {
        if (c.nome) onAbrirCliente(c.nome);
        onFechar();
      },
    }));
    return [...nav, ...cli];
  }, [termo, clientes, onNavegar, onAbrirCliente, onFechar]);

  // Mantem a selecao dentro dos limites quando a lista muda.
  useEffect(() => {
    setSel((s) => Math.min(s, Math.max(0, acoes.length - 1)));
  }, [acoes.length]);

  // Rola o item selecionado para a area visivel.
  useEffect(() => {
    listaRef.current?.querySelector<HTMLElement>(`[data-idx="${sel}"]`)?.scrollIntoView({ block: "nearest" });
  }, [sel]);

  if (!aberto) return null;

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSel((s) => (acoes.length ? (s + 1) % acoes.length : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSel((s) => (acoes.length ? (s - 1 + acoes.length) % acoes.length : 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      acoes[sel]?.executar();
    } else if (e.key === "Escape") {
      e.preventDefault();
      onFechar();
    }
  }

  // Cabecalho de grupo aparece só na primeira ocorrencia do grupo.
  let grupoAtual = "";

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center bg-black/30 px-4 pt-[12vh] backdrop-blur-sm"
      onMouseDown={onFechar}
      role="presentation"
    >
      <div
        className="cmdk-in w-full max-w-xl overflow-hidden rounded-2xl border border-spark-line bg-spark-panel shadow-[0_32px_80px_-24px_rgba(28,25,23,0.6)]"
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Busca rápida e comandos"
      >
        <div className="flex items-center gap-3 border-b border-spark-line px-4">
          <MagnifyingGlass size={20} className="shrink-0 text-spark-muted" />
          <input
            ref={inputRef}
            value={termo}
            onChange={(e) => setTermo(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Buscar cliente ou ir para uma seção..."
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            className="h-14 flex-1 bg-transparent text-[15px] text-spark-ink outline-none placeholder:text-spark-faint"
          />
          <kbd className="hidden shrink-0 rounded-md border border-spark-inputline bg-spark-surface px-1.5 py-0.5 text-[11px] font-semibold text-spark-muted sm:block">
            esc
          </kbd>
        </div>

        <div ref={listaRef} className="max-h-[52vh] overflow-y-auto py-2">
          {acoes.length === 0 && (
            <p className="px-4 py-6 text-center text-sm text-spark-muted">
              {buscando ? "Buscando..." : termo.trim().length >= 2 ? "Nenhum resultado." : "Digite para buscar clientes."}
            </p>
          )}

          {acoes.map((a, i) => {
            const novoGrupo = a.grupo !== grupoAtual;
            grupoAtual = a.grupo;
            const ativo = i === sel;
            const Icone = a.Icone;
            return (
              <div key={a.chave}>
                {novoGrupo && (
                  <p className="px-4 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-spark-faint">
                    {a.grupo}
                    {a.grupo === "Clientes" && buscando ? " · buscando..." : ""}
                  </p>
                )}
                <button
                  type="button"
                  data-idx={i}
                  onMouseEnter={() => setSel(i)}
                  onClick={() => a.executar()}
                  className={`flex w-full items-center gap-3 px-4 py-2.5 text-left transition ${
                    ativo ? "bg-spark-soft" : "hover:bg-spark-hover"
                  }`}
                >
                  <Icone
                    size={18}
                    weight={ativo ? "fill" : "regular"}
                    className={ativo ? "text-spark-accent-strong" : "text-spark-muted"}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-semibold text-spark-ink">{a.rotulo}</span>
                    {a.detalhe && <span className="block truncate text-xs text-spark-muted">{a.detalhe}</span>}
                  </span>
                  {ativo && <ArrowRight size={15} className="shrink-0 text-spark-accent-strong" />}
                </button>
              </div>
            );
          })}
        </div>

        <div className="flex items-center gap-4 border-t border-spark-line px-4 py-2 text-[11px] text-spark-muted">
          <span className="flex items-center gap-1">
            <ArrowUp size={12} />
            <ArrowDown size={12} />
            navegar
          </span>
          <span className="flex items-center gap-1">
            <CornersOut size={12} />
            enter abre
          </span>
        </div>
      </div>
    </div>
  );
}
