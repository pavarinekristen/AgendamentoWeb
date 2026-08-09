import { useEffect, useRef, useState } from "react";
import { MagnifyingGlass, X, Buildings, CircleNotch, UserCircle } from "@phosphor-icons/react";
import {
  pesquisarClientes,
  listarEmpresas,
  ApiError,
  LIMITE_MAXIMO,
  type ClienteResumo,
} from "../lib/api";
import { ClienteCard } from "../components/ClienteCard";

const DEBOUNCE_MS = 300;
// Minimo de caracteres, igual ao da command palette e ao da busca de cliente
// do formulario de consulta: 1 letra varre a base inteira para nada.
const MINIMO = 2;

interface Props {
  onLogout: () => void;
  termoExterno?: { seq: number; termo: string };
  // Verdadeiro quando esta e a aba visivel (ver App.tsx).
  ativa?: boolean;
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
        <div className="h-7 w-28 rounded-sm bg-spark-surface" />
        <div className="h-7 w-24 rounded-sm bg-spark-surface" />
      </div>
    </li>
  );
}

export function SpotlightScreen({ onLogout, termoExterno, ativa = true }: Props) {
  const [termo, setTermo] = useState("");
  const [empresa, setEmpresa] = useState("");
  const [mostrarFiltro, setMostrarFiltro] = useState(false);
  const [resultados, setResultados] = useState<ClienteResumo[]>([]);
  // "buscando" saiu do status e virou flag separada: antes, cada tecla trocava
  // a lista por skeletons antes mesmo do debounce disparar. Isso desmontava os
  // ClienteCard — quem estivesse com um card aberto o via fechar sozinho a cada
  // caractere — e ainda perdia a rolagem. Agora a lista anterior fica na tela.
  const [status, setStatus] = useState<"vazio" | "curto" | "ok" | "erro">("vazio");
  const [buscando, setBuscando] = useState(false);
  const [erro, setErro] = useState("");
  const [empresas, setEmpresas] = useState<string[]>([]);
  const [erroEmpresas, setErroEmpresas] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const seqAplicado = useRef(0);
  // Incrementa apos editar/excluir um cliente para rebuscar a lista atual.
  const [refreshSeq, setRefreshSeq] = useState(0);

  // Todas as empresas cadastradas (mesma lista do dropdown do desktop).
  useEffect(() => {
    listarEmpresas()
      .then(setEmpresas)
      .catch(() => setErroEmpresas(true));
  }, []);

  // Busca disparada por outra aba (ex.: toque num vencimento em Avisos).
  useEffect(() => {
    if (!termoExterno || termoExterno.seq === 0 || termoExterno.seq === seqAplicado.current)
      return;
    seqAplicado.current = termoExterno.seq;
    setTermo(termoExterno.termo);
  }, [termoExterno]);

  // Foco automatico so no desktop: no celular abrir o teclado sozinho ao entrar
  // na aba atrapalha mais do que ajuda.
  useEffect(() => {
    if (!ativa) return;
    if (!window.matchMedia("(min-width: 1024px)").matches) return;
    inputRef.current?.focus();
  }, [ativa]);

  useEffect(() => {
    abortRef.current?.abort();
    const termoLimpo = termo.trim();
    const empresaLimpa = empresa.trim();

    if (!termoLimpo && !empresaLimpa) {
      setResultados([]);
      setBuscando(false);
      setStatus("vazio");
      return;
    }

    // Termo curto e sem filtro de empresa: nao vale a chamada.
    if (termoLimpo.length < MINIMO && empresaLimpa.length < MINIMO) {
      setBuscando(false);
      setStatus("curto");
      return;
    }

    setBuscando(true);
    const controller = new AbortController();
    abortRef.current = controller;

    const timer = setTimeout(async () => {
      try {
        const clientes = await pesquisarClientes(termoLimpo, empresaLimpa, controller.signal);
        if (controller.signal.aborted) return;
        setResultados(clientes);
        setErro("");
        setStatus("ok");
      } catch (err) {
        if (controller.signal.aborted) return;
        if (err instanceof ApiError && err.status === 401) {
          onLogout();
          return;
        }
        setErro(err instanceof ApiError ? err.message : "Falha na busca.");
        setStatus("erro");
      } finally {
        if (!controller.signal.aborted) setBuscando(false);
      }
    }, DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [termo, empresa, refreshSeq, onLogout]);

  const atingiuTeto = resultados.length >= LIMITE_MAXIMO;
  // Skeleton so na primeira busca. Tendo lista anterior, ela fica visivel e o
  // feedback de carregamento vai para o cabecalho.
  const primeiraBusca = buscando && resultados.length === 0;
  const temResultados = resultados.length > 0 && (status === "ok" || buscando);

  return (
    <div className="lg:mx-auto lg:max-w-6xl">
      <div className="sticky top-0 z-10 border-b border-spark-line bg-spark-page/95 px-4 py-3 backdrop-blur lg:px-0 lg:pt-2">
        <div className="relative lg:max-w-2xl">
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
            aria-label="Buscar cliente por nome, telefone, CPF ou ID"
            autoCapitalize="none"
            autoCorrect="off"
            enterKeyHint="search"
            className="h-14 w-full rounded-2xl border border-spark-inputline bg-spark-panel pl-11 pr-11 text-base text-spark-ink outline-none transition placeholder:text-spark-faint focus:border-spark-accent focus:ring-2 focus:ring-spark-accent/20"
          />
          {/* Giro discreto no lugar do skeleton: a lista abaixo continua de pe. */}
          {buscando && resultados.length > 0 && (
            <CircleNotch
              size={18}
              className="pointer-events-none absolute right-12 top-1/2 -translate-y-1/2 animate-spin text-spark-accent"
              aria-hidden="true"
            />
          )}
          {termo && (
            <button
              type="button"
              aria-label="Limpar busca"
              onClick={() => {
                setTermo("");
                inputRef.current?.focus();
              }}
              className="absolute right-2 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-sm text-spark-muted active:bg-spark-hover"
            >
              <X size={18} />
            </button>
          )}
        </div>

        <div className="mt-2 flex items-center gap-2">
          <button
            type="button"
            onClick={() => setMostrarFiltro((v) => !v)}
            aria-expanded={mostrarFiltro}
            className={`flex items-center gap-1.5 rounded-sm border px-3 py-1.5 text-sm font-medium transition ${
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
              className="flex items-center gap-1 rounded-sm border border-spark-line bg-spark-panel px-3 py-1.5 text-sm text-spark-muted"
            >
              <X size={14} />
              Limpar
            </button>
          )}
        </div>

        {mostrarFiltro && (
          <div className="mt-2 lg:max-w-md">
            <input
              type="text"
              list="empresas-sugestoes"
              value={empresa}
              onChange={(e) => setEmpresa(e.target.value)}
              placeholder="Nome da empresa"
              aria-label="Filtrar por empresa"
              autoCapitalize="none"
              autoCorrect="off"
              className="h-12 w-full rounded-xl border border-spark-inputline bg-spark-panel px-4 text-base text-spark-ink outline-none transition placeholder:text-spark-faint focus:border-spark-accent focus:ring-2 focus:ring-spark-accent/20"
            />
            <datalist id="empresas-sugestoes">
              {empresas.map((e) => (
                <option key={e} value={e} />
              ))}
            </datalist>
            {erroEmpresas && (
              <p className="mt-1.5 text-[12.5px] text-spark-muted">
                Nao foi possivel carregar a lista de empresas — digite o nome mesmo assim.
              </p>
            )}
          </div>
        )}
      </div>

      <section className="px-4 py-4 lg:px-0">
        {/* Regiao viva: leitor de tela anuncia o fim da busca e a contagem. */}
        <p role="status" aria-live="polite" className="sr-only">
          {buscando
            ? "Buscando clientes"
            : status === "ok"
              ? `${resultados.length} resultado${resultados.length === 1 ? "" : "s"}`
              : ""}
        </p>

        {status === "vazio" && (
          <div className="mt-10 flex flex-col items-center text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-spark-soft">
              <MagnifyingGlass size={30} className="text-spark-accent" />
            </div>
            <p className="mt-4 max-w-[260px] text-sm leading-relaxed text-spark-body">
              Digite nome, telefone, CPF ou ID. A busca varre toda a base de clientes.
            </p>
          </div>
        )}

        {status === "curto" && (
          <div className="mt-10 flex flex-col items-center text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-spark-surface">
              <MagnifyingGlass size={30} className="text-spark-muted" />
            </div>
            <p className="mt-4 text-sm text-spark-body">
              Digite pelo menos {MINIMO} caracteres.
            </p>
          </div>
        )}

        {primeiraBusca && (
          <ul className="flex flex-col gap-3 lg:grid lg:grid-cols-2 lg:items-start" aria-busy="true">
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </ul>
        )}

        {status === "erro" && !buscando && (
          <p className="mt-6 rounded-xl border border-spark-danger/20 bg-spark-danger/5 px-4 py-3 text-center text-sm text-spark-danger">
            {erro}
          </p>
        )}

        {status === "ok" && !buscando && resultados.length === 0 && (
          <div className="mt-10 flex flex-col items-center text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-spark-surface">
              <UserCircle size={30} className="text-spark-muted" />
            </div>
            <p className="mt-4 text-sm font-semibold text-spark-text">Nenhum cliente encontrado.</p>
            <p className="mt-1 text-sm text-spark-muted">Confira a grafia ou tente outro dado.</p>
          </div>
        )}

        {temResultados && (
          <>
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-spark-muted">
              {atingiuTeto
                ? `Mostrando os primeiros ${LIMITE_MAXIMO}. Refine a busca para ver o restante.`
                : `${resultados.length} resultado${resultados.length === 1 ? "" : "s"}`}
            </p>
            <ul
              className={`flex flex-col gap-3 transition-opacity lg:grid lg:grid-cols-2 lg:items-start ${
                buscando ? "opacity-60" : ""
              }`}
            >
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
