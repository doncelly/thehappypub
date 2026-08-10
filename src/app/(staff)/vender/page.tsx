import { requireRole, roleOf } from "@/lib/auth/current-user";
import { createClient } from "@/lib/supabase/server";
import { todayISO, minutesAgoISO } from "@/lib/format";
import { logSupabaseError } from "@/lib/log-supabase-error";
import { VenderClient } from "./VenderClient";

const MESA_TIMEOUT_MIN = 20;

export default async function VenderPage() {
  const user = await requireRole("jefe", "mesero");
  const supabase = await createClient();
  const today = todayISO();
  const lockCutoff = minutesAgoISO(MESA_TIMEOUT_MIN);

  const [
    { data: menuCategories, error: menuCategoriesError },
    { data: menuItems, error: menuItemsError },
    { data: tables, error: tablesError },
    { data: locks, error: locksError },
    { data: pairWatches, error: pairsError },
    { data: agendaDay, error: agendaError },
    { data: ordersToday, error: ordersError },
    { data: users, error: usersError },
    { data: ingredientLinks, error: ingredientLinksError },
  ] = await Promise.all([
    supabase.from("menu_categories").select("id, label, sort_order").order("sort_order"),
    supabase.from("menu_items").select("id, name, price, category").eq("active", true).order("name"),
    supabase.from("restaurant_tables").select("id, sort_order").order("sort_order"),
    supabase.from("table_locks").select("table_label, user_id, locked_at").gte("locked_at", lockCutoff),
    supabase.from("pair_watches").select("id, label, item_a, item_b, sort_order").order("sort_order"),
    supabase.from("agenda_days").select("discount_pct, discount_category").eq("date", today).maybeSingle(),
    supabase.from("orders").select("id, table_label, total, created_at, user_id").gte("created_at", `${today}T00:00:00`).lte("created_at", `${today}T23:59:59`).order("created_at", { ascending: false }),
    supabase.from("users").select("id, name"),
    supabase.from("menu_item_ingredients").select("menu_item_id"),
  ]);

  for (const [label, error] of Object.entries({
    menuCategoriesError,
    menuItemsError,
    tablesError,
    locksError,
    pairsError,
    agendaError,
    ordersError,
    usersError,
    ingredientLinksError,
  })) {
    logSupabaseError(`VenderPage ${label}`, error);
  }

  const pairItemIds = [...new Set((pairWatches ?? []).flatMap((p) => [p.item_a, p.item_b]))];
  const { data: pairItems, error: pairItemsError } = pairItemIds.length
    ? await supabase.from("items").select("id, name, item_status(qty)").in("id", pairItemIds)
    : { data: [], error: null };
  logSupabaseError("VenderPage pairItemsError", pairItemsError);

  const orderIds = (ordersToday ?? []).map((o) => o.id);
  const { data: orderItems, error: orderItemsError } = orderIds.length
    ? await supabase.from("order_items").select("order_id, name, qty, note").in("order_id", orderIds)
    : { data: [], error: null };
  logSupabaseError("VenderPage orderItemsError", orderItemsError);

  return (
    <VenderClient
      currentUserId={user.id}
      currentUserRole={roleOf(user)}
      menuCategories={menuCategories ?? []}
      menuItems={menuItems ?? []}
      tables={tables ?? []}
      initialLocks={locks ?? []}
      pairWatches={pairWatches ?? []}
      initialPairItems={(pairItems ?? []) as never}
      discountPct={agendaDay?.discount_pct ?? null}
      discountCategory={agendaDay?.discount_category ?? null}
      initialOrders={ordersToday ?? []}
      initialOrderItems={orderItems ?? []}
      users={users ?? []}
      itemsWithRecipe={[...new Set((ingredientLinks ?? []).map((r) => r.menu_item_id))]}
    />
  );
}
