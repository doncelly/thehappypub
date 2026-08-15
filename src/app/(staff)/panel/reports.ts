"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { fmtCOP, fmtDateLabel, fmtHM, lastNDays, bogotaDayRangeUTC, bogotaDateOf } from "@/lib/format";
import { computeAutoPuntualidadPuntos, computeAutoVentasPuntos, PUNTUALIDAD_META_SEMANAL, PUNTO_VALOR_PESOS } from "@/lib/bonos";
import { createReportDoc, HAPPY_GOLD, GRAY } from "@/lib/pdf";
import { buildCajaCsvRows, rowsToCsvString } from "@/lib/caja-csv";

const REPORTS_BUCKET = "happy-pub-photos";

// Reporte semanal y CSV de caja del jefe — puertos directos de
// generateWeeklyPDF() y exportCajaCSV() del HTML original. Se pide la data
// bajo demanda (al tocar el botón) en vez de cargarla siempre en /panel.

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Database=any hasta correr `npm run supabase:types`; ver src/lib/types/database.types.ts
export async function generateWeeklyReportPdf(supabase: SupabaseClient<any>, today: string) {
  const days = lastNDays(today, 7);
  const monday = days[0];
  const sunday = days[6];

  const weekRange = { start: bogotaDayRangeUTC(monday).start, end: bogotaDayRangeUTC(sunday).end };

  const [{ data: agendaDays }, { data: orders }, { data: shifts }, { data: attendance }, { data: bonuses }, { data: losses }, { data: users }] =
    await Promise.all([
      supabase.from("agenda_days").select("date, daily_goal").in("date", days),
      supabase.from("orders").select("total, user_id, created_at").gte("created_at", weekRange.start).lte("created_at", weekRange.end),
      supabase.from("shifts").select("*").in("date", days),
      supabase.from("attendance").select("*").in("date", days),
      supabase.from("bonuses").select("*").in("date", days),
      supabase.from("losses").select("*").gte("created_at", weekRange.start).lte("created_at", weekRange.end),
      supabase.from("users").select("id, name"),
    ]);

  const usersById = Object.fromEntries((users ?? []).map((u) => [u.id, u.name]));
  const goalByDate = Object.fromEntries((agendaDays ?? []).map((a) => [a.date, a.daily_goal]));

  const ventasByDate: Record<string, number> = {};
  const ventasByDateUser: Record<string, Record<string, number>> = {};
  for (const o of orders ?? []) {
    const d = bogotaDateOf(o.created_at);
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

  type EmpStat = { name: string; dias: number; puntualidadPts: number; ventasPts: number; servicioOk: number; tareasOk: number; tareasTot: number; ventas: number };
  const empStats: Record<string, EmpStat> = {};
  for (const u of users ?? []) empStats[u.id] = { name: u.name, dias: 0, puntualidadPts: 0, ventasPts: 0, servicioOk: 0, tareasOk: 0, tareasTot: 0, ventas: 0 };

  for (const d of days) {
    const ventasPtsDelDia = computeAutoVentasPuntos(goalByDate[d] ?? null, ventasByDate[d] ?? 0);
    for (const t of (shifts ?? []).filter((s) => s.date === d)) {
      const u = (users ?? []).find((x) => x.name.trim().toLowerCase() === t.person_name.trim().toLowerCase());
      if (!u || !empStats[u.id]) continue;
      const stat = empStats[u.id];
      stat.dias++;
      const checkIn = attendanceByDateUser[d]?.[u.id]?.check_in ?? null;
      const pts = computeAutoPuntualidadPuntos(t.schedule_label, checkIn);
      if (pts !== null) stat.puntualidadPts += pts;
      if (ventasPtsDelDia !== null) stat.ventasPts += ventasPtsDelDia;
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
    const cumpleMeta = stat.puntualidadPts >= PUNTUALIDAD_META_SEMANAL;
    const bonoEstimado = (stat.puntualidadPts + stat.ventasPts) * PUNTO_VALOR_PESOS;
    line(
      `${stat.name}: ${stat.dias} días · puntualidad ${stat.puntualidadPts}/${PUNTUALIDAD_META_SEMANAL} pts${cumpleMeta ? " ✓" : ""} · ventas ${stat.ventasPts} pts · bono estimado ${fmtCOP(bonoEstimado)} · servicio OK ${stat.servicioOk} · tareas OK ${stat.tareasOk}/${stat.tareasTot} · ventas atribuidas ${fmtCOP(stat.ventas)}`,
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

  // Punto 13 del backlog: además de descargar, guarda una copia en Storage
  // (bucket compartido con horarios/fotos) para poder verla después agrupada
  // por año — key = último día del rango (el que cambia cada vez que se
  // genera, ya que el reporte es "últimos 7 días" y no una semana calendario
  // fija). Regenerar el mismo día sobrescribe esa copia (upsert).
  const blob = doc.output("blob");
  const path = `weekly-reports/${days[6]}.pdf`;
  await supabase.storage.from(REPORTS_BUCKET).upload(path, blob, { upsert: true, contentType: "application/pdf" });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Database=any hasta correr `npm run supabase:types`
export async function exportCajaCsv(supabase: SupabaseClient<any>, today: string): Promise<boolean> {
  const days = lastNDays(today, 7);
  const csvRange = { start: bogotaDayRangeUTC(days[0]).start, end: bogotaDayRangeUTC(days[6]).end };

  const [{ data: cashRegisters }, { data: orders }] = await Promise.all([
    supabase.from("cash_register").select("*").in("date", days),
    supabase.from("orders").select("total, created_at").gte("created_at", csvRange.start).lte("created_at", csvRange.end),
  ]);

  if (!cashRegisters || cashRegisters.length === 0) return false;

  const ventasByDate: Record<string, number> = {};
  for (const o of orders ?? []) {
    const d = bogotaDateOf(o.created_at);
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

type AprovisionamientoTiers = { bajo: number; medio: number; alto: number; total: number };

type ResumenParams = {
  today: string;
  personalHoy: { name: string; entrada: string | null; salida: string | null }[];
  ventasHoy: number;
  dailyGoal: number | null;
  ventasSemana: number;
  weeklyGoal: number | null;
  aprovisionamiento: { cocina: AprovisionamientoTiers; barra: AprovisionamientoTiers; total: AprovisionamientoTiers };
  actividad: { message: string; created_at: string }[];
  ventasPorMesa: { mesa: string; total: number; pedidos: number }[];
};

// Módulo Resumen del Panel de administrador — snapshot del día actual (no
// confundir con el "Reporte semanal" de arriba, que cubre últimos 7 días de
// asistencia/caja/pérdidas). Toda la data ya está cargada en PanelClient
// (Realtime), así que no vuelve a consultar la base — solo la formatea.
export async function generateResumenPdf(p: ResumenParams) {
  const { doc, line, space } = await createReportDoc("Resumen del día");
  line(fmtDateLabel(p.today), 10, GRAY);
  space(3);

  line("Personal en sitio hoy", 13, HAPPY_GOLD, true);
  space(1);
  if (p.personalHoy.length === 0) {
    line("Nadie ha marcado llegada hoy.", 9);
  } else {
    for (const person of p.personalHoy) {
      line(`${person.name}: Entrada ${fmtHM(person.entrada)} · Salida ${fmtHM(person.salida)}`, 9);
    }
  }

  space(4);
  line("Meta de ventas", 13, HAPPY_GOLD, true);
  space(1);
  line(
    p.dailyGoal
      ? `Hoy: ${fmtCOP(p.ventasHoy)} / ${fmtCOP(p.dailyGoal)} (${Math.round((p.ventasHoy / p.dailyGoal) * 100)}%)`
      : `Hoy: ${fmtCOP(p.ventasHoy)} (sin meta definida)`,
    9,
  );
  line(
    p.weeklyGoal
      ? `Semana: ${fmtCOP(p.ventasSemana)} / ${fmtCOP(p.weeklyGoal)} (${Math.round((p.ventasSemana / p.weeklyGoal) * 100)}%)`
      : `Semana: ${fmtCOP(p.ventasSemana)} (sin meta definida)`,
    9,
  );

  space(4);
  line("Aprovisionamiento del sitio hoy", 13, HAPPY_GOLD, true);
  space(1);
  for (const [label, t] of [
    ["Cocina", p.aprovisionamiento.cocina],
    ["Barra", p.aprovisionamiento.barra],
    ["Total general", p.aprovisionamiento.total],
  ] as const) {
    line(`${label}: Bajo ${t.bajo}/${t.total} · Medio ${t.medio}/${t.total} · Alto ${t.alto}/${t.total}`, 9);
  }

  space(4);
  line("Últimas actividades del equipo de hoy", 13, HAPPY_GOLD, true);
  space(1);
  if (p.actividad.length === 0) {
    line("Sin actividad reportada.", 9);
  } else {
    for (const a of p.actividad) {
      line(`${a.message} (${fmtHM(a.created_at)})`, 8.5);
    }
  }

  space(4);
  line("Ventas por mesa hoy", 13, HAPPY_GOLD, true);
  space(1);
  if (p.ventasPorMesa.length === 0) {
    line("Sin ventas registradas hoy.", 9);
  } else {
    for (const v of p.ventasPorMesa) {
      line(`Mesa ${v.mesa}: ${fmtCOP(v.total)} (${v.pedidos} pedido${v.pedidos === 1 ? "" : "s"})`, 9);
    }
  }

  doc.save(`resumen-happy-pub-${p.today}.pdf`);
}

export function exportResumenCsv(p: ResumenParams) {
  const rows: (string | number)[][] = [];
  rows.push(["Resumen del día", p.today]);
  rows.push([]);
  rows.push(["Personal en sitio hoy"]);
  rows.push(["Nombre", "Entrada", "Salida"]);
  for (const person of p.personalHoy) rows.push([person.name, fmtHM(person.entrada), fmtHM(person.salida)]);
  rows.push([]);
  rows.push(["Meta de ventas"]);
  rows.push(["Periodo", "Ventas", "Meta", "% cumplido"]);
  rows.push(["Hoy", p.ventasHoy, p.dailyGoal ?? "", p.dailyGoal ? Math.round((p.ventasHoy / p.dailyGoal) * 100) : ""]);
  rows.push(["Semana", p.ventasSemana, p.weeklyGoal ?? "", p.weeklyGoal ? Math.round((p.ventasSemana / p.weeklyGoal) * 100) : ""]);
  rows.push([]);
  rows.push(["Aprovisionamiento del sitio hoy"]);
  rows.push(["Grupo", "Bajo", "Medio", "Alto", "Total"]);
  rows.push(["Cocina", p.aprovisionamiento.cocina.bajo, p.aprovisionamiento.cocina.medio, p.aprovisionamiento.cocina.alto, p.aprovisionamiento.cocina.total]);
  rows.push(["Barra", p.aprovisionamiento.barra.bajo, p.aprovisionamiento.barra.medio, p.aprovisionamiento.barra.alto, p.aprovisionamiento.barra.total]);
  rows.push([
    "Total general",
    p.aprovisionamiento.total.bajo,
    p.aprovisionamiento.total.medio,
    p.aprovisionamiento.total.alto,
    p.aprovisionamiento.total.total,
  ]);
  rows.push([]);
  rows.push(["Últimas actividades del equipo de hoy"]);
  rows.push(["Mensaje", "Hora"]);
  for (const a of p.actividad) rows.push([a.message, fmtHM(a.created_at)]);
  rows.push([]);
  rows.push(["Ventas por mesa hoy"]);
  rows.push(["Mesa", "Total", "Pedidos"]);
  for (const v of p.ventasPorMesa) rows.push([v.mesa, v.total, v.pedidos]);

  const csv = rowsToCsvString(rows);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `resumen-happy-pub-${p.today}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
