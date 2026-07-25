import { useCallback, useEffect, useMemo, useState } from "react";
import { SignOut, List, MagnifyingGlass, Fingerprint } from "@phosphor-icons/react";
import {
  session,
  validarSessao,
  listarVencimentos,
  listarAgenda,
  mostrarPasskeyUI,
  type AuthUsuario,
  type VencimentoItem,
  type AgendaItem,
} from "./lib/api";
import { NotificationBell, type Notificacao } from "./components/NotificationBell";
import { GerenciarPasskeys } from "./components/GerenciarPasskeys";
import { hojeIso } from "./lib/datas";
import { LoginScreen } from "./screens/LoginScreen";
import { InicioScreen } from "./screens/InicioScreen";
import { SpotlightScreen } from "./screens/SpotlightScreen";
import { CadastroScreen } from "./screens/CadastroScreen";
import { AgendaScreen } from "./screens/AgendaScreen";
import { AgendarScreen } from "./screens/AgendarScreen";
import { LaudosScreen } from "./screens/LaudosScreen";
import { ResumoScreen } from "./screens/ResumoScreen";
import { BottomNav, ABAS, type Aba } from "./components/BottomNav";
import { CommandPalette } from "./components/CommandPalette";

// Casca responsiva: no celular (PWA instalado) e um app com barra inferior;
// no desktop (lg+) e um sistema com menu lateral recolhivel, como o WPF.

const TITULOS: Record<Aba, string> = {
  inicio: "Inicio",
  busca: "Pesquisa de clientes",
  agenda: "Agenda",
  agendar: "Agendar consulta",
  cadastro: "Novo cliente",
  laudos: "Laudos",
  resumo: "Resumo e avisos",
};

const MENU_KEY = "agendamentoweb.menu-recolhido";

// Badging API: numero no icone do PWA instalado (Android/desktop; iOS 16.4+).
function atualizarBadgeApp(n: number) {
  const nav = navigator as Navigator & {
    setAppBadge?: (n?: number) => Promise<void>;
    clearAppBadge?: () => Promise<void>;
  };
  if (n > 0) nav.setAppBadge?.(n).catch(() => {});
  else nav.clearAppBadge?.().catch(() => {});
}

