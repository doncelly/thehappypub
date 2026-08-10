import { requireRole, roleOf } from "@/lib/auth/current-user";
import { createClient } from "@/lib/supabase/server";
import { todayISO } from "@/lib/format";
import { logSupabaseError } from "@/lib/log-supabase-error";
import { ChecklistClient } from "./ChecklistClient";

const BUCKET = "happy-pub-photos";

export default async function ChecklistPage() {
  const user = await requireRole("mesero", "cocinero");
  const supabase = await createClient();
  const today = todayISO();

  const [{ data: entries, error: entriesError }, { data: photos, error: photosError }] = await Promise.all([
    supabase.from("checklist_entries").select("*").eq("date", today).eq("user_id", user.id),
    supabase.from("checklist_photos").select("*").eq("date", today).eq("user_id", user.id),
  ]);
  logSupabaseError("ChecklistPage entries", entriesError);
  logSupabaseError("ChecklistPage photos", photosError);

  // Bucket privado: hay que firmar cada foto para poder mostrarla.
  const photoUrls: Record<string, string> = {};
  for (const p of photos ?? []) {
    const { data: signed } = await supabase.storage.from(BUCKET).createSignedUrl(p.storage_path, 3600);
    if (signed) photoUrls[p.section] = signed.signedUrl;
  }

  return <ChecklistClient date={today} userId={user.id} role={roleOf(user)} entries={entries ?? []} photoUrls={photoUrls} />;
}
