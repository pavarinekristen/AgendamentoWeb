import { useEffect, useRef, useState, type FormEvent } from "react";
import { CircleNotch, Fingerprint, Eye, EyeSlash } from "@phosphor-icons/react";
import {
  login,
  login2fa,
  loginPasskey,
  mostrarPasskeyUI,
  session,
  ApiError,
  type AuthUsuario,
} from "../lib/api";
import { Hologram } from "../components/Hologram";

// Nao ha mais allowlist de e-mail no front (VITE_ALLOWED_EMAILS): a lista era
// compilada dentro do bundle, entao qualquer aparelho com uma versao antiga em
// cache continuava barrando contas novas ("Este acesso e exclusivo da
// diretoria") mesmo depois de o e-mail ser liberado. Como a trava era so
// cosmetica (o navegador decidia; ver M3 em docs/PENDENCIAS_SEGURANCA.txt),
// quem autoriza e a API: entra quem tem conta ativa e confirmada.

interface Props {
  onLogged: (usuario: AuthUsuario) => void;
}

// Brasas quentes do palco (CSS puro): posicao/tempo/tamanho variados para nao
// pulsarem juntas nem formarem fileira.
//
// Espalhamento deterministico em vez de Math.random: a cena fica igual em todo
// carregamento, e um re-render nao reposiciona as brasas no meio da subida.
// Os multiplicadores (37, 13, 29, 7) sao primos em relacao ao total, entao os
// valores percorrem toda a faixa antes de repetir — o que evita o alinhamento
// visivel que uma distribuicao regular criaria.
const TOTAL_EMBERS = 24;

const EMBERS: React.CSSProperties[] = Array.from({ length: TOTAL_EMBERS }, (_, i) => {
  const coluna = (i * 37) % 100; // 0..99, espalhado
  const duracao = 7 + ((i * 13) % 9); // 7s a 15s
  const atraso = ((i * 29) % 100) / 10; // 0s a 9.9s
  const tamanho = 2 + ((i * 7) % 3); // 2, 3 ou 4 px

  return {
    left: `${3 + coluna * 0.94}%`,
    width: `${tamanho}px`,
    height: `${tamanho}px`,
    // Brasa menor brilha menos: da profundidade sem mexer na opacidade, que e
    // controlada pelos keyframes da animacao.
    boxShadow: `0 0 ${(tamanho * 2.4).toFixed(1)}px rgba(247, 147, 30, 0.85)`,
    animationDuration: `${duracao}s`,
    animationDelay: `${atraso}s`,
  };
});

