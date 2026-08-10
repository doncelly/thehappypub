"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { fmtCOP, fmtDateLabel, fmtHM, lastNDays } from "@/lib/format";
import { computeAutoPuntualidad } from "@/lib/bonos";
import { createReportDoc, HAPPY_GOLD, GRAY } from "@/lib/pdf";
import { buildCajaCsvRows, rowsToCsvString } from "@/lib/caja-csv";

// Reporte semanal y CSV de caja del jefe — puertos directos de
// generateWeeklyPDF() y exportCajaCSV() del HTML original. Se pide la data
// bajo demanda (al tocar el botón) en vez de cargarla siempre en /panel.

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Database=any hasta correr `npm run supabase:types`; ver src/lib/types/database.types.ts
export async function generateWeeklyReportPdf(supabase: SupabaseClient<any>, today: string) {
  const days = lastNDays(today, 7);
  const monday = days[0];
  const sunday = days[6];

  const [{ data: agendaDays }, { data: orders }, { data: shifts }, { data: attendance }, { data: bonuses }, { data: losses }, { data: users }] =
    await Promise.all([
      supabase.from("agenda_days").select("date, daily_goal").in("date", days),
      supabase.from("orders").select("total, user_id, created_at").gte("created_at", `${monday}T00:00:00`).lte("created_at", `${sunday}T23:59:59`),
      supabase.from("shifts").select("*").in("date", days),
      supabase.from("attendance").select("*").in("date", days),
      supabase.from("bonuses").select("*").in("date", days),
      supabase.from("losses").select("*").gte("created_at", `${monday}T00:00:00`).lte("created_at", `${sunday}T23:59:59`),
      supabase.from("users").select("id, name"),
    ]);

  const usersById = Object.fromEntries((users ?? []).map((u) => [u.id, u.name]));
  const goalByDate = Object.fromEntries((agendaDays ?? []).map((a) => [a.date, a.daily_goal]));

  const ventasByDate: Record<string, number> = {};
  const ventasByDateUser: Record<string, Record<string, number>> = {};
  for (const o of orders ?? []) {
    const d = o.created_at.slice(0, 10);
    ventasByDate[d] = (ventasByDate[d] ?? 0) + o.total;
    (ventasByDateUser[d] ??= {})[o.user_id] = (ventasByDateUser[d]?.[o.user_id] ?? 0) + o.total;
  }

  const attendanceByDateUser: Record<string, Record<string, { check_in: string | null; check_out: string | null }>> = {};
  for (const a of attendance ?? []) {
    (attendanceByDateUser[a.date] ??= {})[a.user_id] = { check_in: a.check_in, check_out: a.check_out };
  }

  const bonusByDateUser: Record<string, Record<string, NonNullable<typeof bonuses>[number]>> = {};
  for (const b of bonuses ?? []) {
    (bonusByDateUser[b.date] ??= {})[b.user_id] = b;
  }

  const { doc, line, space } = await createReportDoc("Reporte Semanal");

  line(`${fmtDateLabel(days[0])}  al  ${fmtDateLabel(days[6])}`, 10, GRAY);
  space(2);

  for (const d of days) {
    line(fmtDateLabel(d), 12, HAPPY_GOLD, true);
    const goal = goalByDate[d];
    const ventas = ventasByDate[d] ?? 0;
    if (goal) {
      const pct = Math.round((ventas / Number(goal)) * 100);
      line(`Meta: ${fmtCOP(goal)}   Ventas: ${fmtCOP(ventas)}   Cumplimiento: ${pct}%`, 9);
    } else {
      line("Sin meta definida.", 9);
    }
    for (const t of (shifts ?? []).filter((s) => s.date === d)) {
      const uid = t.user_id ?? (users ?? []).find((u) => u.name.trim().toLowerCase() === t.person_name.trim().toLowerCase())?.id;
      const asist = uid ? attendanceByDateUser[d]?.[uid] : undefined;
      line(
        `  ${t.person_name} (${t.area || "-"}): ${t.schedule_label || "-"} | Llegada ${asist ? fmtHM(asist.check_in) : "-"} Salida ${asist ? fmtHM(asist.check_out) : "-"} | Aseo ${t.done ? "Listo" : "Pendiente"}`,
        8.5,
      );
    }
    space(2);
  }

  space(4);
  line("Resumen por empleado (semana)", 13, HAPPY_GOLD, true);
  space(1);

  type EmpStat = { name: string; dias: number; puntual: number; servicioOk: number; tareasOk: number; tareasTot: number; ventas: number };
  const empStats: Record<string, EmpStat> = {};
  for (const u of users ?? []) empStats[u.id] = { name: u.name, dias: 0, puntual: 0, servicioOk: 0, tareasOk: 0, tareasTot: 0, ventas: 0 };

  for (const d of days) {
    for (const t of (shifts ?? []).filter((s) => s.date === d)) {
      const u = (users ?? []).find((x) => x.name.trim().toLowerCase() === t.person_name.trim().toLowerCase());
      if (!u || !empStats[u.id]) continue;
      const stat = empStats[u.id];
      stat.dias++;
      const checkIn = attendanceByDateUser[d]?.[u.id]?.check_in ?? null;
      if (computeAutoPuntualidad(t.schedule_label, checkIn) === true) stat.puntual++;
      const manual = bonusByDateUser[d]?.[u.id];
      if (manual) {
        if (manual.service === true) stat.servicioOk++;
        for (const k of ["task_alistamiento", "task_inventario", "task_apertura", "task_cierre"] as const) {
          const v = manual[k];
          if (v !== null && v !== undefined) {
            stat.tareasTot++;
            if (v === true) stat.tareasOk++;
          }
        }
      }
      stat.ventas += ventasByDateUser[d]?.[u.id] ?? 0;
    }
  }

  for (const stat of Object.values(empStats).filter((e) => e.dias > 0)) {
    line(
      `${stat.name}: ${stat.dias} días · puntual ${stat.puntual}/${stat.dias} · servicio OK ${stat.servicioOk} · tareas OK ${stat.tareasOk}/${stat.tareasTot} · ventas atribuidas ${fmtCOP(stat.ventas)}`,
      9,
    );
  }

  space(5);
  line("Pérdidas reportadas (semana)", 13, HAPPY_GOLD, true);
  space(1);
  if (losses && losses.length > 0) {
    for (const p of losses) {
      line(`${p.category}: ${p.description} x${p.qty}${p.reason ? " — " + p.reason : ""} (${usersById[p.user_id] ?? "—"})`, 8.5);
    }
  } else {
    line("Sin pérdidas reportadas esta semana.", 9);
  }

  doc.save(`reporte-happy-${days[6]}.pdf`);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Database=any hasta correr `npm run supabase:types`
export async function exportCajaCsv(supabase: SupabaseClient<any>, today: string): Promise<boolean> {
  const days = lastNDays(today, 7);

  const [{ data: cashRegisters }, { data: orders }] = await Promise.all([
    supabase.from("cash_register").select("*").in("date", days),
    supabase.from("orders").select("total, created_at").gte("created_at", `${days[0]}T00:00:00`).lte("created_at", `${days[6]}T23:59:59`),
  ]);

  if (!cashRegisters || cashRegisters.length === 0) return false;

  const ventasByDate: Record<string, number> = {};
  for (const o of orders ?? []) {
    const d = o.created_at.slice(0, 10);
    ventasByDate[d] = (ventasByDate[d] ?? 0) + o.total;
  }

  const rows = buildCajaCsvRows(days, cashRegisters, ventasByDate);
  if (rows.length === 1) return false;

  const csv = rowsToCsvString(rows);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `cierres-caja-happy-pub-${days[6]}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  return true;
}
