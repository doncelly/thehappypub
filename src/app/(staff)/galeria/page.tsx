import { requireRole } from "@/lib/auth/current-user";
import { createClient } from "@/lib/supabase/server";
import { fmtDateLabel, fmtRelTime } from "@/lib/format";
import { logSupabaseError } from "@/lib/log-supabase-error";
import { GaleriaClient, type GaleriaItem } from "./GaleriaClient";

const BUCKET = "happy-pub-photos";
const SECTION_LABELS: Record<string, string> = {
  alistamiento: "Alistamiento",
  inventario: "Inventario",
  apertura: "Apertura",
  cierre: "Cierre",
};

export default async function GaleriaPage() {
  await requireRole("jefe");
  const supabase = await createClient();

  const [
    { data: deliveries, error: deliveriesError },
    { data: checklistPhotos, error: checklistError },
    { data: items, error: itemsError },
    { data: users, error: usersError },
  ] = await Promise.all([
    supabase.from("deliveries").select("item_id, photo_producto_path, photo_factura_path, user_id, created_at").order("created_at", { ascending: false }).limit(60),
    supabase.from("checklist_photos").select("date, user_id, section, storage_path, uploaded_at").order("uploaded_at", { ascending: false }).limit(60),
    supabase.from("items").select("id, name"),
    supabase.from("users").select("id, name"),
  ]);

  for (const [label, error] of Object.entries({ deliveriesError, checklistError, itemsError, usersError })) {
    logSupabaseError(`GaleriaPage ${label}`, error);
  }

  const itemNameById = Object.fromEntries((items ?? []).map((it) => [it.id, it.name]));
  const usersById = Object.fromEntries((users ?? []).map((u) => [u.id, u.name]));

  // galeriaItems() del original: recibidos (producto + factura por separado) +
  // fotos de checklist, todo mezclado y ordenado por fecha.
  const rawItems: (GaleriaItem & { at: string })[] = [];

  for (const d of deliveries ?? []) {
    const name = itemNameById[d.item_id] ?? d.item_id;
    const meta = `${usersById[d.user_id] ?? "—"} · ${fmtRelTime(d.created_at)}`;
    if (d.photo_producto_path) rawItems.push({ path: d.photo_producto_path, title: `${name} (producto)`, meta, cat: "recibidos", at: d.created_at });
    if (d.photo_factura_path) rawItems.push({ path: d.photo_factura_path, title: `${name} (factura)`, meta, cat: "recibidos", at: d.created_at });
  }
  for (const p of checklistPhotos ?? []) {
    rawItems.push({
      path: p.storage_path,
      title: `${SECTION_LABELS[p.section] ?? p.section} — ${usersById[p.user_id] ?? "—"}`,
      meta: fmtDateLabel(p.date),
      cat: "checklist",
      at: p.uploaded_at,
    });
  }
  rawItems.sort((a, b) => (a.at < b.at ? 1 : -1));

  const photoUrls: Record<string, string> = {};
  for (const it of rawItems) {
    if (photoUrls[it.path]) continue;
    const { data: signed } = await supabase.storage.from(BUCKET).createSignedUrl(it.path, 3600);
    if (signed) photoUrls[it.path] = signed.signedUrl;
  }

  return <GaleriaClient items={rawItems} photoUrls={photoUrls} />;
}
