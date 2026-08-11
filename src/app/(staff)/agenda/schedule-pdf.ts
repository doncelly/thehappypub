"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import autoTable from "jspdf-autotable";
import { fmtDateLabel, weekDates, todayISO, bogotaDayRangeUTC, bogotaDateOf, fmtCOP } from "@/lib/format";
import { createReportDoc, HAPPY_GOLD, GRAY, BRAND_TEXT, BRAND_NAVY, MARGIN_X } from "@/lib/pdf";

const BUCKET = "happy-pub-photos";

// Genera el PDF de horarios de la semana (turnos reales ya asignados en
// Agenda, no la plantilla) y lo guarda en Storage para que jefe, mesero y
// cocinero lo puedan descargar desde Mi día — reemplaza mandar el Excel por
// aparte cada semana.
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Database=any hasta correr `npm run supabase:types`
export async function generateAndSaveSchedulePdf(supabase: SupabaseClient<any>, monday: string): Promise<{ error: string | null }> {
  const days = weekDates(monday);
  const sunday = days[6];
  const today = todayISO();
  const weekRange = bogotaDayRangeUTC(monday);
  const weekEnd = bogotaDayRangeUTC(sunday);

  const [{ data: agendaDays }, { data: shifts }, { data: orders }] = await Promise.all([
    supabase.from("agenda_days").select("*").in("date", days),
    supabase.from("shifts").select("*").in("date", days).order("created_at"),
    supabase.from("orders").select("total, created_at").gte("created_at", weekRange.start).lte("created_at", weekEnd.end),
  ]);

  const agendaByDate = Object.fromEntries((agendaDays ?? []).map((a) => [a.date, a]));
  const ventasByDate: Record<string, number> = {};
  for (const o of orders ?? []) {
    const d = bogotaDateOf(o.created_at);
    ventasByDate[d] = (ventasByDate[d] ?? 0) + o.total;
  }

  const { doc, line, space, getY, setY, ensureSpace } = await createReportDoc("Horario de la semana");
  const pageW = doc.internal.pageSize.getWidth();
  line(`${fmtDateLabel(monday)}  al  ${fmtDateLabel(sunday)}`, 10, GRAY);
  space(4);

  for (const d of days) {
    const a = agendaByDate[d];
    ensureSpace(20);
    line(fmtDateLabel(d), 13, HAPPY_GOLD, true);

    const opParts: string[] = [];
    if (a?.start_time) opParts.push(`Inicio: ${a.start_time.slice(0, 5)}`);
    if (a?.shift_admin) opParts.push(`Admin: ${a.shift_admin}`);
    if (a?.daily_goal) opParts.push(`Meta: $${Math.round(Number(a.daily_goal)).toLocaleString("es-CO")}`);
    line(opParts.length ? opParts.join("   ·   ") : "Sin datos de operación cargados para este día.", 9);
    if (a?.promo && a.promo !== "NA") line(`Promo: ${a.promo}`, 8.5, GRAY);
    if (a?.event && a.event !== "NA") line(`Evento: ${a.event}`, 8.5, GRAY);

    // Resumen de ventas — solo para días que ya pasaron (o es hoy); un día
    // futuro todavía no tiene nada que resumir. Se dibuja como una franja de
    // color en vez de una línea de texto más, para que resalte del resto.
    if (d <= today) {
      const ventas = ventasByDate[d] ?? 0;
      const goal = a?.daily_goal ? Number(a.daily_goal) : null;
      const cumplido = goal ? ventas >= goal : null;
      const resumen = goal
        ? `Ventas: ${fmtCOP(ventas)}   ·   Cumplimiento: ${Math.round((ventas / goal) * 100)}%${cumplido ? "  ✓ Meta cumplida" : ""}`
        : `Ventas: ${fmtCOP(ventas)} (sin meta definida ese día)`;
      space(1);
      ensureSpace(11);
      const boxY = getY() - 3;
      const fillColor: [number, number, number] = cumplido === false ? [230, 230, 230] : [250, 240, 210];
      doc.setFillColor(...fillColor);
      doc.roundedRect(MARGIN_X, boxY, pageW - MARGIN_X * 2, 7, 1.5, 1.5, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(...BRAND_TEXT);
      doc.text(resumen, MARGIN_X + 2, boxY + 5);
      setY(boxY + 10);
    }

    const dayShifts = (shifts ?? []).filter((s) => s.date === d);
    if (dayShifts.length === 0) {
      line("Sin turnos asignados todavía.", 8.5, GRAY);
    } else {
      const rows = dayShifts.map((s) => [
        s.shift_type === "cocina" ? "Cocina" : "Mesas",
        s.person_name + (s.area ? ` (${s.area})` : ""),
        s.schedule_label || "—",
        s.cleaning_task || "—",
      ]);
      ensureSpace(16); // encabezado + al menos una fila, si no cabe pasa de página antes de empezar la tabla
      autoTable(doc, {
        startY: getY() + 1,
        margin: { left: MARGIN_X, right: MARGIN_X },
        head: [["Turno", "Persona", "Horario", "Aseo"]],
        body: rows,
        theme: "grid",
        styles: { fontSize: 8, cellPadding: 1.8, textColor: BRAND_TEXT, lineColor: [220, 220, 225] },
        headStyles: { fillColor: BRAND_NAVY, textColor: [255, 255, 255], fontStyle: "bold" },
        alternateRowStyles: { fillColor: [246, 247, 251] },
        columnStyles: { 0: { cellWidth: 20 } },
      });
      setY((doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 4);
    }
    space(3);
  }

  const blob = doc.output("blob");
  const path = `agenda-schedules/${monday}.pdf`;
  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, blob, { upsert: true, contentType: "application/pdf" });
  if (uploadError) return { error: uploadError.message };

  return { error: null };
}