export function LoginScreen({ onLogged }: Props) {
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(false);
  // Etapa 2FA: a API confirmou a senha e enviou um codigo de 6 digitos por e-mail.
  const [aguardando2fa, setAguardando2fa] = useState(false);
  const [codigo2fa, setCodigo2fa] = useState("");
  const [entrandoPasskey, setEntrandoPasskey] = useState(false);
  const mostrarPasskey = mostrarPasskeyUI();
  // Senha as cegas + lockout de 5 tentativas (AuthService) = conta da diretoria
  // bloqueada por um dedo errado no celular. O olho evita esse caso.
  const [senhaVisivel, setSenhaVisivel] = useState(false);
  // Reenvio do codigo 2FA. Repetir o /auth/login e seguro: o lockout so conta
  // SENHA errada, e um acerto zera o contador — mas mantemos uma espera de 30s
  // para nao disparar e-mail em rajada.
  const [reenviando, setReenviando] = useState(false);
  const [esperaReenvio, setEsperaReenvio] = useState(0);
  const emailRef = useRef<HTMLInputElement>(null);
  const jaEnviouCodigo = useRef("");

  // Foco no e-mail so no desktop: no celular abriria o teclado por cima da tela.
  useEffect(() => {
    if (!window.matchMedia("(min-width: 1024px)").matches) return;
    emailRef.current?.focus();
  }, []);

  // Contagem regressiva do botao de reenviar.
  useEffect(() => {
    if (esperaReenvio <= 0) return;
    const id = window.setTimeout(() => setEsperaReenvio((s) => s - 1), 1000);
    return () => window.clearTimeout(id);
  }, [esperaReenvio]);

  function concluirLogin(auth: Awaited<ReturnType<typeof login>>) {
    const emailRetornado = auth.usuario?.email ?? email.trim();
    session.save(auth.token!);
    onLogged(auth.usuario ?? { email: emailRetornado });
  }

  async function handlePasskey() {
    setErro("");
    setEntrandoPasskey(true);
    try {
      const auth = await loginPasskey(email.trim() || undefined);
      concluirLogin(auth);
    } catch (err) {
      // Usuario fechou o Windows Hello / cancelou o QR: nao e erro pra mostrar.
      if (err instanceof DOMException && (err.name === "NotAllowedError" || err.name === "AbortError")) {
        return;
      }
      setErro(err instanceof ApiError ? err.message : "Não foi possível entrar com a passkey.");
    } finally {
      setEntrandoPasskey(false);
    }
  }

  async function verificar2fa(codigo: string) {
    setErro("");
    setCarregando(true);
    try {
      const auth = await login2fa(email.trim(), codigo);
      concluirLogin(auth);
    } catch (err) {
      // Codigo errado: libera para tentar de novo (inclusive por digitacao).
      jaEnviouCodigo.current = "";
      setErro(err instanceof ApiError ? err.message : "Falha inesperada ao verificar o código.");
    } finally {
      setCarregando(false);
    }
  }

  // Envia sozinho ao completar os 6 digitos — ninguem precisa procurar o botao
  // depois de digitar um codigo de tamanho fixo. O ref evita reenviar o mesmo
  // codigo quando o componente re-renderiza.
  useEffect(() => {
    const codigo = codigo2fa.trim();
    if (!aguardando2fa || codigo.length !== 6 || carregando) return;
    if (jaEnviouCodigo.current === codigo) return;
    jaEnviouCodigo.current = codigo;
    void verificar2fa(codigo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [codigo2fa, aguardando2fa]);

  // Reenvia o codigo repetindo o login (nao ha rota dedicada na API).
  async function reenviarCodigo() {
    if (esperaReenvio > 0 || reenviando) return;
    setErro("");
    setReenviando(true);
    try {
      await login(email.trim(), senha);
      setCodigo2fa("");
      jaEnviouCodigo.current = "";
      setEsperaReenvio(30);
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : "Não foi possível reenviar o código.");
    } finally {
      setReenviando(false);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setErro("");

    if (aguardando2fa) {
      if (codigo2fa.trim().length !== 6) {
        setErro("Informe o código de 6 dígitos enviado por e-mail.");
        return;
      }
      await verificar2fa(codigo2fa.trim());
      return;
    }

    if (!email.trim() || !senha) {
      setErro("Informe e-mail e senha.");
      return;
    }

    setCarregando(true);
    try {
      const auth = await login(email.trim(), senha);
      if (auth.requer2FA) {
        setAguardando2fa(true);
        setCodigo2fa("");
        return;
      }
      concluirLogin(auth);
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : "Falha inesperada ao entrar.");
    } finally {
      setCarregando(false);
    }
  }

  return (
    <main className="flex min-h-dvh flex-col bg-spark-page md:flex-row">
      {/* Palco do holograma: aura, brasas e o holograma 3D (mantido do desktop) */}
      <section className="holo-panel relative flex flex-col items-center justify-center px-6 pb-10 pt-[calc(env(safe-area-inset-top)+2.5rem)] text-center md:min-h-dvh md:flex-1">
        <div className="holo-aura" aria-hidden="true" />
        <div className="holo-embers" aria-hidden="true">
          {EMBERS.map((estilo, i) => (
            <span key={i} className="ember" style={estilo} />
          ))}
        </div>

        <div className="login-panel-content relative z-10 flex flex-col items-center">
          <p className="mb-6 text-[11px] font-semibold uppercase tracking-[0.28em] text-spark-accent-light/80">
            SparkCore
          </p>
          <Hologram />
          <h1 className="mt-6 font-display text-[28px] font-extrabold leading-[1.1] tracking-tight text-white [text-shadow:0_2px_24px_rgba(0,0,0,0.45)]">
            Bom te ver por aqui.
          </h1>
          <p className="mt-2.5 max-w-[290px] text-[14px] leading-relaxed text-white/65">
            Sua agenda da clínica, sempre um passo à frente.
          </p>
        </div>
      </section>

      {/* Formulario em papel quente */}
      <section className="flex flex-1 flex-col justify-center px-5 pb-[calc(env(safe-area-inset-bottom)+1.5rem)] pt-8 md:px-12">
        <form
          onSubmit={handleSubmit}
          className="login-card mx-auto w-full max-w-sm rounded-3xl border border-spark-line bg-spark-panel p-7 shadow-[0_28px_64px_-32px_rgba(28,25,23,0.35)]"
        >
          <div className="mb-6 flex items-center gap-3">
            <img src="/sparkcore.png" alt="" className="h-11 w-11 rounded-xl" />
            <div>
              <p className="text-lg font-semibold leading-tight text-spark-ink">SparkCore</p>
              <p className="text-xs text-spark-muted">Acesso rápido da diretoria</p>
            </div>
          </div>

          {!aguardando2fa && mostrarPasskey && (
            <>
              <button
                type="button"
                onClick={handlePasskey}
                disabled={entrandoPasskey || carregando}
                className="mb-4 flex h-14 w-full items-center justify-center gap-2.5 rounded-xl border border-spark-accent/30 bg-spark-soft text-base font-semibold text-spark-accent-strong transition active:scale-[0.98] disabled:opacity-60"
              >
                {entrandoPasskey ? (
                  <CircleNotch size={20} className="animate-spin" />
                ) : (
                  <Fingerprint size={22} weight="bold" />
                )}
                {entrandoPasskey ? "Aguardando..." : "Entrar com passkey"}
              </button>
              <div className="mb-4 flex items-center gap-3 text-[11px] font-semibold uppercase tracking-wide text-spark-faint">
                <span className="h-px flex-1 bg-spark-line" />
                ou entre com e-mail
                <span className="h-px flex-1 bg-spark-line" />
              </div>
            </>
          )}

          {aguardando2fa ? (
            <>
              <p className="mb-4 text-sm leading-relaxed text-spark-muted">
                Enviamos um código de verificação para <strong className="text-spark-ink">{email.trim()}</strong>.
                Ele expira em 10 minutos.
              </p>
              <label className="mb-4 block">
                <span className="mb-2 block text-[12.5px] font-semibold text-spark-label">Código de verificação</span>
                <input
                  type="text"
                  autoComplete="one-time-code"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  autoFocus
                  value={codigo2fa}
                  onChange={(e) => setCodigo2fa(e.target.value.replace(/\D/g, ""))}
                  className="h-14 w-full rounded-xl border border-spark-inputline bg-spark-field px-4 text-center text-2xl tracking-[0.5em] text-spark-ink outline-none transition placeholder:text-spark-faint focus:border-spark-accent focus:ring-2 focus:ring-spark-accent/20"
                  placeholder="••••••"
                />
              </label>
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setAguardando2fa(false);
                    setCodigo2fa("");
                    setErro("");
                    jaEnviouCodigo.current = "";
                  }}
                  className="text-[12.5px] font-semibold text-spark-muted underline-offset-2 active:underline"
                >
                  Voltar e usar outra conta
                </button>
                <button
                  type="button"
                  onClick={reenviarCodigo}
                  disabled={esperaReenvio > 0 || reenviando || carregando}
                  className="flex items-center gap-1.5 text-[12.5px] font-semibold text-spark-accent-strong underline-offset-2 transition active:underline disabled:text-spark-muted disabled:no-underline"
                >
                  {reenviando && <CircleNotch size={13} className="animate-spin" />}
                  {esperaReenvio > 0 ? `Reenviar em ${esperaReenvio}s` : "Reenviar código"}
                </button>
              </div>
            </>
          ) : (
            <>
              <label className="mb-4 block">
                <span className="mb-2 block text-[12.5px] font-semibold text-spark-label">E-mail</span>
                <input
                  ref={emailRef}
                  type="email"
                  autoComplete="username"
                  inputMode="email"
                  autoCapitalize="none"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="h-14 w-full rounded-xl border border-spark-inputline bg-spark-field px-4 text-base text-spark-ink outline-none transition placeholder:text-spark-faint focus:border-spark-accent focus:ring-2 focus:ring-spark-accent/20"
                  placeholder="voce@empresa.com"
                />
              </label>

              <label className="mb-4 block">
                <span className="mb-2 block text-[12.5px] font-semibold text-spark-label">Senha</span>
                <span className="relative block">
                  <input
                    type={senhaVisivel ? "text" : "password"}
                    autoComplete="current-password"
                    value={senha}
                    onChange={(e) => setSenha(e.target.value)}
                    className="h-14 w-full rounded-xl border border-spark-inputline bg-spark-field pl-4 pr-14 text-base text-spark-ink outline-none transition placeholder:text-spark-faint focus:border-spark-accent focus:ring-2 focus:ring-spark-accent/20"
                    placeholder="Sua senha"
                  />
                  <button
                    type="button"
                    onClick={() => setSenhaVisivel((v) => !v)}
                    aria-label={senhaVisivel ? "Ocultar senha" : "Mostrar senha"}
                    aria-pressed={senhaVisivel}
                    className="absolute right-2 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-sm text-spark-muted transition hover:text-spark-body active:bg-spark-hover"
                  >
                    {senhaVisivel ? <EyeSlash size={19} /> : <Eye size={19} />}
                  </button>
                </span>
              </label>
            </>
          )}

          {erro && (
            <p
              role="alert"
              className="mb-4 rounded-xl border border-spark-danger/20 bg-spark-danger/5 px-4 py-3 text-sm text-spark-danger"
            >
              {erro}
            </p>
          )}

          <button
            type="submit"
            disabled={carregando}
            className="flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-spark-accent hover:bg-spark-accent-strong text-base font-semibold text-white transition active:scale-[0.98] disabled:opacity-60"
          >
            {carregando && <CircleNotch size={20} className="animate-spin" />}
            {carregando ? (aguardando2fa ? "Verificando..." : "Entrando...") : aguardando2fa ? "Verificar" : "Entrar"}
          </button>
        </form>

        <p className="mt-6 text-center text-[11px] text-spark-body">
          Feito com ❤️ pela Sparkware
        </p>
      </section>
    </main>
  );
}
