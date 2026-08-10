import { requireRole } from "@/lib/auth/current-user";
import { createClient } from "@/lib/supabase/server";
import { todayISO, quincenaRange } from "@/lib/format";
import { logSupabaseError } from "@/lib/log-supabase-error";
import { MiDiaClient } from "./MiDiaClient";

export default async function MiDiaPage() {
  const user = await requireRole("jefe", "mesero", "cocinero");
  const supabase = await createClient();
  const today = todayISO();
  const quincena = quincenaRange();

  const [
    { data: agendaDay, error: agendaError },
    { data: ordersToday, error: ordersError },
    { data: myAttendanceToday, error: attTodayError },
    { data: myAttendanceQuincena, error: attQuincenaError },
    { data: geofence, error: geoError },
    { data: rates, error: ratesError },
    { data: shiftsToday, error: shiftsError },
    { data: myBonus, error: bonusError },
  ] = await Promise.all([
    supabase.from("agenda_days").select("promo, event, daily_goal").eq("date", today).maybeSingle(),
    supabase.from("orders").select("total").gte("created_at", `${today}T00:00:00`).lte("created_at", `${today}T23:59:59`),
    supabase.from("attendance").select("*").eq("user_id", user.id).eq("date", today),
    supabase.from("attendance").select("date, work_type, check_in, check_out").eq("user_id", user.id).gte("date", quincena.start).lte("date", quincena.end),
    supabase.from("geofence_settings").select("*").eq("id", 1).maybeSingle(),
    supabase.from("hourly_rates").select("*").eq("id", 1).maybeSingle(),
    supabase.from("shifts").select("*").eq("date", today),
    supabase.from("bonuses").select("*").eq("date", today).eq("user_id", user.id).maybeSingle(),
  ]);

  for (const [label, error] of Object.entries({
    agendaError,
    ordersError,
    attTodayError,
    attQuincenaError,
    geoError,
    ratesError,
    shiftsError,
    bonusError,
  })) {
    logSupabaseError(`MiDiaPage ${label}`, error);
  }

  return (
    <MiDiaClient
      date={today}
      user={user}
      agendaDay={agendaDay}
      ventasHoy={(ordersToday ?? []).reduce((s, o) => s + o.total, 0)}
      myAttendanceToday={myAttendanceToday ?? []}
      myAttendanceQuincena={myAttendanceQuincena ?? []}
      geofence={geofence}
      rates={rates}
      shiftsToday={shiftsToday ?? []}
      myBonus={myBonus}
    />
  );
}
