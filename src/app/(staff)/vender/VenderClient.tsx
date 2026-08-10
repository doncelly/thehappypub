"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { fmtCOP, fmtRelTime } from "@/lib/format";
import { useNowTick } from "@/lib/hooks/use-now-tick";
import { Section, EmptyState } from "@/components/panel-ui";

type MenuCategory = { id: string; label: string; sort_order: number };
type MenuItem = { id: string; name: string; price: number; category: string };
type TableRow = { id: string; sort_order: number };
type TableLock = { table_label: string; user_id: string; locked_at: string };
type PairWatch = { id: number; label: string; item_a: string; item_b: string; sort_order: number };
type PairItemRaw = { id: string; name: string; item_status: { qty: number | null } | { qty: number | null }[] | null };
type OrderRow = { id: string; table_label: string; total: number; created_at: string; user_id: string };
type OrderItemRow = { order_id: string; name: string; qty: number; note: string | null };
type UserRow = { id: string; name: string };

type Props = {
  currentUserId: string;
  currentUserRole: "jefe" | "mesero" | "cocinero";
  menuCategories: MenuCategory[];
  menuItems: MenuItem[];
  tables: TableRow[];
  initialLocks: TableLock[];
  pairWatches: PairWatch[];
  initialPairItems: PairItemRaw[];
  discountPct: number | null;
  discountCategory: string | null;
  initialOrders: OrderRow[];
  initialOrderItems: OrderItemRow[];
  users: UserRow[];
  itemsWithRecipe: string[];
};

const MESA_TIMEOUT_MS = 20 * 60 * 1000;

function qtyOf(raw: { qty: number | null } | { qty: number | null }[] | null): number {
  const row = Array.isArray(raw) ? (raw[0] ?? null) : raw;
  return row?.qty ?? 0;
}

