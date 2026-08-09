import { useState } from "react";
import { CalendarPlus, CheckCircle } from "@phosphor-icons/react";
import { ConsultaForm } from "../components/ConsultaForm";
import { SectionHeader } from "../components/SectionHeader";
import { hojeIso } from "../lib/datas";

// Secao dedicada de agendamento (separada da Agenda, que so exibe o
// calendario): o mesmo formulario completo de consulta, como tela propria.

interface Props {
  dataInicial?: string; // yyyy-MM-dd vindo da Agenda ("Agendar neste dia")
  onSessaoExpirada: () => void;
  onAgendado: () => void; // invalida o cache do calendario da Agenda
  onVerAgenda: () => void;
  onVoltar?: () => void;
}

export function AgendarScreen({
  dataInicial,
  onSessaoExpirada,
  onAgendado,
  onVerAgenda,
  onVoltar,
}: Props) {
  // Trocar a key remonta o formulario zerado apos agendar.
  const [chaveForm, setChaveForm] = useState(0);
  const [agendado, setAgendado] = useState(false);

  return (
    <div className="px-4 py-4">
      <SectionHeader
        titulo="Agendar consulta"
        subtitulo="Novo agendamento com bloqueio automático de horário."
        Icone={CalendarPlus}
        onVoltar={onVoltar}
      />

      {agendado && (
        <div className="mb-4 rounded-2xl border border-spark-success/25 bg-spark-success/5 px-4 py-3.5">
          <p className="flex items-center gap-2 text-sm font-semibold text-spark-success">
            <CheckCircle size={18} weight="fill" />
            Consulta agendada. O horario ficou bloqueado para outro agendamento.
          </p>
          <div className="mt-2.5 flex gap-2">
            <button
              type="button"
              onClick={() => setAgendado(false)}
              className="rounded-sm bg-spark-soft px-3.5 py-1.5 text-[13px] font-semibold text-spark-accent-strong"
            >
              Agendar outra
            </button>
            <button
              type="button"
              onClick={onVerAgenda}
              className="rounded-sm bg-spark-surface px-3.5 py-1.5 text-[13px] font-semibold text-spark-body"
            >
              Ver na agenda
            </button>
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-spark-line bg-spark-panel px-4 py-4">
        <ConsultaForm
          key={`${chaveForm}-${dataInicial ?? ""}`}
          inline
          dataInicial={dataInicial || hojeIso()}
          onSalvo={() => {
            setAgendado(true);
            setChaveForm((k) => k + 1);
            onAgendado();
            window.scrollTo({ top: 0 });
          }}
          onSessaoExpirada={onSessaoExpirada}
        />
      </div>
    </div>
  );
}
