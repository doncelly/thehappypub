// Helpers de formato — puertos directos de las funciones del HTML original
// (fmtQty, fmtRelTime, todayISO, fmtCOP) para no reinventar el criterio real.

function isoOfDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Estas funciones corren tanto en Server Components (Vercel, reloj en UTC)
// como en Client Components (el navegador del mesero, reloj en hora Bogotá)
// — por eso usan getters UTC explícitos en vez de los locales de isoOfDate:
// así el resultado no depende de en cuál de los dos entornos se ejecuten.
// Colombia no observa horario de verano, así que el offset es fijo.
const BOGOTA_OFFSET_MS = 5 * 60 * 60 * 1000;

function isoOfDateUTC(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

function nowInBogota(): Date {
  return new Date(Date.now() - BOGOTA_OFFSET_MS);
}

// Sin este ajuste, "hoy" cambiaba a las 7pm hora Bogotá (medianoche UTC) en
// vez de a medianoche real, y los pedidos registrados después de esa hora
// quedaban fechados "mañana": al recargar la página, la consulta de
// "pedidos de hoy" ya no los incluía y parecían haber desaparecido (aunque
// seguían intactos en la base de datos).
export function todayISO(): string {
  return isoOfDateUTC(nowInBogota());
}

// A qué día calendario de Bogotá pertenece un timestamp UTC (orders.created_at,
// etc.) — inverso de bogotaDayRangeUTC(). Usar esto en vez de
// `ts.slice(0, 10)` para agrupar ventas por día: ese slice toma el día UTC,
// que a partir de las 7pm hora Bogotá ya es "mañana".
export function bogotaDateOf(ts: string): string {
  return isoOfDateUTC(new Date(new Date(ts).getTime() - BOGOTA_OFFSET_MS));
}

// Rango UTC real de un día calendario de Bogotá, para filtrar columnas
// timestamptz (como orders.created_at) con .gte()/.lte(). Un día de Bogotá
// (medianoche a medianoche hora local) empieza a las 05:00 UTC y termina a
// las 04:59:59 UTC del día siguiente — construir el rango con
// `${date}T00:00:00`/`${date}T23:59:59` a secas (interpretado en UTC) corta
// el día del negocio a las 7pm hora Bogotá.
export function bogotaDayRangeUTC(dateISO: string): { start: string; end: string } {
  const start = new Date(`${dateISO}T00:00:00Z`);
  start.setUTCHours(start.getUTCHours() + 5);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  end.setUTCSeconds(end.getUTCSeconds() - 1);
  return { start: start.toISOString(), end: end.toISOString() };
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
  const now = nowInBogota();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  if (now.getUTCDate() <= 15) {
    return { start: isoOfDateUTC(new Date(Date.UTC(y, m, 1))), end: isoOfDateUTC(new Date(Date.UTC(y, m, 15))) };
  }
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return { start: isoOfDateUTC(new Date(Date.UTC(y, m, 16))), end: isoOfDateUTC(new Date(Date.UTC(y, m, lastDay))) };
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
