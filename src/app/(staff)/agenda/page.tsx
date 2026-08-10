import { requireRole } from "@/lib/auth/current-user";
import { createClient } from "@/lib/supabase/server";
import { todayISO, mondayOf } from "@/lib/format";
import { logSupabaseError } from "@/lib/log-supabase-error";
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
  ] = await Promise.all([
    supabase.from("agenda_days").select("*").eq("date", date).maybeSingle(),
    supabase.from("weekly_goals").select("*").eq("week_monday", monday).maybeSingle(),
    supabase.from("shifts").select("*").eq("date", date).order("created_at"),
    supabase.from("attendance").select("*").eq("date", date),
    supabase.from("bonuses").select("*").eq("date", date),
    supabase.from("default_weekday_tasks").select("*"),
    supabase.from("menu_categories").select("id, label, sort_order").order("sort_order"),
    supabase.from("users").select("id, name, active, role, subrole"),
    supabase.from("orders").select("total").gte("created_at", `${date}T00:00:00`).lte("created_at", `${date}T23:59:59`),
    supabase.from("orders").select("total").gte("created_at", `${yesterday}T00:00:00`).lte("created_at", `${yesterday}T23:59:59`),
    supabase.from("service_ratings").select("user_id, rating").gte("created_at", `${date}T00:00:00`).lte("created_at", `${date}T23:59:59`),
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
  })) {
    logSupabaseError(`AgendaPage ${label}`, error);
  }

  return (
    <AgendaClient
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
    />
  );
}
