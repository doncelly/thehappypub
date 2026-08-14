import { requireRole } from "@/lib/auth/current-user";
import { createClient } from "@/lib/supabase/server";
import { todayISO, mondayOf, weekDates, bogotaDayRangeUTC } from "@/lib/format";
import { logSupabaseError } from "@/lib/log-supabase-error";
import { PanelClient } from "./PanelClient";

// Segundo módulo migrado (Paso 4), solo-jefe. Todas las consultas resuelven
// nombres vía un mapa usersById en vez de embeds anidados de PostgREST —
// aprendimos en Inventario que esos embeds son el punto más frágil.
export default async function PanelPage() {
  const user = await requireRole("jefe");
  const supabase = await createClient();

  const today = todayISO();
  const monday = mondayOf(today);
  const days = weekDates(monday);
  const sunday = days[6];
  const weekRange = { start: bogotaDayRangeUTC(monday).start, end: bogotaDayRangeUTC(sunday).end };
  const monthStart = `${today.slice(0, 7)}-01`;
  const monthRange = { start: bogotaDayRangeUTC(monthStart).start, end: bogotaDayRangeUTC(today).end };
  const yesterdayDate = new Date(`${today}T12:00:00`);
  yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  const yesterday = yesterdayDate.toISOString().slice(0, 10);
  const yesterdayRange = bogotaDayRangeUTC(yesterday);

  const [
    { data: categories, error: categoriesError },
    { data: items, error: itemsError },
    { data: attendanceToday, error: attendanceError },
    { data: agendaDay, error: agendaError },
    { data: weeklyGoal, error: weeklyGoalError },
    { data: ordersWeek, error: ordersError },
    { data: pairWatches, error: pairsError },
    { data: stockHistoryWeek, error: stockError },
    { data: shiftsToday, error: shiftsError },
    { data: checklistToday, error: checklistError },
    { data: activity, error: activityError },
    { data: users, error: usersError },
    { data: monthlyGoal, error: monthlyGoalError },
    { data: ordersMonth, error: ordersMonthError },
    { data: cashRegisterYesterday, error: cashYesterdayError },
    { data: ordersYesterday, error: ordersYesterdayError },
  ] = await Promise.all([
    supabase.from("categories").select("id, label, domain, sort_order").order("sort_order"),
    supabase
      .from("items")
      .select("id, name, category, mode, unit, step, min, item_status(status_gauge, qty, updated_at, updated_by)")
      .order("name"),
    supabase.from("attendance").select("user_id, work_type, check_in, check_out").eq("date", today),
    supabase.from("agenda_days").select("date, daily_goal").eq("date", today).maybeSingle(),
    supabase.from("weekly_goals").select("week_monday, goal").eq("week_monday", monday).maybeSingle(),
    supabase
      .from("orders")
      .select("id, table_label, total, created_at, user_id")
      .gte("created_at", weekRange.start)
      .lte("created_at", weekRange.end)
      .order("created_at", { ascending: false }),
    supabase.from("pair_watches").select("id, label, item_a, item_b, sort_order").order("sort_order"),
    supabase.from("stock_history").select("item_id, date, qty").gte("date", monday).lte("date", sunday),
    supabase
      .from("shifts")
      .select("id, person_name, user_id, area, schedule_label, shift_type, cleaning_task, done")
      .eq("date", today),
    supabase.from("checklist_entries").select("user_id, section, done, areas").eq("date", today),
    supabase.from("activity_log").select("id, message, color, created_at").order("created_at", { ascending: false }).limit(15),
    supabase.from("users").select("id, name"),
    supabase.from("monthly_goal_settings").select("min_goal").eq("id", 1).maybeSingle(),
    supabase.from("orders").select("total").gte("created_at", monthRange.start).lte("created_at", monthRange.end),
    supabase.from("cash_register").select("cash_amount, card_amount, other_payment_amount, close_time").eq("date", yesterday).maybeSingle(),
    supabase.from("orders").select("total").gte("created_at", yesterdayRange.start).lte("created_at", yesterdayRange.end),
  ]);

  for (const [label, error] of Object.entries({
    categoriesError,
    itemsError,
    attendanceError,
    agendaError,
    weeklyGoalError,
    ordersError,
    pairsError,
    stockError,
    shiftsError,
    checklistError,
    activityError,
    usersError,
    monthlyGoalError,
    ordersMonthError,
    cashYesterdayError,
    ordersYesterdayError,
  })) {
    logSupabaseError(`PanelPage ${label}`, error);
  }

  const cajaAyerDiferencia =
    cashRegisterYesterday?.cash_amount != null
      ? Number(cashRegisterYesterday.cash_amount) +
        Number(cashRegisterYesterday.card_amount ?? 0) +
        Number(cashRegisterYesterday.other_payment_amount ?? 0) -
        (ordersYesterday ?? []).reduce((s, o) => s + o.total, 0)
      : null;

  // Punto 13 del backlog: reportes semanales guardados en Storage,
  // agrupados por año — se listan directo del bucket (nombre = fecha del
  // reporte) en vez de llevar una tabla aparte, ya que schedule-pdf.ts hace
  // lo mismo para el horario semanal.
  const { data: weeklyReportFiles } = await supabase.storage
    .from("happy-pub-photos")
    .list("weekly-reports", { limit: 1000, sortBy: { column: "name", order: "desc" } });

  const reportsByYear: Record<string, { date: string; url: string }[]> = {};
  for (const f of weeklyReportFiles ?? []) {
    const m = f.name.match(/^(\d{4})-\d{2}-\d{2}\.pdf$/);
    if (!m) continue;
    const { data: signed } = await supabase.storage.from("happy-pub-photos").createSignedUrl(`weekly-reports/${f.name}`, 3600);
    if (!signed) continue;
    (reportsByYear[m[1]] ??= []).push({ date: f.name.replace(".pdf", ""), url: signed.signedUrl });
  }

  return (
    <PanelClient
      today={today}
      monday={monday}
      weekDays={days}
      categories={categories ?? []}
      initialItems={(items ?? []) as never}
      initialAttendance={attendanceToday ?? []}
      dailyGoal={agendaDay?.daily_goal ?? null}
      weeklyGoal={weeklyGoal?.goal ?? null}
      initialOrders={ordersWeek ?? []}
      pairWatches={pairWatches ?? []}
      stockHistoryWeek={stockHistoryWeek ?? []}
      shiftsToday={shiftsToday ?? []}
      checklistToday={checklistToday ?? []}
      initialActivity={activity ?? []}
      users={users ?? []}
      currentUserName={user.name}
      monthlyGoal={monthlyGoal?.min_goal ?? null}
      ventasMes={(ordersMonth ?? []).reduce((s, o) => s + o.total, 0)}
      cajaAyerDiferencia={cajaAyerDiferencia}
      reportsByYear={reportsByYear}
    />
  );
}