export function VenderClient(props: Props) {
  const { menuCategories, tables, pairWatches, users, itemsWithRecipe, currentUserId, currentUserRole } = props;
  const supabase = useMemo(() => createClient(), []);
  const usersById = useMemo(() => Object.fromEntries(users.map((u) => [u.id, u.name])), [users]);
  const recipeSet = useMemo(() => new Set(itemsWithRecipe), [itemsWithRecipe]);

  const [currentCat, setCurrentCat] = useState(menuCategories[0]?.id ?? "");
  const [locks, setLocks] = useState<TableLock[]>(props.initialLocks);
  const [selectedTable, setSelectedTable] = useState<string | null>(
    () => props.initialLocks.find((l) => l.user_id === currentUserId)?.table_label ?? null,
  );
  const [cart, setCart] = useState<Record<string, { qty: number; nota: string }>>({});
  const [orders, setOrders] = useState<OrderRow[]>(props.initialOrders);
  const [orderItems, setOrderItems] = useState<OrderItemRow[]>(props.initialOrderItems);
  const [pairQty, setPairQty] = useState<Record<string, number>>(() =>
    Object.fromEntries(props.initialPairItems.map((it) => [it.id, qtyOf(it.item_status)])),
  );
  const [toast, setToast] = useState<string | null>(null);
  const [registering, setRegistering] = useState(false);
  const [voidingOrderId, setVoidingOrderId] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function showToast(msg: string) {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 1800);
  }

  useEffect(() => {
    const channel = supabase
      .channel("vender-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "table_locks" }, (payload) => {
        if (payload.eventType === "DELETE") {
          const old = payload.old as { table_label: string };
          setLocks((prev) => prev.filter((l) => l.table_label !== old.table_label));
        } else {
          const row = payload.new as TableLock;
          setLocks((prev) => [...prev.filter((l) => l.table_label !== row.table_label), row]);
        }
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "orders" }, (payload) => {
        const row = payload.new as OrderRow;
        setOrders((prev) => (prev.some((o) => o.id === row.id) ? prev : [row, ...prev]));
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "orders" }, (payload) => {
        const row = payload.new as OrderRow;
        setOrders((prev) => prev.map((o) => (o.id === row.id ? row : o)));
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "order_items" }, (payload) => {
        const row = payload.new as OrderItemRow;
        setOrderItems((prev) => [...prev, row]);
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "item_status" }, (payload) => {
        const row = payload.new as { item_id: string; qty: number | null };
        if (row.qty == null) return;
        setPairQty((prev) => (row.item_id in prev ? { ...prev, [row.item_id]: row.qty as number } : prev));
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase]);

  // Reloj propio para decidir si un lock de mesa ya expiró (20 min) — 30s de
  // margen no importa para un lock que dura 20 minutos.
  const nowTick = useNowTick(30_000);

  async function onTableClick(t: string) {
    const lock = locks.find((l) => l.table_label === t);
    const lockedByOther =
      lock && lock.user_id !== currentUserId && nowTick - new Date(lock.locked_at).getTime() < MESA_TIMEOUT_MS;
    if (lockedByOther) {
      showToast(`Mesa ${t} ya está siendo atendida por ${usersById[lock.user_id] ?? "otra persona"}`);
      return;
    }
    if (selectedTable === t) {
      setSelectedTable(null);
      await supabase.from("table_locks").delete().eq("table_label", t).eq("user_id", currentUserId);
      return;
    }
    if (selectedTable) {
      await supabase.from("table_locks").delete().eq("table_label", selectedTable).eq("user_id", currentUserId);
    }
    setSelectedTable(t);
    await supabase.from("table_locks").upsert({ table_label: t, user_id: currentUserId });
  }

  const itemsByCat = menuCategories.map((c) => ({ cat: c, items: props.menuItems.filter((m) => m.category === c.id) }));
  const visibleItems = props.menuItems.filter((m) => m.category === currentCat);

  function priceFor(m: MenuItem): { price: number; hasDiscount: boolean } {
    if (!props.discountPct || props.discountPct <= 0) return { price: m.price, hasDiscount: false };
    if (props.discountCategory !== "todas" && props.discountCategory !== m.category) return { price: m.price, hasDiscount: false };
    return { price: Math.round(m.price * (1 - props.discountPct / 100)), hasDiscount: true };
  }

  function setCartQty(menuItemId: string, qty: number) {
    setCart((prev) => {
      if (qty <= 0) {
        const rest = { ...prev };
        delete rest[menuItemId];
        return rest;
      }
      return { ...prev, [menuItemId]: { qty, nota: prev[menuItemId]?.nota ?? "" } };
    });
  }
  function setCartNota(menuItemId: string, nota: string) {
    setCart((prev) => (prev[menuItemId] ? { ...prev, [menuItemId]: { ...prev[menuItemId], nota } } : prev));
  }

  const cartCount = Object.values(cart).reduce((s, c) => s + c.qty, 0);
  const cartTotal = Object.entries(cart).reduce((s, [id, c]) => {
    const m = props.menuItems.find((x) => x.id === id);
    if (!m) return s;
    return s + priceFor(m).price * c.qty;
  }, 0);

  async function registrarPedido() {
    if (!selectedTable || cartCount === 0) return;
    setRegistering(true);
    try {
      const items = Object.entries(cart).map(([menu_item_id, c]) => ({ menu_item_id, qty: c.qty, note: c.nota || null }));
      const { error } = await supabase.rpc("register_order", { p_table_label: selectedTable, p_items: items });
      if (error) {
        showToast(error.message || "No se pudo registrar el pedido");
        return;
      }
      setCart({});
      setSelectedTable(null);
      showToast("Pedido registrado ✓");
    } finally {
      setRegistering(false);
    }
  }

  async function voidOrder(orderId: string) {
    if (!confirm("¿Anular este pedido? El inventario descontado se devuelve automáticamente.")) return;
    setVoidingOrderId(orderId);
    try {
      const { error } = await supabase.rpc("void_order", { p_order_id: orderId });
      if (error) {
        showToast(error.message || "No se pudo anular el pedido");
        return;
      }
      setOrders((prev) => prev.filter((o) => o.id !== orderId));
      setOrderItems((prev) => prev.filter((oi) => oi.order_id !== orderId));
      showToast("Pedido anulado ✓");
    } finally {
      setVoidingOrderId(null);
    }
  }

  const mismatches = pairWatches.filter((p) => pairQty[p.item_a] !== pairQty[p.item_b]);
  const pairNameById = Object.fromEntries(props.initialPairItems.map((it) => [it.id, it.name]));
  const todaysOrders = orders.filter((o) => o.id); // ya vienen filtrados por hoy desde el server

  return (
    <div>
      {(mismatches.length > 0 || (props.discountPct && props.discountPct > 0)) && (
        <div className="mb-3.5 rounded-xl border border-amber/40 bg-amber/10 px-3 py-2.5 text-[11.5px] leading-relaxed text-amber">
          {mismatches.length > 0 && (
            <div>
              ⚠️{" "}
              {mismatches
                .map((p) => `${pairNameById[p.item_a] ?? p.item_a} (${pairQty[p.item_a] ?? 0}) ≠ ${pairNameById[p.item_b] ?? p.item_b} (${pairQty[p.item_b] ?? 0})`)
                .join(" · ")}
            </div>
          )}
          {props.discountPct && props.discountPct > 0 && (
            <div>
              🏷️ Descuento activo hoy: {props.discountPct}% en{" "}
              {props.discountCategory === "todas" ? "todo el menú" : menuCategories.find((c) => c.id === props.discountCategory)?.label ?? props.discountCategory}
            </div>
          )}
        </div>
      )}

      <Section title="Mesa">
        <div className="mb-1.5 flex flex-wrap gap-1.5">
          {tables.map((t) => {
            const lock = locks.find((l) => l.table_label === t.id);
            const lockedByOther = lock && lock.user_id !== currentUserId && nowTick - new Date(lock.locked_at).getTime() < MESA_TIMEOUT_MS;
            const active = selectedTable === t.id;
            return (
              <button
                key={t.id}
                onClick={() => onTableClick(t.id)}
                title={lockedByOther ? `Ocupada por ${usersById[lock!.user_id] ?? "otra persona"}` : ""}
                className={`w-[42px] rounded-lg border px-1 py-2 text-[11.5px] font-bold ${
                  active
                    ? "border-gold bg-gold text-[#1A140D]"
                    : lockedByOther
                      ? "border-red bg-red/20 text-red"
                      : "border-border bg-surface text-text-dim"
                }`}
              >
                {t.id}
              </button>
            );
          })}
        </div>
        <p className="text-[11px] text-text-dim">
          {selectedTable ? `Mesa seleccionada: ${selectedTable}` : "Selecciona una mesa para empezar el pedido."}
        </p>
      </Section>

      <div className="mb-3.5 flex gap-1.5 overflow-x-auto pb-0.5">
        {itemsByCat.map(({ cat }) => (
          <button
            key={cat.id}
            onClick={() => setCurrentCat(cat.id)}
            className={`flex-none whitespace-nowrap rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold ${
              cat.id === currentCat ? "border-navy bg-navy text-white" : "border-border bg-surface text-text-dim"
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      <div className="mb-4 space-y-2">
        {visibleItems.map((m) => {
          const { price, hasDiscount } = priceFor(m);
          const line = cart[m.id];
          const noDec = !recipeSet.has(m.id);
          return (
            <div key={m.id} className="flex items-center gap-2.5 rounded-xl border border-border bg-surface px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <div className="text-[12.5px] font-semibold">{m.name}</div>
                <div className="mt-0.5 font-mono text-[10.5px]">
                  {hasDiscount ? (
                    <>
                      <span className="text-text-faint line-through">{fmtCOP(m.price)}</span>{" "}
                      <span className="font-bold text-gold">{fmtCOP(price)}</span>
                    </>
                  ) : (
                    <span className="text-gold">{fmtCOP(price)}</span>
                  )}
                </div>
                {noDec && <div className="text-[8.5px] text-text-faint">no descuenta inventario exacto</div>}
                {line && line.qty > 0 && (
                  <input
                    value={line.nota}
                    onChange={(e) => setCartNota(m.id, e.target.value)}
                    placeholder="Nota, ej: sin lechuga"
                    className="mt-1.5 w-full rounded-md border border-border bg-surface-2 px-2 py-1 text-[11px] text-text"
                  />
                )}
              </div>
              <div className="flex flex-none items-center gap-1.5">
                <button
                  onClick={() => setCartQty(m.id, Math.max(0, (line?.qty ?? 0) - 1))}
                  className="h-[26px] w-[26px] rounded-md border border-border bg-surface-2 font-bold text-gold"
                >
                  –
                </button>
                <span className="w-[22px] text-center text-[12.5px] font-bold">{line?.qty ?? 0}</span>
                <button
                  onClick={() => setCartQty(m.id, (line?.qty ?? 0) + 1)}
                  className="h-[26px] w-[26px] rounded-md border border-border bg-surface-2 font-bold text-gold"
                >
                  +
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="sticky bottom-3 flex items-center justify-between rounded-2xl border border-border bg-surface px-3.5 py-3 shadow-lg">
        <div className="text-[11px] text-text-dim">
          {cartCount} producto{cartCount !== 1 ? "s" : ""}
          <div className="font-display text-sm font-bold text-gold">{fmtCOP(cartTotal)}</div>
        </div>
        <button
          onClick={registrarPedido}
          disabled={registering || cartCount === 0 || !selectedTable}
          className="rounded-lg bg-gold px-4 py-2.5 text-[12px] font-bold text-[#1A140D] disabled:opacity-40"
        >
          {registering ? "Registrando…" : "Registrar pedido"}
        </button>
      </div>

      <div className="mt-5">
        <Section title="Pedidos de hoy">
          {todaysOrders.length === 0 ? (
            <EmptyState text="Todavía no se han registrado pedidos hoy." />
          ) : (
            <div className="space-y-1.5">
              {todaysOrders.map((o) => {
                const lines = orderItems.filter((oi) => oi.order_id === o.id);
                return (
                  <div key={o.id} className="rounded-xl border border-border bg-surface p-2.5">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-[12px] font-bold">Mesa {o.table_label}</span>
                      <span className="font-mono text-[11.5px] text-gold">{fmtCOP(o.total)}</span>
                    </div>
                    <div className="mt-0.5 text-[10px] text-text-faint">
                      {usersById[o.user_id] ?? "—"} · {fmtRelTime(o.created_at)}
                    </div>
                    {lines.length > 0 && (
                      <div className="mt-1.5 text-[11px] leading-relaxed text-text-dim">
                        {lines.map((l, i) => (
                          <span key={i}>
                            {i > 0 && ", "}
                            {l.qty}x {l.name}
                            {l.note ? ` (${l.note})` : ""}
                          </span>
                        ))}
                      </div>
                    )}
                    {(currentUserRole === "jefe" || o.user_id === currentUserId) && (
                      <button
                        onClick={() => voidOrder(o.id)}
                        disabled={voidingOrderId === o.id}
                        className="mt-1.5 rounded-md border border-red/40 px-2 py-1 text-[10.5px] font-bold text-red disabled:opacity-40"
                      >
                        {voidingOrderId === o.id ? "Anulando…" : "Anular pedido"}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </Section>
      </div>

      {toast && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 rounded-full bg-gold px-5 py-2.5 text-[12.5px] font-bold text-[#1A140D] shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}
