import { requireUser, roleOf } from "@/lib/auth/current-user";
import { createClient } from "@/lib/supabase/server";
import { logSupabaseError } from "@/lib/log-supabase-error";
import { PerdidasClient } from "./PerdidasClient";

export default async function PerdidasPage() {
  const user = await requireUser();
  const role = roleOf(user);
  const supabase = await createClient();

  let categoriesQuery = supabase.from("categories").select("id, label, domain, sort_order").order("sort_order");
  if (role === "mesero") categoriesQuery = categoriesQuery.eq("domain", "mesas");
  if (role === "cocinero") categoriesQuery = categoriesQuery.eq("domain", "cocina");

  const [
    { data: categories, error: categoriesError },
    { data: items, error: itemsError },
    { data: losses, error: lossesError },
    { data: users, error: usersError },
  ] = await Promise.all([
    categoriesQuery,
    supabase.from("items").select("id, name, unit, category").eq("mode", "qty").order("name"),
    supabase.from("losses").select("*").order("created_at", { ascending: false }).limit(60),
    supabase.from("users").select("id, name"),
  ]);

  for (const [label, error] of Object.entries({ categoriesError, itemsError, lossesError, usersError })) {
    logSupabaseError(`PerdidasPage ${label}`, error);
  }

  return <PerdidasClient categories={categories ?? []} items={items ?? []} losses={losses ?? []} users={users ?? []} />;
}
