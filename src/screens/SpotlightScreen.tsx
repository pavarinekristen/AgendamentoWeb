import { useEffect, useRef, useState } from "react";
import { MagnifyingGlass, X, Buildings, CalendarBlank, UserCircle } from "@phosphor-icons/react";
import {
  pesquisarClientes,
  listarEmpresas,
  ApiError,
  LIMITE_MAXIMO,
  type ClienteResumo,
} from "../lib/api";
import { ClienteCard } from "../components/ClienteCard";

const DEBOUNCE_MS = 300;

interface Props {
  onLogout: () => void;
  termoExterno?: { seq: number; termo: string };
}

function SkeletonCard() {
  return (
    <li className="animate-pulse rounded-2xl border border-spark-line bg-spark-panel p-4">
      <div className="flex items-center gap-3">
        <div className="h-11 w-11 rounded-full bg-spark-surface" />
        <div className="flex-1">
          <div className="mb-2 h-4 w-2/3 rounded bg-spark-surface" />
          <div className="h-3 w-1/2 rounded bg-spark-surface" />
        </div>
      </div>
      <div className="mt-3 flex gap-2">
        <div className="h-7 w-28 rounded-full bg-spark-surface" />
        <div className="h-7 w-24 rounded-full bg-spark-surface" />
      </div>
    </li>
  );
}

