"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { compressImage } from "@/lib/compress-image";
import { newId } from "@/lib/new-id";
import { fmtRelTime } from "@/lib/format";
import { Section, EmptyState, FieldLabel, inputCls, MiniButton } from "@/components/panel-ui";
import type { AppRole } from "@/lib/auth/current-user";

const BUCKET = "happy-pub-photos";

type CategoryRow = { id: string; label: string; domain: string; sort_order: number };
type ItemRow = { id: string; name: string; unit: string; category: string };
type Delivery = {
  id: string;
  item_id: string;
  qty: number;
  photo_producto_path: string | null;
  photo_factura_path: string | null;
  user_id: string;
  created_at: string;
};
type PurchaseOrder = {
  id: string;
  item_id: string;
  supplier: string | null;
  qty: number;
  expected_date: string | null;
  status: "pendiente" | "recibido";
  ordered_by: string;
  ordered_at: string;
};
type UserRow = { id: string; name: string };

type Props = {
  role: AppRole;
  categories: CategoryRow[];
  items: ItemRow[];
  deliveries: Delivery[];
  photoUrls: Record<string, string>;
  purchaseOrders: PurchaseOrder[];
  users: UserRow[];
};

export function RecibidosClient({ role, categories, items, deliveries: initialDeliveries, photoUrls, purchaseOrders: initialPOs, users }: Props) {
  const supabase = createClient();
  const usersById = Object.fromEntries(users.map((u) => [u.id, u.name]));
  const itemById = Object.fromEntries(items.map((it) => [it.id, it]));

  const [deliveries, setDeliveries] = useState(initialDeliveries);
  const [purchaseOrders, setPurchaseOrders] = useState(initialPOs);
  const [toast, setToast] = useState<string | null>(null);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 1800);
  }

  return (
    <div>
      <DeliveryForm
        categories={categories}
        items={items}
        onAdded={(d) => {
          setDeliveries((prev) => [d, ...prev]);
          showToast("Pedido recibido registrado ✓");
        }}
        onError={showToast}
      />

      <Section title="Pedidos recibidos">
        {deliveries.length === 0 ? (
          <EmptyState text="Aún no se han registrado pedidos recibidos." />
        ) : (
          <div className="space-y-1.5">
            {deliveries.map((d) => {
              const it = itemById[d.item_id];
              return (
                <div key={d.id} className="rounded-xl border border-border bg-surface p-2.5">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-[12px] font-bold">{it?.name ?? d.item_id}</span>
                    <span className="font-mono text-[11.5px] text-green">
                      +{d.qty} {it?.unit ?? ""}
                    </span>
                  </div>
                  <div className="mt-0.5 text-[10px] text-text-faint">
                    {usersById[d.user_id] ?? "—"} · {fmtRelTime(d.created_at)}
                  </div>
                  <div className="mt-1.5 flex gap-1.5">
                    {[d.photo_producto_path, d.photo_factura_path].filter(Boolean).map((p) => (
                      // eslint-disable-next-line @next/next/no-img-element -- foto firmada de Storage
                      <img
                        key={p}
                        src={photoUrls[p as string]}
                        alt="Evidencia"
                        className="h-16 w-16 cursor-pointer rounded-lg border border-border object-cover"
                        onClick={() => window.open(photoUrls[p as string], "_blank")}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Section>

      {role === "jefe" && (
        <PurchaseOrderForm
          categories={categories}
          items={items}
          onAdded={(po) => {
            setPurchaseOrders((prev) => [po, ...prev]);
            showToast("Pedido a proveedor registrado ✓");
          }}
          onError={showToast}
        />
      )}

      <Section title="Pedidos a proveedor">
        {purchaseOrders.length === 0 ? (
          <EmptyState text="No hay pedidos a proveedor pendientes." />
        ) : (
          <div className="space-y-1.5">
            {purchaseOrders.map((p) => {
              const it = itemById[p.item_id];
              return (
                <div key={p.id} className="rounded-xl border border-border bg-surface p-2.5">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-[12px] font-bold">{it?.name ?? p.item_id}</span>
                    <span className="font-mono text-[11.5px] text-amber">
                      {p.qty} {it?.unit ?? ""}
                    </span>
                  </div>
                  <div className="mt-0.5 text-[10px] text-text-faint">
                    {p.supplier || "Sin proveedor especificado"} · pedido por {usersById[p.ordered_by] ?? "—"} ·{" "}
                    {fmtRelTime(p.ordered_at)}
                    {p.expected_date ? ` · esperado ${p.expected_date}` : ""}
                  </div>
                  <div className="mt-1.5">
                    <MiniButton
                      onClick={async () => {
                        const { error } = await supabase.rpc("mark_purchase_order_received", { p_id: p.id });
                        if (error) {
                          showToast(error.message);
                          return;
                        }
                        setPurchaseOrders((prev) => prev.filter((x) => x.id !== p.id));
                        showToast("Marcado como llegado — se sumó al inventario ✓");
                      }}
                    >
                      ✓ Marcar como llegó
                    </MiniButton>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Section>

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 rounded-full bg-gold px-5 py-2.5 text-[12.5px] font-bold text-[#1A140D] shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}

function ItemSelect({
  categories,
  items,
  value,
  onChange,
}: {
  categories: CategoryRow[];
  items: ItemRow[];
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={inputCls}>
      <option value="">Elige un producto…</option>
      {categories.map((c) => {
        const catItems = items.filter((it) => it.category === c.id);
        if (catItems.length === 0) return null;
        return (
          <optgroup key={c.id} label={c.label}>
            {catItems.map((it) => (
              <option key={it.id} value={it.id}>
                {it.name}
              </option>
            ))}
          </optgroup>
        );
      })}
    </select>
  );
}

function DeliveryForm({
  categories,
  items,
  onAdded,
  onError,
}: {
  categories: CategoryRow[];
  items: ItemRow[];
  onAdded: (d: Delivery) => void;
  onError: (msg: string) => void;
}) {
  const supabase = createClient();
  const [itemId, setItemId] = useState("");
  const [qty, setQty] = useState("");
  const [fotoProducto, setFotoProducto] = useState<File | null>(null);
  const [fotoFactura, setFotoFactura] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit() {
    const q = Number(qty);
    if (!itemId || !q || q <= 0) {
      onError("Elige un producto y una cantidad válida");
      return;
    }
    setSaving(true);
    try {
      const id = newId();
      let photoProductoPath: string | null = null;
      let photoFacturaPath: string | null = null;

      if (fotoProducto) {
        const blob = await compressImage(fotoProducto);
        photoProductoPath = `deliveries/${id}/producto.jpg`;
        const { error } = await supabase.storage.from(BUCKET).upload(photoProductoPath, blob, { contentType: "image/jpeg" });
        if (error) throw error;
      }
      if (fotoFactura) {
        const blob = await compressImage(fotoFactura);
        photoFacturaPath = `deliveries/${id}/factura.jpg`;
        const { error } = await supabase.storage.from(BUCKET).upload(photoFacturaPath, blob, { contentType: "image/jpeg" });
        if (error) throw error;
      }

      const { error: rpcError } = await supabase.rpc("register_delivery", {
        p_id: id,
        p_item_id: itemId,
        p_qty: q,
        p_photo_producto_path: photoProductoPath,
        p_photo_factura_path: photoFacturaPath,
      });
      if (rpcError) throw rpcError;

      onAdded({
        id,
        item_id: itemId,
        qty: q,
        photo_producto_path: photoProductoPath,
        photo_factura_path: photoFacturaPath,
        user_id: "",
        created_at: new Date().toISOString(),
      });
      setItemId("");
      setQty("");
      setFotoProducto(null);
      setFotoFactura(null);
    } catch (e) {
      onError(e instanceof Error ? e.message : "No se pudo registrar el pedido recibido");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Section title="Registrar pedido recibido">
      <div className="space-y-2.5 rounded-xl border border-border bg-surface p-3.5">
        <div>
          <FieldLabel>Producto</FieldLabel>
          <ItemSelect categories={categories} items={items} value={itemId} onChange={setItemId} />
        </div>
        <div>
          <FieldLabel>Cantidad</FieldLabel>
          <input type="number" value={qty} onChange={(e) => setQty(e.target.value)} placeholder="Ej: 12" className={inputCls} />
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          <div>
            <FieldLabel>Foto del producto</FieldLabel>
            <input type="file" accept="image/*" capture="environment" onChange={(e) => setFotoProducto(e.target.files?.[0] ?? null)} className="text-[10.5px] text-text-dim" />
          </div>
          <div>
            <FieldLabel>Foto de la factura</FieldLabel>
            <input type="file" accept="image/*" capture="environment" onChange={(e) => setFotoFactura(e.target.files?.[0] ?? null)} className="text-[10.5px] text-text-dim" />
          </div>
        </div>
        <button
          onClick={submit}
          disabled={saving}
          className="w-full rounded-lg bg-gold py-2.5 text-[13px] font-bold text-[#1A140D] disabled:opacity-50"
        >
          {saving ? "Guardando…" : "Registrar pedido recibido"}
        </button>
      </div>
    </Section>
  );
}

function PurchaseOrderForm({
  categories,
  items,
  onAdded,
  onError,
}: {
  categories: CategoryRow[];
  items: ItemRow[];
  onAdded: (p: PurchaseOrder) => void;
  onError: (msg: string) => void;
}) {
  const supabase = createClient();
  const [itemId, setItemId] = useState("");
  const [proveedor, setProveedor] = useState("");
  const [cantidad, setCantidad] = useState("");
  const [fecha, setFecha] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit() {
    const q = Number(cantidad);
    if (!itemId || !q || q <= 0) {
      onError("Elige un producto y una cantidad válida");
      return;
    }
    setSaving(true);
    try {
      const { data, error } = await supabase
        .from("purchase_orders")
        .insert({ item_id: itemId, supplier: proveedor.trim() || null, qty: q, expected_date: fecha || null })
        .select()
        .single();
      if (error) throw error;
      onAdded(data as PurchaseOrder);
      setItemId("");
      setProveedor("");
      setCantidad("");
      setFecha("");
    } catch (e) {
      onError(e instanceof Error ? e.message : "No se pudo registrar el pedido a proveedor");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Section title="Pedido a proveedor">
      <div className="space-y-2.5 rounded-xl border border-border bg-surface p-3.5">
        <div>
          <FieldLabel>Producto</FieldLabel>
          <ItemSelect categories={categories} items={items} value={itemId} onChange={setItemId} />
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          <div>
            <FieldLabel>Proveedor</FieldLabel>
            <input value={proveedor} onChange={(e) => setProveedor(e.target.value)} placeholder="Ej: Distribuidora X" className={inputCls} />
          </div>
          <div>
            <FieldLabel>Cantidad</FieldLabel>
            <input type="number" value={cantidad} onChange={(e) => setCantidad(e.target.value)} placeholder="Ej: 24" className={inputCls} />
          </div>
        </div>
        <div className="min-w-0 overflow-hidden">
          <FieldLabel>Fecha esperada</FieldLabel>
          <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className={`${inputCls} min-w-0 appearance-none`} />
        </div>
        <button
          onClick={submit}
          disabled={saving}
          className="w-full rounded-lg border border-border bg-surface-2 py-2.5 text-[13px] font-bold text-text disabled:opacity-50"
        >
          {saving ? "Guardando…" : "Registrar pedido a proveedor"}
        </button>
      </div>
    </Section>
  );
}