export default function App() {
  // Usuario nunca e persistido: chega do /auth/me e fica so em memoria.
  const [usuario, setUsuario] = useState<AuthUsuario | null>(null);
  const [logado, setLogado] = useState<boolean>(() => Boolean(session.token));
  const [aba, setAba] = useState<Aba>("inicio");
  // Pilha de navegacao: alimenta a setinha de voltar das secoes.
  const [, setHistorico] = useState<Aba[]>([]);
  const [menuRecolhido, setMenuRecolhido] = useState<boolean>(
    () => localStorage.getItem(MENU_KEY) === "1",
  );
  const [buscaExterna, setBuscaExterna] = useState<{ seq: number; termo: string }>({
    seq: 0,
    termo: "",
  });
  const [avisosBadge, setAvisosBadge] = useState(0);
  const [vencimentos, setVencimentos] = useState<VencimentoItem[]>([]);
  const [consultasHoje, setConsultasHoje] = useState<AgendaItem[]>([]);
  // Data pre-selecionada ao entrar em Agendar pela Agenda + invalidacao do
  // cache do calendario quando algo e agendado.
  const [agendarData, setAgendarData] = useState<string | undefined>(undefined);
  const [agendaRefreshSeq, setAgendaRefreshSeq] = useState(0);
  const [paletteAberto, setPaletteAberto] = useState(false);
  const [passkeysAberto, setPasskeysAberto] = useState(false);
  const mostrarPasskeys = mostrarPasskeyUI();

  const mudarAba = useCallback(
    (nova: Aba) => {
      if (nova === aba) return;
      setHistorico((h) => [...h.slice(-9), aba]);
      setAba(nova);
    },
    [aba],
  );

  const voltar = useCallback(() => {
    setHistorico((h) => {
      const copia = [...h];
      const anterior = copia.pop();
      setAba(anterior ?? "inicio");
      return copia;
    });
  }, []);

  const alternarMenu = useCallback(() => {
    setMenuRecolhido((v) => {
      localStorage.setItem(MENU_KEY, v ? "0" : "1");
      return !v;
    });
  }, []);

  const sair = useCallback(() => {
    session.clear();
    setLogado(false);
    setUsuario(null);
    setAba("inicio");
    setHistorico([]);
    atualizarBadgeApp(0);
  }, []);

  // Revalida o token guardado ao abrir; expirou, volta para o login. E daqui
  // que sai o nome exibido no cabecalho — nada disso fica gravado no aparelho.
  useEffect(() => {
    if (!logado) return;
    validarSessao()
      .then((info) => {
        if (info.usuario) setUsuario({ nome: info.usuario.nome, email: info.usuario.email });
      })
      .catch(() => sair());
  }, [logado, sair]);

  // Fonte das notificacoes: vencimentos criticos + consultas de hoje.
  useEffect(() => {
    if (!logado) return;
    listarVencimentos(90)
      .then((v) => {
        setVencimentos(v);
        const criticos = v.filter((i) => i.diasRestantes <= 30).length;
        setAvisosBadge(criticos);
        atualizarBadgeApp(criticos);
      })
      .catch(() => {});
    const hoje = hojeIso();
    listarAgenda(hoje, hoje)
      .then((c) =>
        setConsultasHoje(
          [...c]
            .filter((i) => !i.status?.toLowerCase().includes("cancel"))
            .sort((a, b) => (a.horario || "").localeCompare(b.horario || "")),
        ),
      )
      .catch(() => {});
  }, [logado]);

  const buscarCliente = useCallback(
    (nome: string) => {
      setBuscaExterna((b) => ({ seq: b.seq + 1, termo: nome }));
      mudarAba("busca");
    },
    [mudarAba],
  );

  const abrirAgendar = useCallback(
    (dataIso?: string) => {
      setAgendarData(dataIso);
      mudarAba("agendar");
    },
    [mudarAba],
  );

  // Eventos do sino: consultas de hoje primeiro, depois vencimentos criticos.
  const notificacoes: Notificacao[] = useMemo(() => {
    const deHoje: Notificacao[] = consultasHoje.map((c) => ({
      id: `consulta-${c.idLocal}`,
      tipo: "consulta",
      titulo: c.clienteNome || "Consulta agendada",
      descricao: [c.motivo, c.local].filter(Boolean).join(" · ") || "Consulta de hoje",
      quando: c.horario ? `Hoje as ${c.horario}` : "Hoje",
      onAbrir: c.clienteNome ? () => buscarCliente(c.clienteNome) : undefined,
    }));
    const aVencer: Notificacao[] = vencimentos
      .filter((v) => v.diasRestantes <= 30)
      .sort((a, b) => a.diasRestantes - b.diasRestantes)
      .map((v) => ({
        id: `venc-${v.clienteIdLocal}-${v.vencimentoEm}`,
        tipo: "vencimento",
        titulo: v.clienteNome,
        descricao: `Periodico ${v.empresa ? `· ${v.empresa}` : ""}`.trim(),
        quando:
          v.diasRestantes <= 0
            ? "Vencido"
            : v.diasRestantes === 1
              ? "Vence amanha"
              : `Vence em ${v.diasRestantes} dias`,
        onAbrir: () => buscarCliente(v.clienteNome),
      }));
    return [...deHoje, ...aVencer];
  }, [consultasHoje, vencimentos, buscarCliente]);

  // Barra de status acompanha a tela: escura no login, clara no app.
  useEffect(() => {
    const meta = document.querySelector('meta[name="theme-color"]');
    meta?.setAttribute("content", logado ? "#ffffff" : "#201914");
  }, [logado]);

  // Atalho global Cmd/Ctrl+K abre a command palette (uso de teclado na recepcao).
  useEffect(() => {
    if (!logado) return;
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        setPaletteAberto((v) => !v);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [logado]);

  if (!logado) {
    return (
      <LoginScreen
        onLogged={(u) => {
          setUsuario(u);
          setLogado(true);
        }}
      />
    );
  }

  const primeiroNome = (usuario?.nome || usuario?.email || "").split(" ")[0];

  const conteudo = (
    <>
      <div className={aba === "inicio" ? "tab-anim" : "hidden"}>
        <InicioScreen
          onSessaoExpirada={sair}
          onNovaConsulta={() => abrirAgendar(hojeIso())}
          onNovoCliente={() => mudarAba("cadastro")}
          onBuscarCliente={() => mudarAba("busca")}
          onAbrirAgenda={() => mudarAba("agenda")}
          refreshSeq={agendaRefreshSeq}
        />
      </div>
      <div className={aba === "busca" ? "tab-anim" : "hidden"}>
        <SpotlightScreen onLogout={sair} termoExterno={buscaExterna} />
      </div>
      <div className={aba === "agenda" ? "tab-anim" : "hidden"}>
        <AgendaScreen
          onSessaoExpirada={sair}
          onBuscarCliente={buscarCliente}
          onAgendar={abrirAgendar}
          onDadosAlterados={() => setAgendaRefreshSeq((s) => s + 1)}
          refreshSeq={agendaRefreshSeq}
        />
      </div>
      <div className={aba === "agendar" ? "tab-anim" : "hidden"}>
        <AgendarScreen
          dataInicial={agendarData}
          onSessaoExpirada={sair}
          onAgendado={() => setAgendaRefreshSeq((s) => s + 1)}
          onVerAgenda={() => mudarAba("agenda")}
          onVoltar={voltar}
        />
      </div>
      <div className={aba === "cadastro" ? "tab-anim" : "hidden"}>
        <CadastroScreen onSessaoExpirada={sair} onBuscarCliente={buscarCliente} onVoltar={voltar} />
      </div>
      <div className={aba === "laudos" ? "tab-anim" : "hidden"}>
        <LaudosScreen onSessaoExpirada={sair} onVoltar={voltar} refreshSeq={agendaRefreshSeq} />
      </div>
      <div className={aba === "resumo" ? "tab-anim" : "hidden"}>
        <ResumoScreen
          onSessaoExpirada={sair}
          vencimentos={vencimentos}
          onBuscarCliente={buscarCliente}
        />
      </div>
    </>
  );

  return (
    <div className="flex h-dvh overflow-hidden bg-spark-page">
      {/* ── Menu lateral recolhivel (so desktop) ─────────────────── */}
      <aside
        className={`hidden flex-none flex-col border-r border-spark-line bg-gradient-to-b from-spark-panel to-spark-surface shadow-[1px_0_0_rgba(28,25,23,0.02)] transition-[width] duration-300 ease-out lg:flex ${
          menuRecolhido ? "w-[76px]" : "w-64"
        }`}
      >
        <div
          className={`flex items-center pb-3 pt-4 ${
            menuRecolhido ? "flex-col gap-3 px-0" : "justify-between px-4"
          }`}
        >
          <div className={`flex items-center gap-2.5 ${menuRecolhido ? "" : "min-w-0"}`}>
            <img
              src="/icon-192.png"
              alt="SparkCore"
              className="h-9 w-9 shrink-0 rounded-xl shadow-sm ring-1 ring-spark-line"
            />
            {!menuRecolhido && (
              <div className="min-w-0">
                <p className="truncate font-display text-[15px] font-bold leading-tight text-spark-ink">
                  SparkCore
                </p>
                <p className="truncate text-[11px] font-medium leading-tight text-spark-muted">
                  Sistema de agendamento
                </p>
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={alternarMenu}
            aria-label={menuRecolhido ? "Abrir menu" : "Recolher menu"}
            title={menuRecolhido ? "Abrir menu" : "Recolher menu"}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-spark-muted transition hover:bg-spark-hover hover:text-spark-body"
          >
            <List size={20} weight="bold" />
          </button>
        </div>

        <nav
          className={`flex flex-1 flex-col gap-1 ${menuRecolhido ? "items-center px-2.5" : "px-3"}`}
        >
          {!menuRecolhido && (
            <p className="px-2.5 pb-1 pt-2 text-[10px] font-bold uppercase tracking-[0.12em] text-spark-faint">
              Navegacao
            </p>
          )}
          {ABAS.map(({ id, rotulo, Icone }) => {
            const ativo = aba === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => mudarAba(id)}
                aria-current={ativo ? "page" : undefined}
                title={rotulo}
                className={`group relative flex items-center rounded-xl text-left text-[13.5px] font-semibold transition-all duration-200 ${
                  menuRecolhido ? "h-11 w-11 justify-center" : "w-full gap-3 px-3 py-2.5"
                } ${
                  ativo
                    ? "bg-spark-soft text-spark-accent-strong shadow-[0_1px_2px_rgba(194,90,8,0.08)]"
                    : "text-spark-body hover:bg-spark-hover hover:text-spark-text"
                } ${ativo && menuRecolhido ? "ring-1 ring-spark-accent/20" : ""}`}
              >
                {ativo && !menuRecolhido && (
                  <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-spark-accent" />
                )}
                <Icone
                  size={19}
                  weight={ativo ? "fill" : "regular"}
                  className="shrink-0 transition-transform duration-200 group-hover:scale-110"
                />
                {!menuRecolhido && <span className="truncate">{rotulo}</span>}
                {id === "resumo" && avisosBadge > 0 && (
                  <span
                    className={`absolute flex items-center justify-center rounded-full bg-spark-danger font-bold text-white shadow-sm ${
                      menuRecolhido
                        ? "-right-1 -top-1 h-4 min-w-4 px-1 text-[10px]"
                        : "right-3 h-5 min-w-5 px-1.5 text-[11px]"
                    }`}
                  >
                    {avisosBadge > 99 ? "99" : avisosBadge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <div className={`border-t border-spark-line py-3 ${menuRecolhido ? "px-2.5" : "px-3"}`}>
          {!menuRecolhido && (
            <div className="mb-1.5 flex items-center gap-2.5 rounded-xl bg-spark-surface px-2.5 py-2">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-spark-accent to-spark-accent-light text-sm font-bold text-white shadow-sm">
                {(primeiroNome || "U").charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-semibold text-spark-text">
                  {primeiroNome || "Usuario"}
                </p>
                <p className="truncate text-[11px] text-spark-muted">Conectado</p>
              </div>
            </div>
          )}
          <button
            type="button"
            onClick={sair}
            title="Sair"
            className={`group flex items-center rounded-xl text-left text-[13.5px] font-semibold text-spark-body transition-all duration-200 hover:bg-spark-danger/10 hover:text-spark-danger ${
              menuRecolhido ? "mx-auto h-11 w-11 justify-center" : "w-full gap-3 px-3 py-2.5"
            }`}
          >
            <SignOut
              size={19}
              className="shrink-0 transition-transform duration-200 group-hover:scale-110"
            />
            {!menuRecolhido && "Sair"}
          </button>
        </div>
      </aside>

      {/* ── Coluna principal ──────────────────────────────────────── */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Topbar desktop: titulo da secao + sino + usuario */}
        <header className="hidden flex-none items-center justify-between border-b border-spark-line bg-spark-panel px-6 py-3 lg:flex">
          <h1 className="font-display text-[17px] font-bold text-spark-ink">{TITULOS[aba]}</h1>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setPaletteAberto(true)}
              className="mr-1 flex items-center gap-2 rounded-lg border border-spark-inputline bg-spark-surface px-3 py-1.5 text-[13px] text-spark-muted transition hover:bg-spark-hover"
            >
              <MagnifyingGlass size={15} />
              <span>Buscar</span>
              <kbd className="rounded border border-spark-inputline bg-spark-panel px-1.5 py-0.5 text-[10px] font-semibold text-spark-faint">
                Ctrl K
              </kbd>
            </button>
            {mostrarPasskeys && (
              <button
                type="button"
                onClick={() => setPasskeysAberto(true)}
                aria-label="Meus dispositivos"
                title="Meus dispositivos (passkey)"
                className="flex h-9 w-9 items-center justify-center rounded-lg text-spark-body transition hover:bg-spark-hover"
              >
                <Fingerprint size={19} weight="bold" />
              </button>
            )}
            <NotificationBell itens={notificacoes} />
            <div className="ml-1.5 flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-spark-accent to-spark-accent-light text-sm font-bold text-white shadow-sm">
                {(primeiroNome || "U").charAt(0).toUpperCase()}
              </div>
              <p className="text-[13px] font-medium text-spark-body">
                {primeiroNome ? `Ola, ${primeiroNome}` : "Acesso da diretoria"}
              </p>
            </div>
          </div>
        </header>

        {/* Barra superior (so celular), como um app nativo */}
        <header className="flex flex-none items-center justify-between border-b border-spark-line bg-spark-panel px-4 pb-2.5 pt-[calc(env(safe-area-inset-top)+0.65rem)] lg:hidden">
          <div className="flex items-center gap-2.5">
            <img src="/icon-192.png" alt="SparkCore" className="h-9 w-9 rounded-lg" />
            <div>
              <p className="font-display text-[15px] font-bold leading-tight text-spark-ink">SparkCore</p>
              <p className="text-xs leading-tight text-spark-muted">
                {primeiroNome ? `Ola, ${primeiroNome}` : "Acesso da diretoria"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-0.5">
            {mostrarPasskeys && (
              <button
                type="button"
                onClick={() => setPasskeysAberto(true)}
                aria-label="Meus dispositivos"
                className="flex h-9 w-9 items-center justify-center rounded-lg text-spark-body transition active:bg-spark-hover"
              >
                <Fingerprint size={19} weight="bold" />
              </button>
            )}
            <NotificationBell itens={notificacoes} />
            <button
              type="button"
              onClick={sair}
              className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-spark-body transition active:bg-spark-hover"
            >
              <SignOut size={17} />
              Sair
            </button>
          </div>
        </header>

        {/* So o miolo rola; abas ficam montadas para preservar busca e caches. */}
        <main className="app-scroll flex-1">
          <div className="mx-auto w-full max-w-md lg:max-w-4xl lg:px-6 lg:py-2">{conteudo}</div>
        </main>

        {/* Rodape fixo: no desktop encosta na base; no mobile fica logo acima
            da BottomNav. Sempre visivel e centralizado. */}
        <footer className="flex-none border-t border-spark-line bg-spark-panel py-2.5 text-center text-[11px] text-spark-faint">
          Feito com ❤️ pela Sparkware
        </footer>

        <BottomNav ativa={aba} onMudar={mudarAba} avisosBadge={avisosBadge} />
      </div>

      <CommandPalette
        aberto={paletteAberto}
        onFechar={() => setPaletteAberto(false)}
        onNavegar={mudarAba}
        onAbrirCliente={buscarCliente}
      />

      {passkeysAberto && <GerenciarPasskeys onFechar={() => setPasskeysAberto(false)} />}
    </div>
  );
}
