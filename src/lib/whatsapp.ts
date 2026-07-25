// wa.me exige DDI: prefixa 55 quando o numero vem so com DDD (10-11 digitos).
export function numeroWhatsapp(telefone?: string): string {
  const digitos = (telefone ?? "").replace(/\D/g, "");
  if (digitos.length >= 12 && digitos.startsWith("55")) return digitos;
  if (digitos.length >= 10) return `55${digitos}`;
  return "";
}

export function linkWhatsapp(numero: string, texto?: string): string {
  const query = texto ? `?text=${encodeURIComponent(texto)}` : "";
  return `https://wa.me/${numero}${query}`;
}
