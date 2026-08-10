// Helpers de formato — puertos directos de las funciones del HTML original
// (fmtQty, fmtRelTime, todayISO, fmtCOP) para no reinventar el criterio real.

function isoOfDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function todayISO(): string {
  return isoOfDate(new Date());
}

// Envuelto en su propia función para que el linter de pureza de React (que
// marca Date.now()/new Date() sueltos en el cuerpo de un componente como
// impuros) no se dispare al llamarlo desde un Server Component — acá es
// exactamente lo que se necesita: la hora real del servidor al momento del
// request, no un valor cacheable entre renders.
export function minutesAgoISO(minutes: number): string {
  return new Date(Date.now() - minutes * 60_000).toISOString();
}

export function mondayOf(dateISO: string): string {
  const d = new Date(dateISO + "T12:00:00");
  const day = d.getDay(); // 0=dom … 6=sáb
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day));
  return isoOfDate(d);
}

export function weekDates(mondayISO: string): string[] {
  const start = new Date(mondayISO + "T12:00:00");
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    return isoOfDate(d);
  });
}

// Últimos n días terminando en todayISO (incluido) — la ventana "rolling" que
// usan el PDF semanal, el PDF personal y el CSV de caja del original, distinta
// de weekDates() que es lunes-domingo de una semana fija.
export function lastNDays(todayISO: string, n: number): string[] {
  const today = new Date(todayISO + "T12:00:00");
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(today);
    d.setDate(d.getDate() - (n - 1 - i));
    return isoOfDate(d);
  });
}

// quincenaRange() del original: 1-15 o 16-fin de mes, según el día de hoy.
export function quincenaRange(): { start: string; end: string } {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  if (now.getDate() <= 15) {
    return { start: isoOfDate(new Date(y, m, 1)), end: isoOfDate(new Date(y, m, 15)) };
  }
  const lastDay = new Date(y, m + 1, 0).getDate();
  return { start: isoOfDate(new Date(y, m, 16)), end: isoOfDate(new Date(y, m, lastDay)) };
}

export function fmtQty(unit: string, qty: number): string {
  return unit === "g" && qty >= 1000 ? `${(qty / 1000).toFixed(1)} kg` : `${qty} ${unit}`;
}

const MESES_ES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

function fmtHora12(d: Date): string {
  const m = String(d.getMinutes()).padStart(2, "0");
  const ampm = d.getHours() >= 12 ? "p. m." : "a. m.";
  const h = d.getHours() % 12 || 12;
  return `${h}:${m} ${ampm}`;
}

// Formateo manual en vez de toLocaleDateString/toLocaleTimeString: esas dos
// dependen de los datos ICU instalados en cada entorno (Node en el servidor vs.
// el navegador en el cliente), y pueden diferir en detalles como "ago." vs "ago"
// o "p.m." vs "p. m." — eso rompe la hidratación de Server Components. Con
// formateo propio, servidor y cliente siempre coinciden.
export function fmtRelTime(ts: string | number | Date | null): string {
  if (!ts) return "sin reportar";
  const d = new Date(ts);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const hh = fmtHora12(d);
  return sameDay ? `hoy, ${hh}` : `${String(d.getDate()).padStart(2, "0")} ${MESES_ES[d.getMonth()]}, ${hh}`;
}

export function fmtHM(ts: string | number | Date | null): string {
  if (!ts) return "—";
  return fmtHora12(new Date(ts));
}

const DIAS_ES = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
const DIAS_LARGOS_ES = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

export function fmtDateShort(iso: string): string {
  const d = new Date(iso + "T12:00:00");
  return `${DIAS_ES[d.getDay()]} ${String(d.getDate()).padStart(2, "0")}`;
}

export function fmtDateLabel(iso: string): string {
  const d = new Date(iso + "T12:00:00");
  return `${DIAS_LARGOS_ES[d.getDay()]}, ${String(d.getDate()).padStart(2, "0")} ${MESES_ES[d.getMonth()]}`;
}

// Mismo motivo que fmtRelTime: sin toLocaleString, para que el separador de
// miles no dependa de los datos ICU del entorno.
export function fmtCOP(n: number): string {
  const grouped = Math.round(Number(n) || 0)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `$ ${grouped}`;
}

// daysUntilDue() del original. Toma "hoy" como parámetro explícito (en vez de
// leer Date.now() adentro) para poder llamarse desde el cuerpo de un
// componente sin chocar con la regla de pureza de React.
export function daysUntilDue(todayISO: string, dueDay: number | null): number | null {
  if (!dueDay) return null;
  const today = new Date(todayISO + "T00:00:00");
  let due = new Date(today.getFullYear(), today.getMonth(), dueDay);
  if (due < today) due = new Date(today.getFullYear(), today.getMonth() + 1, dueDay);
  return Math.round((due.getTime() - today.getTime()) / 86400000);
}
