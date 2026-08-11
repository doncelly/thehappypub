"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { fmtHM } from "@/lib/format";
import { Section, EmptyState } from "@/components/panel-ui";

type OrderRow = { id: string; table_label: string; user_id: string; created_at: string; kitchen_ack_at: string | null; kitchen_ack_by: string | null };
type OrderItemRow = { order_id: string; name: string; qty: number; note: string | null };

type Props = {
  initialOrders: OrderRow[];
  initialOrderItems: OrderItemRow[];
  users: { id: string; name: string }[];
};

// Beep sintetizado con Web Audio API — no depende de ningún archivo de audio
// externo. iOS/Safari bloquea el audio hasta que hay una interacción real del
// usuario, por eso el AudioContext se crea recién al tocar "Activar sonido".
function beep(ctx: AudioContext) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.value = 880;
  gain.gain.setValueAtTime(0.0001, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.35);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + 0.35);
}

export function PedidosClient({ initialOrders, initialOrderItems, users }: Props) {
  const supabase = useMemo(() => createClient(), []);
  const usersById = useMemo(() => Object.fromEntries(users.map((u) => [u.id, u.name])), [users]);

  const [orders, setOrders] = useState<OrderRow[]>(initialOrders);
  const [orderItems, setOrderItems] = useState<OrderItemRow[]>(initialOrderItems);
  const [ackingId, setAckingId] = useState<string | null>(null);
  const [soundOn, setSoundOn] = useState(false);
  const audioCtxRef = useRef<AudioContext | null>(null);

  function activateSound() {
    const AudioCtx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    audioCtxRef.current = new AudioCtx();
    beep(audioCtxRef.current);
    setSoundOn(true);
  }

  useEffect(() => {
    const channel = supabase
      .channel("pedidos-live")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "orders" }, (payload) => {
        const row = payload.new as OrderRow;
        setOrders((prev) => (prev.some((o) => o.id === row.id) ? prev : [...prev, row]));
        if (audioCtxRef.current) {
          beep(audioCtxRef.current);
          setTimeout(() => audioCtxRef.current && beep(audioCtxRef.current), 450);
        }
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "orders" }, (payload) => {
        const row = payload.new as OrderRow;
        setOrders((prev) => prev.map((o) => (o.id === row.id ? row : o)));
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "orders" }, (payload) => {
        const old = payload.old as { id: string };
        setOrders((prev) => prev.filter((o) => o.id !== old.id));
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "order_items" }, (payload) => {
        const row = payload.new as OrderItemRow;
        setOrderItems((prev) => [...prev, row]);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase]);

  async function ack(orderId: string) {
    setAckingId(orderId);
    try {
      await supabase.rpc("ack_order_kitchen", { p_order_id: orderId });
    } finally {
      setAckingId(null);
    }
  }

  const pending = orders.filter((o) => !o.kitchen_ack_at).sort((a, b) => a.created_at.localeCompare(b.created_at));
  const done = orders.filter((o) => o.kitchen_ack_at).sort((a, b) => b.created_at.localeCompare(a.created_at));

  // Agrupados por mesa — si una mesa pide dos veces y ambos siguen
  // pendientes, se ve como una sola tarjeta con los dos adentro, no como una
  // alerta de "pedido nuevo" repetida por cada uno.
  const pendingByTable: [string, OrderRow[]][] = [];
  for (const o of pending) {
    const group = pendingByTable.find(([table]) => table === o.table_label);
    if (group) group[1].push(o);
    else pendingByTable.push([o.table_label, [o]]);
  }

  return (
    <div>
      {!soundOn && (
        <button
          onClick={activateSound}
          className="mb-3.5 w-full rounded-xl border border-gold/40 bg-gold/10 py-3 text-[13px] font-bold text-gold"
        >
          🔊 Activar sonido de alerta para pedidos nuevos
        </button>
      )}

      <Section title={`Pedidos pendientes${pending.length ? ` (${pending.length})` : ""}`}>
        {pendingByTable.length === 0 ? (
          <EmptyState text="No hay pedidos esperando en cocina." />
        ) : (
          <div className="space-y-2">
            {pendingByTable.map(([table, tableOrders]) => (
              <div key={table} className="rounded-xl border border-gold/40 bg-gold/5 p-3">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[14px] font-bold">
                    Mesa {table}
                    {tableOrders.length > 1 && <span className="ml-1 font-normal text-text-faint">({tableOrders.length} pedidos)</span>}
                  </span>
                </div>
                <div className="mt-1.5 space-y-2.5 divide-y divide-gold/20">
                  {tableOrders.map((o) => {
                    const lines = orderItems.filter((oi) => oi.order_id === o.id);
                    return (
                      <div key={o.id} className="pt-2.5 first:pt-0">
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="text-[10px] text-text-faint">{usersById[o.user_id] ?? "—"}</span>
                          <span className="font-mono text-[11px] text-text-faint">{fmtHM(o.created_at)}</span>
                        </div>
                        {lines.length > 0 && (
                          <ul className="mt-1 space-y-0.5 text-[12.5px]">
                            {lines.map((l, i) => (
                              <li key={i}>
                                <span className="font-bold">{l.qty}x</span> {l.name}
                                {l.note ? <span className="text-text-dim"> ({l.note})</span> : null}
                              </li>
                            ))}
                          </ul>
                        )}
                        <button
                          onClick={() => ack(o.id)}
                          disabled={ackingId === o.id}
                          className="mt-2 w-full rounded-lg bg-gold py-2 text-[12.5px] font-bold text-[#1A140D] disabled:opacity-50"
                        >
                          {ackingId === o.id ? "Marcando…" : "✓ Recibido / en preparación"}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      {done.length > 0 && (
        <Section title="Ya preparados hoy">
          <div className="space-y-1.5">
            {done.map((o) => (
              <div key={o.id} className="flex items-baseline justify-between gap-2 rounded-lg border border-border bg-surface-2 px-2.5 py-1.5 text-[11px]">
                <span>Mesa {o.table_label}</span>
                <span className="font-mono text-text-faint">{fmtHM(o.kitchen_ack_at)}</span>
              </div>
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}
