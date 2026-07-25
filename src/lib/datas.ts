// Utilitarios de data do calendario (sem dependencias, datas como yyyy-MM-dd).

export const MESES = [
  "Janeiro", "Fevereiro", "Marco", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

export const DIAS_SEMANA = ["D", "S", "T", "Q", "Q", "S", "S"];

export function paraIso(data: Date): string {
  const m = String(data.getMonth() + 1).padStart(2, "0");
  const d = String(data.getDate()).padStart(2, "0");
  return `${data.getFullYear()}-${m}-${d}`;
}

export function hojeIso(): string {
  return paraIso(new Date());
}

export function formatarBr(iso: string): string {
  const [ano, mes, dia] = iso.split("-");
  return `${dia}/${mes}/${ano}`;
}

export interface CelulaCalendario {
  iso: string;
  dia: number;
  doMes: boolean;
}

// Grade do mes: comeca no domingo da semana do dia 1 e fecha a ultima semana.
export function gradeDoMes(ano: number, mes: number): CelulaCalendario[] {
  const primeiro = new Date(ano, mes, 1);
  const inicio = new Date(ano, mes, 1 - primeiro.getDay());
  const celulas: CelulaCalendario[] = [];
  const cursor = new Date(inicio);

  while (celulas.length < 42) {
    celulas.push({
      iso: paraIso(cursor),
      dia: cursor.getDate(),
      doMes: cursor.getMonth() === mes,
    });
    cursor.setDate(cursor.getDate() + 1);
    if (celulas.length % 7 === 0 && cursor.getMonth() !== mes && celulas.length >= 28)
      break;
  }

  return celulas;
}

export function chaveMes(ano: number, mes: number): string {
  return `${ano}-${String(mes + 1).padStart(2, "0")}`;
}

export function nomeDiaSemana(iso: string): string {
  const nomes = ["Domingo", "Segunda", "Terca", "Quarta", "Quinta", "Sexta", "Sabado"];
  const [ano, mes, dia] = iso.split("-").map(Number);
  return nomes[new Date(ano, mes - 1, dia).getDay()];
}
