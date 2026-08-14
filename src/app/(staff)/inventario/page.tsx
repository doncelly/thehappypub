import { createClient } from "@/lib/supabase/server";
import { getCurrentAppUser, roleOf } from "@/lib/auth/current-user";
import { logSupabaseError } from "@/lib/log-supabase-error";
import { InventarioClient, type CategoryRow, type RawItemRow } from "./InventarioClient";

// Primer módulo migrado (Paso 4). Carga inicial server-side ya filtrada por
// dominio de rol (RLS lo hace cumplir igual en el cliente, esto es solo para no
// pedir de más) — la interactividad y Realtime viven en InventarioClient.
export default async function InventarioPage() {
  const user = await getCurrentAppUser();
  const role = user ? roleOf(user) : "mesero";
  const supabase = await createClient();

  let categoriesQuery = supabase
    .from("categories")
    .select("id, label, domain, sort_order")
    .order("sort_order");
  if (role === "mesero") categoriesQuery = categoriesQuery.eq("domain", "mesas");
  if (role === "cocinero") categoriesQuery = categoriesQuery.eq("domain", "cocina");
  const { data: categories, error: categoriesError } = await categoriesQuery;
  logSupabaseError("InventarioPage categories", categoriesError);

  const categoryIds = (categories ?? []).map((c) => c.id);

  // Embed simple de un solo nivel (items -> item_status) — el nombre de quien
  // reportó se resuelve aparte con usersById, tanto acá como en cada evento de
  // Realtime, para no depender de un embed doblemente anidado (items -> item_status
  // -> users) que es más frágil de que PostgREST lo resuelva bien.
  const { data: items, error: itemsError } = await supabase
    .from("items")
    .select("id, name, category, mode, unit, step, min, gauge_capacity_ml, item_status(status_gauge, qty, updated_at, updated_by)")
    .in("category", categoryIds)
    .order("name");
  logSupabaseError("InventarioPage items", itemsError);

  const { data: users, error: usersError } = await supabase.from("users").select("id, name");
  logSupabaseError("InventarioPage users", usersError);
  const usersById = Object.fromEntries((users ?? []).map((u) => [u.id, u.name]));

  return (
    <InventarioClient
      categories={(categories ?? []) as CategoryRow[]}
      initialItems={(items ?? []) as unknown as RawItemRow[]}
      usersById={usersById}
      currentUserName={user?.name ?? ""}
    />
  );
}
