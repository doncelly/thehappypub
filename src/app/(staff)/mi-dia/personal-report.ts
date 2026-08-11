"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { fmtCOP, fmtDateLabel, fmtHM, lastNDays, bogotaDayRangeUTC, bogotaDateOf } from "@/lib/format";
import { shiftEarnings, type Rates, type WorkType } from "@/lib/earnings";
import { computeAutoVentas, computeAutoPuntualidad } from "@/lib/bonos";
import { createReportDoc, HAPPY_GOLD, GRAY } from "@/lib/pdf";

const WORK_TYPE_LABEL: Record<WorkType, string> = { mesero: "Mesero", cocinero: "Cocinero", administracion: "Administración" };

type CurrentUser = { id: string; name: string; role: "jefe" | "staff"; subrole: "mesero" | "cocinero" | null };

// generatePersonalPDF() del original — 14 días de respaldo personal.
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Database=any hasta correr `npm run supabase:types`
export async function generatePersonalReportPdf(supabase: SupabaseClient<any>, today: string, user: CurrentUser, rates: Rates | null) {
  const days = lastNDays(today, 14);
  const fixedWorkType: WorkType | null = user.role === "staff" ? (user.subrole as WorkType) : null;
  const range = { start: bogotaDayRangeUTC(days[0]).start, end: bogotaDayRangeUTC(days[13]).end };

  const [{ data: attendance }, { data: shifts }, { data: bonuses }, { data: agendaDays }, { data: orders }, { data: ratings }] = await Promise.all([
    supabase.from("attendance").select("date, work_type, check_in, check_out").eq("user_id", user.id).in("date", days).order("date"),
    supabase.from("shifts").select("date, person_name, schedule_label").in("date", days),
    supabase.from("bonuses").select("*").eq("user_id", user.id).in("date", days),
    supabase.from("agenda_days").select("date, daily_goal").in("date", days),
    supabase.from("orders").select("total, created_at").gte("created_at", range.start).lte("created_at", range.end),
    supabase.from("service_ratings").select("rating, created_at").eq("user_id", user.id).gte("created_at", range.start).lte("created_at", range.end),
  ]);

  const goalByDate = Object.fromEntries((agendaDays ?? []).map((a) => [a.date, a.daily_goal]));
  const ventasByDate: Record<string, number> = {};
  for (const o of orders ?? []) {
    const d = bogotaDateOf(o.created_at);
    ventasByDate[d] = (ventasByDate[d] ?? 0) + o.total;
  }

  const { doc, line, space } = await createReportDoc("Mi Reporte");

  line(`${user.name} · ${fmtDateLabel(days[0])} al ${fmtDateLabel(days[13])}`, 10, GRAY);
  space(4);

  if (rates) {
    if (fixedWorkType === "cocinero") line(`Tarifa: ${fmtCOP(rates.cocinero_flat)}/hora (plana)`, 9);
    else if (!fixedWorkType) line(`Tarifas: mesero por franja, o administración ${fmtCOP(rates.administracion_flat)}/hora (plana)`, 9);
    else line(`Tarifas: antes 11pm ${fmtCOP(rates.mesero_t1)}/h · 11pm-1am ${fmtCOP(rates.mesero_t2)}/h · después 1am ${fmtCOP(rates.mesero_t3)}/h`, 9);
  }
  space(3);

  let totalGanado = 0;
  const nowMs = Date.now();
  for (const a of attendance ?? []) {
    if (!a.check_in) continue;
    const ganado = rates ? shiftEarnings(a.work_type, rates, new Date(a.check_in).getTime(), a.check_out ? new Date(a.check_out).getTime() : null, nowMs) : 0;
    totalGanado += ganado;
    const horas = ((a.check_out ? new Date(a.check_out).getTime() : nowMs) - new Date(a.check_in).getTime()) / 3600000;
    const tipo = fixedWorkType ? "" : ` (${WORK_TYPE_LABEL[a.work_type as WorkType]})`;
    line(`${fmtDateLabel(a.date)}${tipo}: ${fmtHM(a.check_in)}–${fmtHM(a.check_out)} (${horas.toFixed(1)}h) → ${fmtCOP(ganado)}`, 9);
  }
  space(4);
  line(`Total estimado del periodo: ${fmtCOP(totalGanado)}`, 12, HAPPY_GOLD, true);

  space(6);
  line("Tus calificaciones (bonificaciones)", 12, HAPPY_GOLD, true);
  space(1);
  const myName = user.name.trim().toLowerCase();
  for (const d of days) {
    const hasTurno = (shifts ?? []).some((t) => t.date === d && t.person_name.trim().toLowerCase() === myName);
    if (!hasTurno) continue;
    const myShift = (shifts ?? []).find((t) => t.date === d && t.person_name.trim().toLowerCase() === myName);
    const checkIn = (attendance ?? []).find((a) => a.date === d)?.check_in ?? null;
    const ventasOk = computeAutoVentas(goalByDate[d], ventasByDate[d] ?? 0);
    const puntualOk = computeAutoPuntualidad(myShift?.schedule_label, checkIn);
    const manual = (bonuses ?? []).find((b) => b.date === d);
    const parts = [`Ventas ${ventasOk === true ? "✓" : ventasOk === false ? "✗" : "—"}`, `Puntualidad ${puntualOk === true ? "✓" : puntualOk === false ? "✗" : "—"}`];
    if (manual) {
      parts.push(`Servicio ${manual.service === true ? "✓" : manual.service === false ? "✗" : "—"}`);
      for (const [label, key] of [
        ["alistamiento", "task_alistamiento"],
        ["inventario", "task_inventario"],
        ["apertura", "task_apertura"],
        ["cierre", "task_cierre"],
      ] as const) {
        const v = manual[key];
        parts.push(`${label} ${v === true ? "✓" : v === false ? "✗" : "—"}`);
      }
    }
    line(`${fmtDateLabel(d)}: ${parts.join(" · ")}`, 8.5);
  }

  if (ratings && ratings.length > 0) {
    space(5);
    const bien = ratings.filter((r) => r.rating === "bien").length;
    const regular = ratings.filter((r) => r.rating === "regular").length;
    const mal = ratings.filter((r) => r.rating === "mal").length;
    line(`Calificación de clientes vía QR (periodo): ${bien}😊 ${regular}😐 ${mal}😞`, 9);
  }

  space(6);
  line("Esto es un estimado de referencia, no reemplaza tu liquidación oficial.", 9, GRAY);
  doc.save(`mi-reporte-${user.name.replace(/\s+/g, "-").toLowerCase()}-${days[13]}.pdf`);
}
