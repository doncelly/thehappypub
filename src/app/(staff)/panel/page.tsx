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
  })) {
    logSupabaseError(`PanelPage ${label}`, error);
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
    />
  );
}
