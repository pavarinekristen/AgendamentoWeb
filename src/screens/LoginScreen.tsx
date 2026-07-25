import { useState, type FormEvent } from "react";
import { CircleNotch, Fingerprint } from "@phosphor-icons/react";
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

const ALLOWED_EMAILS = (import.meta.env.VITE_ALLOWED_EMAILS ?? "")
  .split(",")
  .map((e: string) => e.trim().toLowerCase())
  .filter(Boolean);

function emailAutorizado(email: string): boolean {
  if (ALLOWED_EMAILS.length === 0) return true;
  return ALLOWED_EMAILS.includes(email.trim().toLowerCase());
}

interface Props {
  onLogged: (usuario: AuthUsuario) => void;
}

// Brasas quentes do palco (CSS puro): posicao/tempo variados para nao pulsarem juntas.
const EMBERS: React.CSSProperties[] = [
  { left: "18%", animationDuration: "9s", animationDelay: "0s" },
  { left: "31%", animationDuration: "11s", animationDelay: "2.4s" },
  { left: "47%", animationDuration: "8s", animationDelay: "1.1s" },
  { left: "62%", animationDuration: "12.5s", animationDelay: "3.6s" },
  { left: "77%", animationDuration: "10s", animationDelay: "0.7s" },
  { left: "88%", animationDuration: "13s", animationDelay: "4.3s" },
];

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

  function concluirLogin(auth: Awaited<ReturnType<typeof login>>) {
    const emailRetornado = auth.usuario?.email ?? email.trim();
    if (!emailAutorizado(emailRetornado)) {
      setErro("Este acesso e exclusivo da diretoria.");
      return;
    }
    session.save(auth.token!, auth.usuario);
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
      setErro(err instanceof ApiError ? err.message : "Nao foi possivel entrar com a passkey.");
    } finally {
      setEntrandoPasskey(false);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setErro("");

    if (aguardando2fa) {
      if (codigo2fa.trim().length !== 6) {
        setErro("Informe o codigo de 6 digitos enviado por e-mail.");
        return;
      }
      setCarregando(true);
      try {
        const auth = await login2fa(email.trim(), codigo2fa.trim());
        concluirLogin(auth);
      } catch (err) {
        setErro(err instanceof ApiError ? err.message : "Falha inesperada ao verificar o codigo.");
      } finally {
        setCarregando(false);
      }
      return;
    }

    if (!email.trim() || !senha) {
      setErro("Informe e-mail e senha.");
      return;
    }

    if (!emailAutorizado(email)) {
      setErro("Este acesso e exclusivo da diretoria.");
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
            Sua agenda da clinica, sempre um passo a frente.
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
              <p className="text-xs text-spark-muted">Acesso rapido da diretoria</p>
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
                Enviamos um codigo de verificacao para <strong className="text-spark-ink">{email.trim()}</strong>.
                Digite-o abaixo para entrar.
              </p>
              <label className="mb-4 block">
                <span className="mb-2 block text-[12.5px] font-semibold text-[#44403C]">Codigo de verificacao</span>
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
              <button
                type="button"
                onClick={() => {
                  setAguardando2fa(false);
                  setCodigo2fa("");
                  setErro("");
                }}
                className="mb-4 text-[12.5px] font-semibold text-spark-muted underline-offset-2 active:underline"
              >
                Voltar e usar outra conta
              </button>
            </>
          ) : (
            <>
              <label className="mb-4 block">
                <span className="mb-2 block text-[12.5px] font-semibold text-[#44403C]">E-mail</span>
                <input
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
                <span className="mb-2 block text-[12.5px] font-semibold text-[#44403C]">Senha</span>
                <input
                  type="password"
                  autoComplete="current-password"
                  value={senha}
                  onChange={(e) => setSenha(e.target.value)}
                  className="h-14 w-full rounded-xl border border-spark-inputline bg-spark-field px-4 text-base text-spark-ink outline-none transition placeholder:text-spark-faint focus:border-spark-accent focus:ring-2 focus:ring-spark-accent/20"
                  placeholder="Sua senha"
                />
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
            className="flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-br from-[#E87916] to-spark-accent text-base font-semibold text-white shadow-[0_10px_24px_-10px_rgba(224,103,10,0.7)] transition active:scale-[0.98] disabled:opacity-60"
          >
            {carregando && <CircleNotch size={20} className="animate-spin" />}
            {carregando ? (aguardando2fa ? "Verificando..." : "Entrando...") : aguardando2fa ? "Verificar" : "Entrar"}
          </button>
        </form>

        <p className="mt-6 text-center text-[11px] text-spark-faint">
          Feito com ❤️ pela Sparkware
        </p>
      </section>
    </main>
  );
}
