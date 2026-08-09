import type { ComponentType } from "react";
import { CaretLeft, type IconProps } from "@phosphor-icons/react";

// Cabecalho padrao das secoes: seta de voltar (historico de abas), icone e
// titulo/subtitulo — mantem as telas com a mesma cara profissional.

interface Props {
  titulo: string;
  subtitulo?: string;
  Icone?: ComponentType<IconProps>;
  onVoltar?: () => void;
}

export function SectionHeader({ titulo, subtitulo, Icone, onVoltar }: Props) {
  return (
    <div className="mb-4 flex items-center gap-2.5">
      {onVoltar && (
        <button
          type="button"
          aria-label="Voltar"
          onClick={onVoltar}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-sm text-spark-body transition hover:bg-spark-hover active:scale-95"
        >
          <CaretLeft size={20} weight="bold" />
        </button>
      )}
      {Icone && (
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-spark-soft">
          <Icone size={20} className="text-spark-accent" />
        </div>
      )}
      <div className="min-w-0">
        <p className="truncate text-lg font-semibold leading-tight text-spark-ink">{titulo}</p>
        {subtitulo && <p className="truncate text-[13px] text-spark-muted">{subtitulo}</p>}
      </div>
    </div>
  );
}
