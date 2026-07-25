import { useState } from "react";
import { CheckCircle, UserPlus } from "@phosphor-icons/react";
import { ClienteForm } from "../components/ClienteForm";
import { SectionHeader } from "../components/SectionHeader";

// Secao dedicada de cadastro de cliente (paridade com a aba "Clientes" do
// desktop): o mesmo formulario completo, mas como tela propria — a Pesquisa
// fica isolada na aba Busca.

interface Props {
  onSessaoExpirada: () => void;
  onBuscarCliente: (nome: string) => void;
  onVoltar?: () => void;
}

export function CadastroScreen({ onSessaoExpirada, onBuscarCliente, onVoltar }: Props) {
  // Trocar a key remonta o formulario zerado apos salvar.
  const [chaveForm, setChaveForm] = useState(0);
  const [salvo, setSalvo] = useState<string | null>(null);

  return (
    <div className="px-4 py-4">
      <SectionHeader
        titulo="Novo cliente"
        subtitulo="Cadastro completo do funcionario, igual ao do sistema desktop."
        Icone={UserPlus}
        onVoltar={onVoltar}
      />

      {salvo && (
        <div className="mb-4 rounded-2xl border border-spark-success/25 bg-spark-success/5 px-4 py-3.5">
          <p className="flex items-center gap-2 text-sm font-semibold text-spark-success">
            <CheckCircle size={18} weight="fill" />
            Cliente {salvo} salvo. Ele ja pode ser agendado na Agenda.
          </p>
          <div className="mt-2.5 flex gap-2">
            <button
              type="button"
              onClick={() => setSalvo(null)}
              className="rounded-full bg-spark-soft px-3.5 py-1.5 text-[13px] font-semibold text-spark-accent-strong"
            >
              Cadastrar outro
            </button>
            <button
              type="button"
              onClick={() => onBuscarCliente(salvo)}
              className="rounded-full bg-spark-surface px-3.5 py-1.5 text-[13px] font-semibold text-spark-body"
            >
              Ver na busca
            </button>
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-spark-line bg-spark-panel px-4 py-4 shadow-[0_10px_24px_-20px_rgba(28,25,23,0.35)]">
        <ClienteForm
          key={chaveForm}
          inline
          onSalvo={(_idLocal, nome) => {
            setSalvo(nome);
            setChaveForm((k) => k + 1);
            window.scrollTo({ top: 0 });
          }}
          onSessaoExpirada={onSessaoExpirada}
        />
      </div>
    </div>
  );
}
