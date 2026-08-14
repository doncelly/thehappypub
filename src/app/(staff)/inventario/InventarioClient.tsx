"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { levelOf, nextStatusKey, mlForLevel, type StatusGaugeKey } from "@/lib/constants/status-levels";
import { normalizeStatus, type RawItemStatus, type ItemStatus } from "@/lib/inventory-status";
import { fmtRelTime } from "@/lib/format";

export type CategoryRow = { id: string; label: string; domain: string; sort_order: number };

export type RawItemRow = {
  id: string;
  name: string;
  category: string;
  mode: "gauge" | "qty";
  unit: string | null;
  step: number | null;
  min: number | null;
  gauge_capacity_ml: number | null;
  item_status: RawItemStatus;
};

type ItemRow = Omit<RawItemRow, "item_status"> & { item_status: ItemStatus };

type Props = {
  categories: CategoryRow[];
  initialItems: RawItemRow[];
  usersById: Record<string, string>;
  currentUserName: string;
};

export function InventarioClient({ categories, initialItems, usersById, currentUserName }: Props) {
  const supabase = useMemo(() => createClient(), []);
  const [items, setItems] = useState<ItemRow[]>(() =>
    initialItems.map((it) => ({ ...it, item_status: normalizeStatus(it.item_status, usersById) })),
  );
  const [currentCat, setCurrentCat] = useState(categories[0]?.id ?? "");
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function showToast(msg: string) {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 1600);
  }

  // Reemplaza el POLL_MS=3000 del original: cambios de cualquier persona (otro
  // mesero, cocinero o jefe) llegan al toque, sin refrescar la página.
  useEffect(() => {
    const channel = supabase
      .channel("inventario-item-status")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "item_status" },
        (payload) => {
          const row = payload.new as {
            item_id: string;
            status_gauge: StatusGaugeKey | null;
            qty: number | null;
            updated_at: string;
            updated_by: string | null;
          };
          setItems((prev) =>
            prev.map((it) =>
              it.id === row.item_id
                ? {
                    ...it,
                    item_status: {
                      status_gauge: row.status_gauge,
                      qty: row.qty,
                      updated_at: row.updated_at,
                      updatedByName: row.updated_by ? (usersById[row.updated_by] ?? "—") : "—",
                    },
                  }
                : it,
            ),
          );
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, usersById]);

  async function cycleStatus(item: ItemRow) {
    const next = nextStatusKey(item.item_status.status_gauge);
    setItems((prev) =>
      prev.map((it) =>
        it.id === item.id
          ? {
              ...it,
              item_status: {
                status_gauge: next,
                qty: null,
                updated_at: new Date().toISOString(),
                updatedByName: currentUserName,
              },
            }
          : it,
      ),
    );
    showToast("Actualizado ✓");
    // Si el barril tiene capacidad conocida, sincroniza gauge_consumed_ml con
    // el nivel elegido a mano — register_order/void_order derivan el nivel
    // siempre de ese contador, así que si no se sincroniza, la próxima venta
    // saltaría el nivel de vuelta a donde iba antes del ajuste manual.
    const payload: { status_gauge: StatusGaugeKey; gauge_consumed_ml?: number } = { status_gauge: next };
    if (item.gauge_capacity_ml != null) payload.gauge_consumed_ml = mlForLevel(next, item.gauge_capacity_ml);
    const { error } = await supabase.from("item_status").update(payload).eq("item_id", item.id);
    if (error) showToast("No se pudo guardar — revisa tu conexión");
  }

  async function setQty(item: ItemRow, newQty: number) {
    const clamped = Math.max(0, Math.round(newQty));
    setItems((prev) =>
      prev.map((it) =>
        it.id === item.id
          ? {
              ...it,
              item_status: {
                status_gauge: null,
                qty: clamped,
                updated_at: new Date().toISOString(),
                updatedByName: currentUserName,
              },
            }
          : it,
      ),
    );
    const { error } = await supabase.from("item_status").update({ qty: clamped }).eq("item_id", item.id);
    if (error) showToast("No se pudo guardar — revisa tu conexión");
  }

  const visibleItems = items.filter((it) => it.category === currentCat);

  return (
    <div>
      <div className="mb-3.5 flex gap-1.5 overflow-x-auto pb-0.5">
        {categories.map((c) => (
          <button
            key={c.id}
            onClick={() => setCurrentCat(c.id)}
            className={`flex-none whitespace-nowrap rounded-full border px-3 py-1.5 text-[11.5px] font-semibold ${
              c.id === currentCat
                ? "border-navy bg-navy text-white"
                : "border-border bg-surface text-text-dim"
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>
      <p className="mb-4 text-[11px] leading-relaxed text-text-faint">
        Barriles, insumos de cóctel, shots, salsas y aseo: toca la copa para cambiar el nivel. Los
        demás: usa +/- o escribe la cantidad exacta.
      </p>

      <div>
        {visibleItems.length === 0 && (
          <div className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-[11.5px] text-text-faint">
            Sin productos en esta categoría.
          </div>
        )}
        <div className="grid grid-cols-1 gap-2 lg:grid-cols-2 xl:grid-cols-3">
          {visibleItems.map((item) =>
            item.mode === "gauge" ? (
              <GaugeItemRow key={item.id} item={item} onCycle={() => cycleStatus(item)} />
            ) : (
              <QtyItemRow key={item.id} item={item} onChange={(q) => setQty(item, q)} />
            ),
          )}
        </div>
      </div>

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 rounded-full bg-gold px-5 py-2.5 text-[12.5px] font-bold text-[#1A140D] shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}

function GaugeItemRow({ item, onCycle }: { item: ItemRow; onCycle: () => void }) {
  const level = levelOf(item.item_status.status_gauge);
  const timeAgo = fmtRelTime(item.item_status.updated_at);

  return (
    <div className="flex items-center gap-2.5 rounded-xl border border-border bg-surface px-3 py-2.5">
      <button
        onClick={onCycle}
        title="Toca para cambiar nivel"
        className="relative h-[42px] w-[30px] flex-none overflow-hidden rounded-b-lg border-2 border-t-0"
        style={{ borderColor: "#8A6512" }}
      >
        <span
          className="absolute inset-x-0 bottom-0 transition-all"
          style={{ height: level.pct, backgroundColor: level.color }}
        />
      </button>
      <div className="min-w-0 flex-1">
        <div className="text-[12.5px] font-semibold">{item.name}</div>
        <div className="mt-0.5 font-mono text-[9.5px] text-text-faint">
          {item.item_status.updatedByName} · {timeAgo}
        </div>
      </div>
      <div
        className="whitespace-nowrap rounded-md px-1.5 py-1 font-mono text-[9.5px] font-semibold uppercase"
        style={{ backgroundColor: `${level.color}22`, color: level.color, border: `1px solid ${level.color}55` }}
      >
        {level.label}
      </div>
    </div>
  );
}

function QtyItemRow({ item, onChange }: { item: ItemRow; onChange: (qty: number) => void }) {
  const qty = item.item_status.qty ?? 0;
  const isLow = item.min != null && qty <= item.min;
  const timeAgo = fmtRelTime(item.item_status.updated_at);
  const step = item.step ?? 1;

  const [inputValue, setInputValue] = useState(String(qty));
  const [syncedQty, setSyncedQty] = useState(qty);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Si `qty` cambia por fuera (Realtime, otra persona) mientras nadie está
  // escribiendo acá, reflejarlo — ajustado durante el render en vez de en un
  // efecto, para no disparar un render extra en cascada.
  if (qty !== syncedQty) {
    setSyncedQty(qty);
    setInputValue(String(qty));
  }

  function onInput(v: string) {
    setInputValue(v);
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      const n = Math.max(0, parseInt(v, 10) || 0);
      onChange(n);
    }, 600);
  }

  return (
    <div className="flex items-center gap-2.5 rounded-xl border border-border bg-surface px-3 py-2.5">
      <div className="min-w-0 flex-1">
        <div className="text-[12.5px] font-semibold">{item.name}</div>
        <div className="mt-0.5 font-mono text-[9.5px] text-text-faint">
          {item.item_status.updatedByName} · {timeAgo}
          {isLow && <span className="ml-1 font-semibold text-red">· bajo mínimo</span>}
        </div>
      </div>
      <div className="flex flex-none items-center gap-1.5">
        <button
          onClick={() => onChange(Math.max(0, qty - step))}
          className="h-[26px] w-[26px] rounded-md border border-border bg-surface-2 font-bold text-gold"
        >
          –
        </button>
        <input
          type="number"
          value={inputValue}
          onChange={(e) => onInput(e.target.value)}
          className="w-[50px] rounded-md border border-border bg-surface-2 py-1 text-center text-[12.5px] font-bold text-text"
        />
        <button
          onClick={() => onChange(qty + step)}
          className="h-[26px] w-[26px] rounded-md border border-border bg-surface-2 font-bold text-gold"
        >
          +
        </button>
      </div>
      <div className="w-[26px] flex-none font-mono text-[8.5px] text-text-faint">{item.unit}</div>
    </div>
  );
}
