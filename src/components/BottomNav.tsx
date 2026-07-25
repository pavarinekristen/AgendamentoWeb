import { MagnifyingGlass, UserPlus, CalendarBlank, CalendarPlus, FileText, ChartBar } from "@phosphor-icons/react";

export type Aba = "busca" | "cadastro" | "agenda" | "agendar" | "laudos" | "resumo";

interface Props {
  ativa: Aba;
  onMudar: (aba: Aba) => void;
  avisosBadge?: number;
}

export const ABAS: { id: Aba; rotulo: string; Icone: typeof MagnifyingGlass }[] = [
  { id: "busca", rotulo: "Busca", Icone: MagnifyingGlass },
  { id: "agenda", rotulo: "Agenda", Icone: CalendarBlank },
  { id: "agendar", rotulo: "Agendar", Icone: CalendarPlus },
  { id: "cadastro", rotulo: "Cadastro", Icone: UserPlus },
  { id: "laudos", rotulo: "Laudos", Icone: FileText },
  { id: "resumo", rotulo: "Resumo", Icone: ChartBar },
];

export function BottomNav({ ativa, onMudar, avisosBadge = 0 }: Props) {
  return (
    <nav className="flex-none border-t border-spark-line bg-spark-panel pb-[env(safe-area-inset-bottom)] lg:hidden">
      <div className="mx-auto grid max-w-md grid-cols-6">
        {ABAS.map(({ id, rotulo, Icone }) => {
          const ativo = ativa === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => onMudar(id)}
              className="relative flex flex-col items-center gap-0.5 py-2.5"
              aria-current={ativo ? "page" : undefined}
            >
              <span className="relative">
                <Icone
                  size={22}
                  weight={ativo ? "fill" : "regular"}
                  className={ativo ? "text-spark-accent" : "text-spark-muted"}
                />
                {id === "resumo" && avisosBadge > 0 && (
                  <span className="absolute -right-2 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-spark-danger px-1 text-[10px] font-bold text-white">
                    {avisosBadge > 99 ? "99" : avisosBadge}
                  </span>
                )}
              </span>
              <span
                className={`text-[10px] font-semibold ${ativo ? "text-spark-accent-strong" : "text-spark-muted"}`}
              >
                {rotulo}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
