import { useEffect, useState, type FormEvent } from "react";
import { X, CircleNotch, Trash } from "@phosphor-icons/react";
import { criarTarefa, atualizarTarefa, excluirTarefa, ApiError, type TarefaItem } from "../lib/api";
import { useToast } from "./Toast";

// Mini-formulario de tarefa pessoal (agenda particular). Titulo + horario
// (opcional) + observacoes. O status nao aparece aqui: ele e controlado pelas
// colunas do quadro (arrastar/mover). Novo => coluna Pendente ("Agendada").
interface Props {
  dia: string; // yyyy-MM-dd (dia da tarefa quando nova)
  tarefa?: TarefaItem; // presente = edicao
  onFechar: () => void;
  onSalvo: () => void;
  onSessaoExpirada: () => void;
}

const inputCls =
  "h-12 w-full rounded-xl border border-spark-inputline bg-spark-field px-3.5 text-[15px] text-spark-ink outline-none transition placeholder:text-spark-faint focus:border-spark-accent focus:ring-2 focus:ring-spark-accent/20";
const labelCls = "mb-1.5 block text-[12.5px] font-semibold text-[#44403C]";

export function TarefaForm({ dia, tarefa, onFechar, onSalvo, onSessaoExpirada }: Props) {
  const editando = Boolean(tarefa);
  const toast = useToast();

  const [titulo, setTitulo] = useState(tarefa?.titulo ?? "");
  const [data, setData] = useState(tarefa?.data ?? dia);
  const [horario, setHorario] = useState(tarefa?.horario ?? "");
  const [observacoes, setObservacoes] = useState(tarefa?.observacoes ?? "");

  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [excluindo, setExcluindo] = useState(false);

  // Esc fecha o modal (sem perder o que foi digitado — so descarta).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onFechar();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onFechar]);

  async function salvar(e: FormEvent) {
    e.preventDefault();
    setErro("");

    if (!titulo.trim()) return setErro("Informe o titulo da tarefa.");
    if (!data) return setErro("Informe o dia da tarefa.");

    const payload = {
      data,
      horario: horario.trim(),
      titulo: titulo.trim(),
      observacoes: observacoes.trim(),
      // Edicao preserva o status atual (a coluna); nova entra em Pendente.
      status: tarefa?.status || "Agendada",
    };

    setSalvando(true);
    try {
      if (editando) await atualizarTarefa(tarefa!.idLocal, payload);
      else await criarTarefa(payload);
      toast.sucesso(editando ? "Tarefa atualizada." : "Tarefa criada.");
      onSalvo();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        onSessaoExpirada();
        return;
      }
      setErro(err instanceof ApiError ? err.message : "Falha ao salvar a tarefa.");
    } finally {
      setSalvando(false);
    }
  }

  async function excluir() {
    if (!tarefa) return;
    if (!window.confirm(`Excluir a tarefa "${tarefa.titulo}"?`)) return;

    setExcluindo(true);
    setErro("");
    try {
      await excluirTarefa(tarefa.idLocal);
      toast.sucesso("Tarefa excluida.");
      onSalvo();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        onSessaoExpirada();
        return;
      }
      setErro(err instanceof ApiError ? err.message : "Falha ao excluir a tarefa.");
    } finally {
      setExcluindo(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 p-0 sm:items-center sm:p-4"
      onClick={onFechar}
    >
      <div
        className="w-full max-w-md rounded-t-2xl bg-spark-page p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] shadow-[0_-16px_40px_-16px_rgba(28,25,23,0.4)] sm:rounded-2xl sm:pb-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <p className="font-display text-[16px] font-bold text-spark-ink">
            {editando ? "Editar tarefa" : "Nova tarefa"}
          </p>
          <button
            type="button"
            aria-label="Fechar"
            onClick={onFechar}
            className="flex h-9 w-9 items-center justify-center rounded-full text-spark-body transition hover:bg-spark-hover"
          >
            <X size={19} />
          </button>
        </div>

        <form onSubmit={salvar}>
          <label className="mb-3 block">
            <span className={labelCls}>Titulo *</span>
            <input
              className={inputCls}
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder="Ex.: Reuniao com a diretoria"
              maxLength={160}
              autoFocus
            />
          </label>

          <div className="mb-3 grid grid-cols-2 gap-3">
            <label className="block">
              <span className={labelCls}>Dia *</span>
              <input type="date" className={inputCls} value={data} onChange={(e) => setData(e.target.value)} />
            </label>
            <label className="block">
              <span className={labelCls}>Horario</span>
              <input
                type="time"
                className={inputCls}
                value={horario}
                onChange={(e) => setHorario(e.target.value)}
              />
            </label>
          </div>

          <label className="mb-4 block">
            <span className={labelCls}>Observacoes</span>
            <textarea
              className={`${inputCls} h-20 resize-none py-2.5`}
              value={observacoes}
              onChange={(e) => setObservacoes(e.target.value)}
            />
          </label>

          {erro && (
            <p role="alert" className="mb-4 rounded-xl border border-spark-danger/20 bg-spark-danger/5 px-4 py-3 text-sm text-spark-danger">
              {erro}
            </p>
          )}

          <button
            type="submit"
            disabled={salvando}
            className="flex h-13 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-br from-[#E87916] to-spark-accent py-3.5 text-base font-semibold text-white shadow-[0_10px_24px_-10px_rgba(224,103,10,0.7)] transition active:scale-[0.98] disabled:opacity-60"
          >
            {salvando && <CircleNotch size={20} className="animate-spin" />}
            {salvando ? "Salvando..." : editando ? "Salvar alteracoes" : "Criar tarefa"}
          </button>

          {editando && (
            <button
              type="button"
              onClick={excluir}
              disabled={excluindo || salvando}
              className="mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-spark-danger/30 bg-spark-danger/5 text-[15px] font-semibold text-spark-danger transition active:scale-[0.98] disabled:opacity-60"
            >
              {excluindo ? <CircleNotch size={18} className="animate-spin" /> : <Trash size={18} />}
              {excluindo ? "Excluindo..." : "Excluir tarefa"}
            </button>
          )}
        </form>
      </div>
    </div>
  );
}
