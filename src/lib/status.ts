// Cores por status da consulta, num lugar so: a barra lateral do cartao da
// lista, o ponto da timeline, o chip de rotulo e o bloco da grade de horarios
// precisam concordar entre si. Antes isso vivia dentro da AgendaScreen.

export interface StatusInfo {
  bar: string;
  dot: string;
  chip: string;
  // Bloco preenchido da grade da semana (fundo + borda + texto).
  bloco: string;
}

export function statusInfo(status?: string): StatusInfo {
  const s = (status || "").toLowerCase();

  if (s.includes("cancel"))
    return {
      bar: "bg-spark-danger",
      dot: "bg-spark-danger",
      chip: "bg-spark-danger/10 text-spark-danger",
      bloco: "border-spark-danger/30 bg-spark-danger/8 text-spark-danger",
    };

  if (s.includes("realiz") || s.includes("conclu"))
    return {
      bar: "bg-spark-success",
      dot: "bg-spark-success",
      chip: "bg-spark-success/10 text-spark-success",
      bloco: "border-spark-success/30 bg-spark-success/8 text-spark-success",
    };

  return {
    bar: "bg-spark-accent",
    dot: "bg-spark-accent",
    chip: "bg-spark-soft text-spark-accent-strong",
    bloco: "border-spark-accent/35 bg-spark-soft text-spark-accent-strong",
  };
}
