import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentAppUser, roleOf } from "@/lib/auth/current-user";
import { todayISO, bogotaDayRangeUTC } from "@/lib/format";
import { ensureDateTab, writeCajaTab } from "@/lib/google-sheets";

// Actualiza la pestaña de la fecha en la hoja de cálculo de cierres de caja
// del jefe (ver GOOGLE_DRIVE_SETUP.md) — reemplaza el viejo "subir CSV nuevo a
// una carpeta cada vez". Una pestaña por fecha (formato DD/MM/YYYY, igual que
// el jefe las nombra a mano), creada duplicando la pestaña plantilla si no
// existe todavía. Solo-jefe.
const TEMPLATE_TAB = "Copia de COPIA BASE";
const DIAS_LARGOS_ES = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

function fmtDDMMYYYY(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

// El jefe no siempre le pone el cero al día cuando duplica la pestaña a mano
// ("6/08/2026" en vez de "06/08/2026") — variantes de nombre a buscar antes
// de crear una pestaña nueva, para no duplicar. candidates[0] es el nombre
// canónico (con cero) que se usa si hay que crear la pestaña.
function tabTitleCandidates(iso: string): string[] {
  const [, m, d] = iso.split("-");
  const canonical = fmtDDMMYYYY(iso);
  const noPadDay = d.startsWith("0") ? `${Number(d)}/${m}/${iso.split("-")[0]}` : null;
  return noPadDay ? [canonical, noPadDay] : [canonical];
}

function diaLargo(iso: string): string {
  const d = new Date(iso + "T12:00:00");
  return DIAS_LARGOS_ES[d.getDay()];
}

function addDaysISO(iso: string, days: number): string {
  const d = new Date(iso + "T12:00:00");
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// "16:00" -> "4:00 p. m." — mismo criterio de fmtHM en lib/format.ts, pero a
// partir de un string "HH:MM" de la BD (columna time) en vez de un timestamp.
function fmtHoraSheet(t: string | null): string {
  if (!t) return "";
  const [hh, mm] = t.split(":");
  const h = Number(hh);
  const ampm = h >= 12 ? "p. m." : "a. m.";
  const h12 = h % 12 || 12;
  return `${h12}:${mm} ${ampm}`;
}

function fmtPesoSheet(n: number | null): string {
  if (n === null || n === undefined) return "";
  return "$" + Math.round(Number(n)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

export async function POST(req: Request) {
  const caller = await getCurrentAppUser();
  if (!caller || roleOf(caller) !== "jefe") {
    return NextResponse.json({ error: "Solo un jefe puede actualizar la hoja de cierres." }, { status: 403 });
  }

  const spreadsheetId = process.env.GOOGLE_CIERRES_SHEET_ID;
  if (!spreadsheetId) {
    return NextResponse.json(
      { error: "Falta configurar GOOGLE_CIERRES_SHEET_ID en .env.local — ver GOOGLE_DRIVE_SETUP.md." },
      { status: 400 },
    );
  }

  const { date } = (await req.json().catch(() => ({}))) as { date?: string };
  const targetDate = date || todayISO();

  const supabase = await createClient();
  const prevDayRange = bogotaDayRangeUTC(addDaysISO(targetDate, -1));
  const [{ data: cash, error: cashError }, { data: purchases }, { data: transportAid }, { data: prevOrders }] = await Promise.all([
    supabase.from("cash_register").select("*").eq("date", targetDate).maybeSingle(),
    supabase.from("cash_register_purchases").select("concept, amount").eq("date", targetDate),
    supabase.from("cash_register_transport_aid").select("collaborator, amount").eq("date", targetDate),
    supabase
      .from("orders")
      .select("total")
      .gte("created_at", prevDayRange.start)
      .lte("created_at", prevDayRange.end),
  ]);

  if (cashError || !cash) {
    return NextResponse.json({ error: "No hay caja abierta ni cerrada registrada para esa fecha." }, { status: 404 });
  }

  const ventasAyer = (prevOrders ?? []).reduce((s, o) => s + o.total, 0);
  const comprasTotal = (purchases ?? []).reduce((s, p) => s + p.amount, 0);
  const totalVentasCaja = (Number(cash.cash_amount) || 0) + (Number(cash.card_amount) || 0);

  // El jefe abre un turno un día y cierra pasada la medianoche del siguiente
  // — cash_register solo tiene una fecha (no fecha de apertura + fecha de
  // cierre por separado), así que si la hora de cierre es menor que la de
  // apertura asumimos que cruzó medianoche.
  const crossedMidnight = !!(cash.open_time && cash.close_time && cash.close_time < cash.open_time);
  const closeDate = crossedMidnight ? addDaysISO(targetDate, 1) : targetDate;

  let tabTitle: string;

  try {
    tabTitle = await ensureDateTab(spreadsheetId, TEMPLATE_TAB, tabTitleCandidates(targetDate));
    await writeCajaTab(spreadsheetId, tabTitle, {
      cells: {
        B7: cash.open_by ?? "",
        B8: fmtDDMMYYYY(targetDate),
        B9: diaLargo(targetDate),
        B10: fmtHoraSheet(cash.open_time),
        B11: fmtPesoSheet(cash.base_amount),
        B12: fmtPesoSheet(cash.remnant_received),
        B13: fmtPesoSheet(ventasAyer),
        B14: fmtHoraSheet(cash.open_time),
        B16: cash.close_by ?? "",
        B17: fmtDDMMYYYY(closeDate),
        B18: diaLargo(closeDate),
        B19: fmtHoraSheet(cash.close_time),
        B20: fmtPesoSheet(comprasTotal),
        B21: fmtPesoSheet(cash.cash_amount),
        B22: fmtPesoSheet(cash.card_amount),
        B23: fmtPesoSheet(totalVentasCaja),
        B25: fmtPesoSheet(cash.remnant_accumulated),
        B26: fmtPesoSheet(cash.next_base),
        B28: fmtHoraSheet(cash.close_time),
      },
      compras: (purchases ?? []).map((p) => ({ concept: p.concept, amount: p.amount })),
      auxilios: (transportAid ?? []).map((a) => ({ collaborator: a.collaborator, amount: a.amount })),
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "No se pudo actualizar la hoja de cierres." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, tab: tabTitle });
}
