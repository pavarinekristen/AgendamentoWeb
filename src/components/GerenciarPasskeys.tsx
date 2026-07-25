import { useEffect, useState } from "react";
import { Fingerprint, Trash, X, CircleNotch, Plus } from "@phosphor-icons/react";
import {
  listarPasskeys,
  cadastrarPasskey,
  revogarPasskey,
  ApiError,
  type PasskeyInfo,
} from "../lib/api";

interface Props {
  onFechar: () => void;
}

// Modal "Meus dispositivos": o dono, ja logado, promove este aparelho a passkey
// (digital / PIN do Windows) e remove aparelhos perdidos. O OTP por e-mail
// continua como recuperacao, entao remover a ultima passkey nao tranca o acesso.
export function GerenciarPasskeys({ onFechar }: Props) {
  const [itens, setItens] = useState<PasskeyInfo[] | null>(null);
  const [erro, setErro] = useState("");
  const [cadastrando, setCadastrando] = useState(false);
  const [apelido, setApelido] = useState("");
  const [abrindoForm, setAbrindoForm] = useState(false);

  async function carregar() {
    setErro("");
    try {
      setItens(await listarPasskeys());
    } catch (err) {
      setItens([]);
      setErro(err instanceof ApiError ? err.message : "Nao foi possivel carregar os dispositivos.");
    }
  }

  useEffect(() => {
    carregar();
  }, []);

  async function handleCadastrar() {
    const nome = apelido.trim() || "Este dispositivo";
    setErro("");
    setCadastrando(true);
    try {
      await cadastrarPasskey(nome);
      setApelido("");
      setAbrindoForm(false);
      await carregar();
    } catch (err) {
      if (err instanceof DOMException && (err.name === "NotAllowedError" || err.name === "AbortError")) {
        return; // cancelou o Windows Hello / biometria
      }
      setErro(err instanceof ApiError ? err.message : "Nao foi possivel cadastrar esta passkey.");
    } finally {
      setCadastrando(false);
    }
  }

  async function handleRemover(id: string) {
    setErro("");
    try {
      await revogarPasskey(id);
      await carregar();
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : "Nao foi possivel remover o dispositivo.");
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
      onClick={onFechar}
    >
      <div
        className="w-full max-w-md rounded-t-2xl border border-spark-line bg-spark-panel p-5 shadow-xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Fingerprint size={22} weight="bold" className="text-spark-accent" />
            <h2 className="text-lg font-semibold text-spark-ink">Meus dispositivos</h2>
          </div>
          <button
            type="button"
            onClick={onFechar}
            aria-label="Fechar"
            className="flex h-9 w-9 items-center justify-center rounded-lg text-spark-muted transition hover:bg-spark-hover"
          >
            <X size={20} />
          </button>
        </div>

        <p className="mb-4 text-[13px] leading-relaxed text-spark-muted">
          Cadastre este aparelho para entrar com <strong className="text-spark-ink">digital ou PIN</strong>,
          sem esperar o codigo por e-mail. O codigo continua valendo como recuperacao.
        </p>

        {itens === null ? (
          <div className="flex justify-center py-8 text-spark-muted">
            <CircleNotch size={24} className="animate-spin" />
          </div>
        ) : (
          <ul className="mb-4 space-y-2">
            {itens.length === 0 && (
              <li className="rounded-xl border border-dashed border-spark-line px-4 py-6 text-center text-[13px] text-spark-faint">
                Nenhum dispositivo cadastrado ainda.
              </li>
            )}
            {itens.map((p) => (
              <li
                key={p.id}
                className="flex items-center gap-3 rounded-xl border border-spark-line bg-spark-surface px-4 py-3"
              >
                <Fingerprint size={20} className="shrink-0 text-spark-accent-strong" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-spark-ink">{p.apelido}</p>
                  <p className="truncate text-[11px] text-spark-faint">
                    {p.ultimoUsoEm ? `Usado em ${p.ultimoUsoEm}` : `Criado em ${p.criadoEm}`}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleRemover(p.id)}
                  aria-label={`Remover ${p.apelido}`}
                  className="flex h-9 w-9 items-center justify-center rounded-lg text-spark-muted transition hover:bg-spark-danger/10 hover:text-spark-danger"
                >
                  <Trash size={18} />
                </button>
              </li>
            ))}
          </ul>
        )}

        {erro && (
          <p
            role="alert"
            className="mb-4 rounded-xl border border-spark-danger/20 bg-spark-danger/5 px-4 py-3 text-sm text-spark-danger"
          >
            {erro}
          </p>
        )}

        {abrindoForm ? (
          <div className="space-y-3">
            <input
              type="text"
              autoFocus
              maxLength={40}
              value={apelido}
              onChange={(e) => setApelido(e.target.value)}
              placeholder="Nome do aparelho (ex.: Celular da diretoria)"
              className="h-12 w-full rounded-xl border border-spark-inputline bg-spark-field px-4 text-sm text-spark-ink outline-none transition focus:border-spark-accent focus:ring-2 focus:ring-spark-accent/20"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setAbrindoForm(false)}
                className="h-12 flex-1 rounded-xl border border-spark-line text-sm font-semibold text-spark-body transition active:scale-[0.98]"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleCadastrar}
                disabled={cadastrando}
                className="flex h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-br from-[#E87916] to-spark-accent text-sm font-semibold text-white transition active:scale-[0.98] disabled:opacity-60"
              >
                {cadastrando && <CircleNotch size={18} className="animate-spin" />}
                {cadastrando ? "Confirme..." : "Cadastrar"}
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setAbrindoForm(true)}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-spark-accent/30 bg-spark-soft text-sm font-semibold text-spark-accent-strong transition active:scale-[0.98]"
          >
            <Plus size={18} weight="bold" />
            Cadastrar este dispositivo
          </button>
        )}
      </div>
    </div>
  );
}
