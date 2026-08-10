import { requireRole } from "@/lib/auth/current-user";
import { createClient } from "@/lib/supabase/server";
import { todayISO } from "@/lib/format";
import { logSupabaseError } from "@/lib/log-supabase-error";
import { VencimientosClient } from "./VencimientosClient";

export default async function VencimientosPage() {
  await requireRole("jefe");
  const supabase = await createClient();

  const { data: bills, error } = await supabase.from("utility_bills").select("*").order("service_id");
  logSupabaseError("VencimientosPage bills", error);

  return <VencimientosClient today={todayISO()} bills={bills ?? []} />;
}
