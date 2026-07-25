import { useEffect, useMemo, useState } from "react";
import { X, DownloadSimple, ShareNetwork, FilePdf, CircleNotch } from "@phosphor-icons/react";

// Visualizador de laudo em tela (paridade com o LaudoViewer do desktop):
// mostra o PDF e oferece Baixar e Compartilhar. Abre IMEDIATAMENTE em estado
// de carregamento (blob null) enquanto o PDF chega da API — a tela responde
// na hora mesmo em conexao lenta.

interface Props {
  blob: Blob | null; // null = ainda baixando da API
  nomeArquivo: string;
  titulo: string;
  onFechar: () => void;
}

// Android Chrome nao tem visualizador de PDF para <iframe> (area fica em
// branco) e o iOS em PWA standalone falha na maior parte das vezes. No celular
// nao tentamos embutir: oferecemos Abrir/Baixar/Compartilhar, que usam o
// visualizador nativo do aparelho.
function ehCelular(): boolean {
  if (typeof navigator === "undefined") return false;
  return /android|iphone|ipod|ipad|mobile/i.test(navigator.userAgent || "");
}

export function LaudoViewer({ blob, nomeArquivo, titulo, onFechar }: Props) {
  const url = useMemo(() => (blob ? URL.createObjectURL(blob) : ""), [blob]);
  const [hint, setHint] = useState("");
  const celular = useMemo(ehCelular, []);

  useEffect(() => {
    if (!url) return;
    return () => URL.revokeObjectURL(url);
  }, [url]);

  const arquivo = useMemo(
    () => (blob ? new File([blob], nomeArquivo, { type: "application/pdf" }) : null),
    [blob, nomeArquivo],
  );

  const podeCompartilhar =
    arquivo != null &&
    typeof navigator.canShare === "function" &&
    navigator.canShare({ files: [arquivo] });

  function baixar() {
    if (!url) return;
    const link = document.createElement("a");
    link.href = url;
    link.download = nomeArquivo;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setHint("Laudo salvo no dispositivo.");
  }

  async function compartilhar() {
    if (!arquivo) return;
    try {
      await navigator.share({ files: [arquivo], title: nomeArquivo });
      setHint("Laudo compartilhado.");
    } catch {
      /* usuario cancelou o compartilhamento */
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-spark-page">
      <header className="flex flex-none items-center justify-between gap-2 border-b border-spark-line bg-spark-panel px-4 pb-3 pt-[calc(env(safe-area-inset-top)+0.75rem)]">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-spark-soft">
            <FilePdf size={18} className="text-spark-accent" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-[15px] font-semibold text-spark-ink">{titulo}</p>
            <p className="truncate text-xs text-spark-muted">{nomeArquivo}</p>
          </div>
        </div>
        <button
          type="button"
          aria-label="Fechar"
          onClick={onFechar}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-spark-body transition active:bg-spark-hover"
        >
          <X size={20} />
        </button>
      </header>

      {/* No desktop o PDF aparece embutido; no celular o iframe fica em branco,
          entao mostramos um cartao com o botao que chama o visualizador nativo. */}
      <div className="relative flex-1 bg-spark-surface">
        {url && celular ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 px-6 text-center">
            <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-spark-soft">
              <FilePdf size={40} className="text-spark-accent" weight="fill" />
            </div>
            <p className="mt-5 text-[16px] font-semibold text-spark-ink">Laudo pronto</p>
            <p className="text-[13px] text-spark-muted">{nomeArquivo}</p>
            {/* Ancora de verdade: o toque e um gesto do usuario, entao nao cai
                no bloqueio de pop-up como aconteceria com window.open. */}
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-6 flex h-12 w-full max-w-xs items-center justify-center gap-2 rounded-xl bg-gradient-to-br from-[#E87916] to-spark-accent text-[15px] font-semibold text-white shadow-[0_8px_18px_-8px_rgba(224,103,10,0.8)] transition active:scale-[0.98]"
            >
              <FilePdf size={18} weight="bold" />
              Abrir laudo
            </a>
            <p className="mt-3 text-[12px] text-spark-muted">
              Nao abriu? Use Baixar ou Compartilhar abaixo.
            </p>
          </div>
        ) : url ? (
          <iframe title={nomeArquivo} src={url} className="h-full w-full border-0" />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-spark-muted">
            <CircleNotch size={32} className="animate-spin text-spark-accent" />
            <p className="text-sm">Gerando o laudo oficial...</p>
          </div>
        )}
      </div>

      <footer className="flex-none border-t border-spark-line bg-spark-panel px-4 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-3">
        {hint ? (
          <p className="mb-2 text-center text-[13px] font-medium text-spark-success">{hint}</p>
        ) : blob && !celular ? (
          <p className="mb-2 text-center text-[12px] text-spark-muted">
            Nao abriu a visualizacao neste aparelho? Use Baixar ou Compartilhar.
          </p>
        ) : null}
        <div className="mx-auto flex max-w-md gap-2.5">
          <button
            type="button"
            onClick={baixar}
            className="flex h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-br from-[#E87916] to-spark-accent text-[15px] font-semibold text-white shadow-[0_8px_18px_-8px_rgba(224,103,10,0.8)] transition active:scale-[0.98]"
          >
            <DownloadSimple size={18} weight="bold" />
            Baixar
          </button>
          {podeCompartilhar && (
            <button
              type="button"
              onClick={compartilhar}
              className="flex h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-spark-soft text-[15px] font-semibold text-spark-accent-strong transition active:scale-[0.98]"
            >
              <ShareNetwork size={18} weight="bold" />
              Compartilhar
            </button>
          )}
        </div>
      </footer>
    </div>
  );
}