export function SpotlightScreen({ onLogout, termoExterno }: Props) {
  const [termo, setTermo] = useState("");
  const [empresa, setEmpresa] = useState("");
  const [mostrarFiltro, setMostrarFiltro] = useState(false);
  const [resultados, setResultados] = useState<ClienteResumo[]>([]);
  const [status, setStatus] = useState<"vazio" | "buscando" | "ok" | "erro">("vazio");
  const [erro, setErro] = useState("");
  const [empresas, setEmpresas] = useState<string[]>([]);

  // Todas as empresas cadastradas (mesma lista do dropdown do desktop).
  useEffect(() => {
    listarEmpresas().then(setEmpresas).catch(() => {});
  }, []);
  const abortRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const seqAplicado = useRef(0);
  // Incrementa apos editar/excluir um cliente para rebuscar a lista atual.
  const [refreshSeq, setRefreshSeq] = useState(0);

  // Busca disparada por outra aba (ex.: toque num vencimento em Avisos).
  useEffect(() => {
    if (!termoExterno || termoExterno.seq === 0 || termoExterno.seq === seqAplicado.current)
      return;
    seqAplicado.current = termoExterno.seq;
    setTermo(termoExterno.termo);
  }, [termoExterno]);

  useEffect(() => {
    abortRef.current?.abort();
    const termoLimpo = termo.trim();
    const empresaLimpa = empresa.trim();

    if (!termoLimpo && !empresaLimpa) {
      setResultados([]);
      setStatus("vazio");
      return;
    }

    setStatus("buscando");
    const controller = new AbortController();
    abortRef.current = controller;

    const timer = setTimeout(async () => {
      try {
        const clientes = await pesquisarClientes(termoLimpo, empresaLimpa, controller.signal);
        if (controller.signal.aborted) return;
        setResultados(clientes);
        setStatus("ok");
      } catch (err) {
        if (controller.signal.aborted) return;
        if (err instanceof ApiError && err.status === 401) {
          onLogout();
          return;
        }
        setErro(err instanceof ApiError ? err.message : "Falha na busca.");
        setStatus("erro");
      }
    }, DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [termo, empresa, refreshSeq, onLogout]);

  const atingiuTeto = resultados.length >= LIMITE_MAXIMO;

  return (
    <div>
      <div className="sticky top-0 z-10 border-b border-spark-line bg-spark-page/95 px-4 py-3 backdrop-blur">
        <div className="relative">
          <MagnifyingGlass
            size={19}
            className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-spark-muted"
          />
          <input
            ref={inputRef}
            type="search"
            value={termo}
            onChange={(e) => setTermo(e.target.value)}
            placeholder="Nome, telefone, CPF ou ID..."
            autoCapitalize="none"
            autoCorrect="off"
            enterKeyHint="search"
            className="h-14 w-full rounded-2xl border border-spark-inputline bg-spark-panel pl-11 pr-11 text-base text-spark-ink shadow-[0_10px_24px_-20px_rgba(28,25,23,0.4)] outline-none transition placeholder:text-spark-faint focus:border-spark-accent focus:ring-2 focus:ring-spark-accent/20"
          />
          {termo && (
            <button
              type="button"
              aria-label="Limpar busca"
              onClick={() => {
                setTermo("");
                inputRef.current?.focus();
              }}
              className="absolute right-2 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full text-spark-muted active:bg-spark-hover"
            >
              <X size={18} />
            </button>
          )}
        </div>

        <div className="mt-2 flex items-center gap-2">
          <button
            type="button"
            onClick={() => setMostrarFiltro((v) => !v)}
            className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition ${
              empresa.trim()
                ? "border-spark-accent/30 bg-spark-soft text-spark-accent-strong"
                : "border-spark-line bg-spark-panel text-spark-body"
            }`}
          >
            <Buildings size={15} />
            {empresa.trim() ? `Empresa: ${empresa.trim()}` : "Filtrar por empresa"}
          </button>
          {empresa.trim() && (
            <button
              type="button"
              aria-label="Limpar filtro de empresa"
              onClick={() => setEmpresa("")}
              className="flex items-center gap-1 rounded-full border border-spark-line bg-spark-panel px-3 py-1.5 text-sm text-spark-muted"
            >
              <X size={14} />
              Limpar
            </button>
          )}
        </div>

        {mostrarFiltro && (
          <div className="mt-2">
            <input
              type="text"
              list="empresas-sugestoes"
              value={empresa}
              onChange={(e) => setEmpresa(e.target.value)}
              placeholder="Nome da empresa"
              autoCapitalize="none"
              autoCorrect="off"
              className="h-12 w-full rounded-xl border border-spark-inputline bg-spark-panel px-4 text-base text-spark-ink outline-none transition placeholder:text-spark-faint focus:border-spark-accent focus:ring-2 focus:ring-spark-accent/20"
            />
            <datalist id="empresas-sugestoes">
              {empresas.map((e) => (
                <option key={e} value={e} />
              ))}
            </datalist>
          </div>
        )}
      </div>

      <section className="px-4 py-4">
        {status === "vazio" && (
          <div className="mt-10 flex flex-col items-center text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-spark-soft">
              <CalendarBlank size={30} className="text-spark-accent" />
            </div>
            <p className="mt-4 max-w-[260px] text-sm leading-relaxed text-spark-body">
              Digite nome, telefone, CPF ou ID. A busca varre toda a base de clientes.
            </p>
          </div>
        )}

        {status === "buscando" && (
          <ul className="flex flex-col gap-3" aria-label="Carregando resultados">
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </ul>
        )}

        {status === "erro" && (
          <p className="mt-6 rounded-xl border border-spark-danger/20 bg-spark-danger/5 px-4 py-3 text-center text-sm text-spark-danger">
            {erro}
          </p>
        )}

        {status === "ok" && resultados.length === 0 && (
          <div className="mt-10 flex flex-col items-center text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-spark-surface">
              <UserCircle size={30} className="text-spark-muted" />
            </div>
            <p className="mt-4 text-sm font-semibold text-spark-text">Nenhum cliente encontrado.</p>
            <p className="mt-1 text-sm text-spark-muted">Confira a grafia ou tente outro dado.</p>
          </div>
        )}

        {status === "ok" && resultados.length > 0 && (
          <>
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-spark-muted">
              {atingiuTeto
                ? `Mostrando os primeiros ${LIMITE_MAXIMO}. Refine a busca para ver o restante.`
                : `${resultados.length} resultado(s)`}
            </p>
            <ul className="flex flex-col gap-3">
              {resultados.map((c, i) => (
                <ClienteCard
                  key={c.idLocal || i}
                  cliente={c}
                  onAtualizado={() => setRefreshSeq((s) => s + 1)}
                  onSessaoExpirada={onLogout}
                />
              ))}
            </ul>
          </>
        )}
      </section>
    </div>
  );
}
