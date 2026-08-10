import { requireRole } from "@/lib/auth/current-user";
import { createClient } from "@/lib/supabase/server";
import { logSupabaseError } from "@/lib/log-supabase-error";
import { PersonalClient } from "./PersonalClient";

export default async function PersonalPage() {
  await requireRole("jefe");
  const supabase = await createClient();

  const [
    { data: users, error: usersError },
    { data: rates, error: ratesError },
    { data: geofence, error: geoError },
  ] = await Promise.all([
    supabase.from("users").select("id, name, role, subrole, active").order("name"),
    supabase.from("hourly_rates").select("*").eq("id", 1).maybeSingle(),
    supabase.from("geofence_settings").select("*").eq("id", 1).maybeSingle(),
  ]);

  logSupabaseError("PersonalPage users", usersError);
  logSupabaseError("PersonalPage rates", ratesError);
  logSupabaseError("PersonalPage geofence", geoError);

  return <PersonalClient users={users ?? []} rates={rates} geofence={geofence} />;
}
