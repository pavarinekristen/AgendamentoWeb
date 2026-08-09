import { useEffect, useRef, useState, type FormEvent } from "react";
import { X, CircleNotch, MagnifyingGlass, UserPlus, Trash } from "@phosphor-icons/react";
import {
  criarConsulta,
  atualizarConsulta,
  excluirConsulta,
  pesquisarClientes,
  listarProfissionaisSalas,
  ApiError,
  type AgendaItem,
  type ClienteResumo,
  type ProfissionalSala,
} from "../lib/api";
import { ClienteForm } from "./ClienteForm";
import { useToast } from "./Toast";

// Formulario de consulta com paridade TOTAL com o desktop WPF (AgendaView):
// mesmos campos, mesmos combos (status/motivo) e mesma regra de conflito
// (validada tambem no servidor).

const STATUS = ["Agendada", "Confirmada", "Aguardando", "Concluida", "Baixado", "Cancelada"];
const MOTIVOS = ["Admissao", "Periodico", "Retorno ao trabalho", "Mudanca de funcao", "Demissional"];

interface Props {
  dataInicial: string; // yyyy-MM-dd (dia selecionado no calendario)
  // HH:mm vindo do slot clicado na grade da semana: marcar sem redigitar hora.
  horarioInicial?: string;
  consulta?: AgendaItem; // presente = edicao
  // true = renderiza como bloco normal (secao Agendar); false = overlay modal.
  inline?: boolean;
  onFechar?: () => void;
  onSalvo: () => void;
  onSessaoExpirada: () => void;
}

const inputCls =
  "h-12 w-full rounded-xl border border-spark-inputline bg-spark-field px-3.5 text-[15px] text-spark-ink outline-none transition placeholder:text-spark-faint focus:border-spark-accent focus:ring-2 focus:ring-spark-accent/20";
const labelCls = "mb-1.5 block text-[12.5px] font-semibold text-spark-label";

