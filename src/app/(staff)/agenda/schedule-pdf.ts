"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { fmtDateLabel, weekDates } from "@/lib/format";
import { createReportDoc, HAPPY_GOLD, GRAY, BRAND_TEXT } from "@/lib/pdf";

const BUCKET = "happy-pub-photos";

// Genera el PDF de horarios de la semana (turnos reales ya asignados en
// Agenda, no la plantilla) y lo guarda en Storage para que jefe, mesero y
// cocinero lo puedan descargar desde Mi día — reemplaza mandar el Excel por
// aparte cada semana.
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Database=any hasta correr `npm run supabase:types`
export async function generateAndSaveSchedulePdf(supabase: SupabaseClient<any>, monday: string): Promise<{ error: string | null }> {
  const days = weekDates(monday);
  const sunday = days[6];

  const [{ data: agendaDays }, { data: shifts }] = await Promise.all([
    supabase.from("agenda_days").select("*").in("date", days),
    supabase.from("shifts").select("*").in("date", days).order("created_at"),
  ]);

  const agendaByDate = Object.fromEntries((agendaDays ?? []).map((a) => [a.date, a]));

  const { doc, line, space } = await createReportDoc("Horario de la semana");
  line(`${fmtDateLabel(monday)}  al  ${fmtDateLabel(sunday)}`, 10, GRAY);
  space(3);

  for (const d of days) {
    const a = agendaByDate[d];
    line(fmtDateLabel(d), 13, HAPPY_GOLD, true);

    const opParts: string[] = [];
    if (a?.start_time) opParts.push(`Inicio: ${a.start_time.slice(0, 5)}`);
    if (a?.shift_admin) opParts.push(`Admin: ${a.shift_admin}`);
    if (a?.daily_goal) opParts.push(`Meta: $${Math.round(Number(a.daily_goal)).toLocaleString("es-CO")}`);
    line(opParts.length ? opParts.join("  ·  ") : "Sin datos de operación cargados para este día.", 9);
    if (a?.promo && a.promo !== "NA") line(`Promo: ${a.promo}`, 8.5, GRAY);
    if (a?.event && a.event !== "NA") line(`Evento: ${a.event}`, 8.5, GRAY);

    const dayShifts = (shifts ?? []).filter((s) => s.date === d);
    for (const tipo of ["cocina", "mesa"] as const) {
      const list = dayShifts.filter((s) => s.shift_type === tipo);
      if (list.length === 0) continue;
      line(tipo === "cocina" ? "Cocina" : "Mesas", 9.5, BRAND_TEXT, true);
      for (const s of list) {
        line(`  ${s.person_name}${s.area ? ` (${s.area})` : ""} — ${s.schedule_label || "sin horario"}`, 8.5);
        if (s.cleaning_task) line(`    Aseo: ${s.cleaning_task}`, 8, GRAY);
      }
    }
    if (dayShifts.length === 0) line("Sin turnos asignados todavía.", 8.5, GRAY);
    space(3);
  }

  const blob = doc.output("blob");
  const path = `agenda-schedules/${monday}.pdf`;
  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, blob, { upsert: true, contentType: "application/pdf" });
  if (uploadError) return { error: uploadError.message };

  return { error: null };
}
