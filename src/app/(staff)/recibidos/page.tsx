import { requireUser, roleOf } from "@/lib/auth/current-user";
import { createClient } from "@/lib/supabase/server";
import { logSupabaseError } from "@/lib/log-supabase-error";
import { RecibidosClient } from "./RecibidosClient";

const BUCKET = "happy-pub-photos";

export default async function RecibidosPage() {
  const user = await requireUser();
  const role = roleOf(user);
  const supabase = await createClient();

  let categoriesQuery = supabase.from("categories").select("id, label, domain, sort_order").order("sort_order");
  if (role === "mesero") categoriesQuery = categoriesQuery.eq("domain", "mesas");
  if (role === "cocinero") categoriesQuery = categoriesQuery.eq("domain", "cocina");

  const [
    { data: categories, error: categoriesError },
    { data: items, error: itemsError },
    { data: deliveries, error: deliveriesError },
    { data: purchaseOrders, error: purchaseOrdersError },
    { data: users, error: usersError },
  ] = await Promise.all([
    categoriesQuery,
    supabase.from("items").select("id, name, unit, category").eq("mode", "qty").order("name"),
    supabase.from("deliveries").select("*").order("created_at", { ascending: false }).limit(30),
    supabase.from("purchase_orders").select("*").eq("status", "pendiente").order("ordered_at", { ascending: false }),
    supabase.from("users").select("id, name"),
  ]);

  for (const [label, error] of Object.entries({ categoriesError, itemsError, deliveriesError, purchaseOrdersError, usersError })) {
    logSupabaseError(`RecibidosPage ${label}`, error);
  }

  const photoUrls: Record<string, string> = {};
  for (const d of deliveries ?? []) {
    for (const path of [d.photo_producto_path, d.photo_factura_path]) {
      if (!path) continue;
      const { data: signed } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600);
      if (signed) photoUrls[path] = signed.signedUrl;
    }
  }

  return (
    <RecibidosClient
      role={role}
      categories={categories ?? []}
      items={items ?? []}
      deliveries={deliveries ?? []}
      photoUrls={photoUrls}
      purchaseOrders={purchaseOrders ?? []}
      users={users ?? []}
    />
  );
}