export function ConsultaForm({ dataInicial, horarioInicial, consulta, inline = false, onFechar, onSalvo, onSessaoExpirada }: Props) {
  const editando = Boolean(consulta);
  const toast = useToast();

  const [clienteIdLocal, setClienteIdLocal] = useState(consulta?.clienteIdLocal ?? "");
  const [clienteNome, setClienteNome] = useState(consulta?.clienteNome ?? "");
  const [busca, setBusca] = useState("");
  const [resultados, setResultados] = useState<ClienteResumo[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [novoCliente, setNovoCliente] = useState(false);
  const debounce = useRef<number>(0);

  const [data, setData] = useState(consulta?.data ?? dataInicial);
  const [horario, setHorario] = useState(consulta?.horario ?? horarioInicial ?? "");
  const [local, setLocal] = useState(consulta?.local ?? "");
  const [profissionais, setProfissionais] = useState<ProfissionalSala[]>([]);
  const [profissionalIdLocal, setProfissionalIdLocal] = useState("");
  const [status, setStatus] = useState(consulta?.status || "Agendada");
  const [motivo, setMotivo] = useState(consulta?.motivo || "Admissao");
  const [trabalhaArmado, setTrabalhaArmado] = useState(consulta?.tipoLaudo === "Com arma");
  const [observacoes, setObservacoes] = useState(consulta?.observacoes ?? "");

  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [excluindo, setExcluindo] = useState(false);

  // Combo de profissionais/salas (mesma lista do desktop, sincronizada).
  useEffect(() => {
    const controller = new AbortController();
    listarProfissionaisSalas(controller.signal)
      .then((lista) => {
        setProfissionais(lista);
        // Na edicao a agenda so traz o NOME do profissional: casa pelo nome.
        if (consulta?.profissionalSala) {
          const match = lista.find((p) => p.nome === consulta.profissionalSala);
          if (match) setProfissionalIdLocal(match.idLocal);
        }
      })
      .catch((err) => {
        if (err instanceof ApiError && err.status === 401) onSessaoExpirada();
      });
    return () => controller.abort();
  }, [consulta, onSessaoExpirada]);

  // Busca de funcionario com debounce (mesma API da aba Busca).
  useEffect(() => {
    window.clearTimeout(debounce.current);
    if (busca.trim().length < 2) {
      setResultados([]);
      return;
    }
    debounce.current = window.setTimeout(() => {
      setBuscando(true);
      pesquisarClientes(busca.trim(), "")
        .then(setResultados)
        .catch((err) => {
          if (err instanceof ApiError && err.status === 401) onSessaoExpirada();
        })
        .finally(() => setBuscando(false));
    }, 350);
    return () => window.clearTimeout(debounce.current);
  }, [busca, onSessaoExpirada]);

  function selecionarCliente(c: ClienteResumo) {
    setClienteIdLocal(c.idLocal);
    setClienteNome(c.nome ?? "");
    setBusca("");
    setResultados([]);
  }

  async function salvar(e: FormEvent) {
    e.preventDefault();
    setErro("");

    if (!clienteIdLocal) return setErro("Selecione o funcionário cadastrado.");
    if (!data) return setErro("Informe a data da consulta.");
    if (!horario.trim()) return setErro("Informe o horário.");
    if (!local.trim()) return setErro("Local da consulta é obrigatório.");

    const payload = {
      clienteIdLocal,
      data,
      horario: horario.trim(),
      local: local.trim(),
      profissionalSalaIdLocal: profissionalIdLocal,
      status,
      motivo,
      trabalhaArmado,
      observacoes: observacoes.trim(),
    };

    setSalvando(true);
    try {
      if (editando) await atualizarConsulta(consulta!.idLocal, payload);
      else await criarConsulta(payload);
      toast.sucesso(editando ? "Consulta atualizada." : "Consulta agendada.");
      onSalvo();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        onSessaoExpirada();
        return;
      }
      setErro(err instanceof ApiError ? err.message : "Falha ao salvar a consulta.");
    } finally {
      setSalvando(false);
    }
  }

  // Igual ao desktop: a exclusao e soft-delete e nao passa pela checagem de
  // conflito (senao seria impossivel excluir consulta em horario disputado).
  async function excluir() {
    if (!consulta) return;
    const quando = [consulta.data.split("-").reverse().join("/"), consulta.horario]
      .filter(Boolean)
      .join(" às ");
    if (!window.confirm(`Excluir a consulta de ${consulta.clienteNome || "este funcionário"} em ${quando}?`))
      return;

    setExcluindo(true);
    setErro("");
    try {
      await excluirConsulta(consulta.idLocal);
      toast.sucesso("Consulta excluída.");
      onSalvo();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        onSessaoExpirada();
        return;
      }
      setErro(err instanceof ApiError ? err.message : "Falha ao excluir a consulta.");
    } finally {
      setExcluindo(false);
    }
  }

  if (novoCliente) {
    return (
      <ClienteForm
        onFechar={() => setNovoCliente(false)}
        onSalvo={(idLocal, nome) => {
          setClienteIdLocal(idLocal);
          setClienteNome(nome);
          setNovoCliente(false);
        }}
        onSessaoExpirada={onSessaoExpirada}
      />
    );
  }

  return (
    <div className={inline ? "flex flex-col" : "fixed inset-0 z-50 flex flex-col bg-spark-page"}>
      {!inline && (
        <header className="flex flex-none items-center justify-between border-b border-spark-line bg-spark-panel px-4 pb-3 pt-[calc(env(safe-area-inset-top)+0.75rem)]">
          <p className="text-[16px] font-semibold text-spark-ink">
            {editando ? "Editar consulta" : "Nova consulta"}
          </p>
          <button
            type="button"
            aria-label="Fechar"
            onClick={onFechar}
            className="flex h-10 w-10 items-center justify-center rounded-sm text-spark-body transition active:bg-spark-hover"
          >
            <X size={20} />
          </button>
        </header>
      )}

      <form
        onSubmit={salvar}
        className={
          inline
            ? "py-1"
            : "flex-1 overflow-y-auto px-4 py-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]"
        }
      >
        {/* Funcionario cadastrado */}
        <span className={labelCls}>Funcionário cadastrado *</span>
        {clienteIdLocal ? (
          <div className="mb-3 flex items-center justify-between gap-2 rounded-xl border border-spark-line bg-spark-panel px-3.5 py-3">
            <p className="min-w-0 flex-1 truncate text-[15px] font-semibold text-spark-ink">{clienteNome}</p>
            {!editando && (
              <button
                type="button"
                onClick={() => {
                  setClienteIdLocal("");
                  setClienteNome("");
                }}
                className="text-[12.5px] font-semibold text-spark-accent-strong"
              >
                Trocar
              </button>
            )}
          </div>
        ) : (
          <div className="relative mb-3">
            <div className="relative">
              <MagnifyingGlass size={17} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-spark-muted" />
              <input
                className={`${inputCls} pl-10`}
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar por nome, CPF ou telefone"
              />
            </div>
            {(resultados.length > 0 || buscando) && (
              <ul className="absolute z-10 mt-1 max-h-56 w-full overflow-y-auto rounded-xl border border-spark-line bg-spark-panel shadow-lg">
                {buscando && <li className="px-4 py-3 text-sm text-spark-muted">Buscando...</li>}
                {resultados.map((c) => (
                  <li key={c.idLocal}>
                    <button
                      type="button"
                      onClick={() => selecionarCliente(c)}
                      className="w-full px-4 py-3 text-left transition active:bg-spark-hover"
                    >
                      <p className="truncate text-[14px] font-semibold text-spark-ink">{c.nome}</p>
                      <p className="truncate text-xs text-spark-muted">
                        {[c.empresa, c.cargo].filter(Boolean).join(" | ")}
                      </p>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <button
              type="button"
              onClick={() => setNovoCliente(true)}
              className="mt-2 flex items-center gap-1.5 text-[13px] font-semibold text-spark-accent-strong"
            >
              <UserPlus size={16} />
              Cadastrar novo cliente
            </button>
          </div>
        )}

        <div className="mb-3 grid grid-cols-2 gap-3">
          <label className="block">
            <span className={labelCls}>Dia *</span>
            <input type="date" className={inputCls} value={data} onChange={(e) => setData(e.target.value)} />
          </label>
          <label className="block">
            <span className={labelCls}>Horario *</span>
            <input
              type="time"
              className={inputCls}
              value={horario}
              onChange={(e) => setHorario(e.target.value)}
            />
          </label>
        </div>

        <label className="mb-3 block">
          <span className={labelCls}>Local da consulta *</span>
          <input className={inputCls} value={local} onChange={(e) => setLocal(e.target.value)} maxLength={120} />
        </label>

        <label className="mb-3 block">
          <span className={labelCls}>Profissional / Sala</span>
          <select className={inputCls} value={profissionalIdLocal} onChange={(e) => setProfissionalIdLocal(e.target.value)}>
            <option value="">—</option>
            {profissionais.map((p) => (
              <option key={p.idLocal} value={p.idLocal}>
                {p.nome}
                {p.especialidadeFuncao ? ` (${p.especialidadeFuncao})` : ""}
              </option>
            ))}
          </select>
        </label>

        <div className="mb-3 grid grid-cols-2 gap-3">
          <label className="block">
            <span className={labelCls}>Status *</span>
            <select className={inputCls} value={status} onChange={(e) => setStatus(e.target.value)}>
              {STATUS.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className={labelCls}>Motivo *</span>
            <select className={inputCls} value={motivo} onChange={(e) => setMotivo(e.target.value)}>
              {MOTIVOS.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </label>
        </div>

        <label className="mb-3 flex items-center gap-3 rounded-xl border border-spark-line bg-spark-panel px-3.5 py-3">
          <input
            type="checkbox"
            checked={trabalhaArmado}
            onChange={(e) => setTrabalhaArmado(e.target.checked)}
            className="h-5 w-5 accent-[#E0670A]"
          />
          <span className="text-[14px] font-medium text-spark-ink">Trabalha armado</span>
        </label>

        <label className="mb-4 block">
          <span className={labelCls}>Observações</span>
          <textarea
            className={`${inputCls} h-24 resize-none py-2.5`}
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
          className="flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-spark-accent hover:bg-spark-accent-strong text-base font-semibold text-white transition active:scale-[0.98] disabled:opacity-60"
        >
          {salvando && <CircleNotch size={20} className="animate-spin" />}
          {salvando ? "Salvando..." : editando ? "Salvar alterações" : "Agendar consulta"}
        </button>

        {editando && (
          <button
            type="button"
            onClick={excluir}
            disabled={excluindo || salvando}
            className="mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-spark-danger/30 bg-spark-danger/5 text-[15px] font-semibold text-spark-danger transition active:scale-[0.98] disabled:opacity-60"
          >
            {excluindo ? <CircleNotch size={18} className="animate-spin" /> : <Trash size={18} />}
            {excluindo ? "Excluindo..." : "Excluir consulta"}
          </button>
        )}
      </form>
    </div>
  );
}
