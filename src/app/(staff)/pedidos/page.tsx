import { requireRole } from "@/lib/auth/current-user";
import { createClient } from "@/lib/supabase/server";
import { todayISO } from "@/lib/format";
import { logSupabaseError } from "@/lib/log-supabase-error";
import { PedidosClient } from "./PedidosClient";

export default async function PedidosPage() {
  await requireRole("jefe", "cocinero");
  const supabase = await createClient();
  const today = todayISO();

  const [{ data: orders, error: ordersError }, { data: users, error: usersError }] = await Promise.all([
    supabase
      .from("orders")
      .select("id, table_label, user_id, created_at, kitchen_ack_at, kitchen_ack_by")
      .gte("created_at", `${today}T00:00:00`)
      .lte("created_at", `${today}T23:59:59`)
      .order("created_at", { ascending: true }),
    supabase.from("users").select("id, name"),
  ]);
  logSupabaseError("PedidosPage ordersError", ordersError);
  logSupabaseError("PedidosPage usersError", usersError);

  const orderIds = (orders ?? []).map((o) => o.id);
  const { data: orderItems, error: orderItemsError } = orderIds.length
    ? await supabase.from("order_items").select("order_id, name, qty, note").in("order_id", orderIds)
    : { data: [], error: null };
  logSupabaseError("PedidosPage orderItemsError", orderItemsError);

  return (
    <PedidosClient
      initialOrders={orders ?? []}
      initialOrderItems={orderItems ?? []}
      users={users ?? []}
    />
  );
}
