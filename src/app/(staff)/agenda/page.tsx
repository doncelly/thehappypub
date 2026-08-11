import { requireRole } from "@/lib/auth/current-user";
import { createClient } from "@/lib/supabase/server";
import { todayISO, mondayOf, weekDates, bogotaDayRangeUTC, bogotaDateOf } from "@/lib/format";
import { logSupabaseError } from "@/lib/log-supabase-error";
import { computeAutoPuntualidadPuntos, computeAutoVentasPuntos } from "@/lib/bonos";
import { AgendaClient } from "./AgendaClient";

function isValidISODate(s: string | undefined): s is string {
  return !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function prevDay(iso: string): string {
  const d = new Date(iso + "T12:00:00");
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

// Módulo más grande hasta ahora, solo-jefe. La fecha se maneja por ?date= en la
// URL (en vez de estado de cliente) para que cada día sea una carga real del
// servidor, igual de simple que el resto de la app.
export default async function AgendaPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const user = await requireRole("jefe");
  const { date: dateParam } = await searchParams;
  const date = isValidISODate(dateParam) ? dateParam : todayISO();
  const monday = mondayOf(date);
  const yesterday = prevDay(date);

  const supabase = await createClient();
  const dateRange = bogotaDayRangeUTC(date);
  const yesterdayRange = bogotaDayRangeUTC(yesterday);
  const weekDays = weekDates(monday);

  const [
    { data: agendaDay, error: agendaError },
    { data: weeklyGoal, error: weeklyGoalError },
    { data: shifts, error: shiftsError },
    { data: attendance, error: attendanceError },
    { data: bonuses, error: bonusesError },
    { data: defaultTasks, error: defaultTasksError },
    { data: menuCategories, error: menuCategoriesError },
    { data: users, error: usersError },
    { data: ordersToday, error: ordersTodayError },
    { data: ordersYesterday, error: ordersYesterdayError },
    { data: serviceRatings, error: serviceRatingsError },
    { data: weekdayTemplates, error: weekdayTemplatesError },
    { data: shiftScheduleTemplates, error: shiftScheduleTemplatesError },
    { data: weekShifts, error: weekShiftsError },
    { data: weekAttendance, error: weekAttendanceError },
    { data: weekAgendaDays, error: weekAgendaDaysError },
    { data: weekOrders, error: weekOrdersError },
  ] = await Promise.all([
    supabase.from("agenda_days").select("*").eq("date", date).maybeSingle(),
    supabase.from("weekly_goals").select("*").eq("week_monday", monday).maybeSingle(),
    supabase.from("shifts").select("*").eq("date", date).order("created_at"),
    supabase.from("attendance").select("*").eq("date", date),
    supabase.from("bonuses").select("*").eq("date", date),
    supabase.from("default_weekday_tasks").select("*"),
    supabase.from("menu_categories").select("id, label, sort_order").order("sort_order"),
    supabase.from("users").select("id, name, active, role, subrole"),
    supabase.from("orders").select("total").gte("created_at", dateRange.start).lte("created_at", dateRange.end),
    supabase.from("orders").select("total").gte("created_at", yesterdayRange.start).lte("created_at", yesterdayRange.end),
    supabase.from("service_ratings").select("user_id, rating").gte("created_at", dateRange.start).lte("created_at", dateRange.end),
    supabase.from("weekday_templates").select("*"),
    supabase.from("shift_schedule_templates").select("*").order("sort_order"),
    supabase.from("shifts").select("date, person_name, user_id, schedule_label").in("date", weekDays),
    supabase.from("attendance").select("date, user_id, check_in").in("date", weekDays),
    supabase.from("agenda_days").select("date, daily_goal").in("date", weekDays),
    supabase.from("orders").select("total, created_at").gte("created_at", bogotaDayRangeUTC(monday).start).lte("created_at", bogotaDayRangeUTC(weekDays[6]).end),
  ]);

  for (const [label, error] of Object.entries({
    agendaError,
    weeklyGoalError,
    shiftsError,
    attendanceError,
    bonusesError,
    defaultTasksError,
    menuCategoriesError,
    usersError,
    ordersTodayError,
    ordersYesterdayError,
    serviceRatingsError,
    weekdayTemplatesError,
    shiftScheduleTemplatesError,
    weekShiftsError,
    weekAttendanceError,
    weekAgendaDaysError,
    weekOrdersError,
  })) {
    logSupabaseError(`AgendaPage ${label}`, error);
  }

  // Meta semanal de puntualidad (punto 14 del backlog): 5/3/0 puntos por día
  // según hora de llegada vs. shifts.schedule_label, sumados lunes-domingo.
  const weeklyPuntualidadByUser: Record<string, number> = {};
  for (const d of weekDays) {
    const dayAttendance = (weekAttendance ?? []).filter((a) => a.date === d);
    for (const t of (weekShifts ?? []).filter((s) => s.date === d)) {
      const uid = t.user_id ?? (users ?? []).find((u) => u.name.trim().toLowerCase() === t.person_name.trim().toLowerCase())?.id;
      if (!uid) continue;
      const checkIn = dayAttendance.find((a) => a.user_id === uid)?.check_in ?? null;
      const pts = computeAutoPuntualidadPuntos(t.schedule_label, checkIn);
      if (pts !== null) weeklyPuntualidadByUser[uid] = (weeklyPuntualidadByUser[uid] ?? 0) + pts;
    }
  }

  // Puntos semanales de ventas (punto 15 del backlog): mismo dato de equipo
  // completo que ya usaba el check ✓/✗ de "Ventas" (no es venta atribuida
  // por mesero) — a quien tuvo turno ese día se le suman los puntos del día.
  const goalByWeekDate = Object.fromEntries((weekAgendaDays ?? []).map((a) => [a.date, a.daily_goal]));
  const ventasByWeekDate: Record<string, number> = {};
  for (const o of weekOrders ?? []) {
    const d = bogotaDateOf(o.created_at);
    ventasByWeekDate[d] = (ventasByWeekDate[d] ?? 0) + o.total;
  }
  const weeklyVentasByUser: Record<string, number> = {};
  for (const d of weekDays) {
    const pts = computeAutoVentasPuntos(goalByWeekDate[d] ?? null, ventasByWeekDate[d] ?? 0);
    if (pts === null) continue;
    for (const t of (weekShifts ?? []).filter((s) => s.date === d)) {
      const uid = t.user_id ?? (users ?? []).find((u) => u.name.trim().toLowerCase() === t.person_name.trim().toLowerCase())?.id;
      if (!uid) continue;
      weeklyVentasByUser[uid] = (weeklyVentasByUser[uid] ?? 0) + pts;
    }
  }

  return (
    <AgendaClient
      key={date}
      date={date}
      currentUserName={user.name}
      agendaDay={agendaDay}
      weeklyGoal={weeklyGoal}
      shifts={shifts ?? []}
      attendance={attendance ?? []}
      bonuses={bonuses ?? []}
      defaultTasks={defaultTasks ?? []}
      menuCategories={menuCategories ?? []}
      users={users ?? []}
      ventasHoy={(ordersToday ?? []).reduce((s, o) => s + o.total, 0)}
      ventasAyer={(ordersYesterday ?? []).reduce((s, o) => s + o.total, 0)}
      serviceRatings={serviceRatings ?? []}
      weekdayTemplates={weekdayTemplates ?? []}
      shiftScheduleTemplates={shiftScheduleTemplates ?? []}
      weeklyPuntualidadByUser={weeklyPuntualidadByUser}
      weeklyVentasByUser={weeklyVentasByUser}
    />
  );
}
