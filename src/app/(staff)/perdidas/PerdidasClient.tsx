"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { fmtRelTime } from "@/lib/format";
import { Section, EmptyState, FieldLabel, inputCls } from "@/components/panel-ui";

type CategoryRow = { id: string; label: string; domain: string; sort_order: number };
type ItemRow = { id: string; name: string; unit: string; category: string };
type Loss = {
  id: string;
  category: "Cristalería" | "Producto" | "Elementos";
  description: string;
  qty: number;
  item_id: string | null;
  reason: string | null;
  user_id: string;
  created_at: string;
};
type UserRow = { id: string; name: string };

type Props = {
  categories: CategoryRow[];
  items: ItemRow[];
  losses: Loss[];
  users: UserRow[];
};

const CATEGORIAS = ["Cristalería", "Producto", "Elementos"] as const;

export function PerdidasClient({ categories, items, losses: initialLosses, users }: Props) {
  const supabase = createClient();
  const usersById = Object.fromEntries(users.map((u) => [u.id, u.name]));
  const itemById = Object.fromEntries(items.map((it) => [it.id, it]));

  const [losses, setLosses] = useState(initialLosses);
  const [categoria, setCategoria] = useState<(typeof CATEGORIAS)[number]>("Producto");
  const [productoId, setProductoId] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [cantidad, setCantidad] = useState("");
  const [motivo, setMotivo] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    const qty = Number(cantidad);
    if (!descripcion.trim() || !qty || qty <= 0) {
      setError("Escribe una descripción y cantidad válida");
      return;
    }
    setSaving(true);
    try {
      const { data, error: rpcError } = await supabase.rpc("register_loss", {
        p_category: categoria,
        p_description: descripcion.trim(),
        p_qty: qty,
        p_item_id: productoId || null,
        p_reason: motivo.trim() || null,
      });
      if (rpcError) {
        setError(rpcError.message);
        return;
      }
      setLosses((prev) => [
        {
          id: data as string,
          category: categoria,
          description: descripcion.trim(),
          qty,
          item_id: productoId || null,
          reason: motivo.trim() || null,
          user_id: "",
          created_at: new Date().toISOString(),
        },
        ...prev,
      ]);
      setDescripcion("");
      setCantidad("");
      setMotivo("");
      setProductoId("");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <Section title="Registrar pérdida">
        <div className="space-y-2.5 rounded-xl border border-border bg-surface p-3.5">
          {error && <div className="rounded-lg border border-red/40 bg-red/10 px-2.5 py-2 text-[11px] text-red">{error}</div>}
          <div>
            <FieldLabel>Categoría</FieldLabel>
            <select value={categoria} onChange={(e) => setCategoria(e.target.value as (typeof CATEGORIAS)[number])} className={inputCls}>
              {CATEGORIAS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div>
            <FieldLabel>Producto relacionado (opcional, descuenta inventario)</FieldLabel>
            <select value={productoId} onChange={(e) => setProductoId(e.target.value)} className={inputCls}>
              <option value="">— Ninguno —</option>
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
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <FieldLabel>Descripción</FieldLabel>
              <input
                value={descripcion}
                onChange={(e) => setDescripcion(e.target.value)}
                placeholder="Ej: Copa de vidrio, Barril de Gulupa…"
                className={inputCls}
              />
            </div>
            <div>
              <FieldLabel>Cantidad</FieldLabel>
              <input type="number" min={1} value={cantidad} onChange={(e) => setCantidad(e.target.value)} placeholder="Ej: 2" className={inputCls} />
            </div>
          </div>
          <div>
            <FieldLabel>Motivo</FieldLabel>
            <input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ej: se cayó, se rompió, vencido" className={inputCls} />
          </div>
          <button
            onClick={submit}
            disabled={saving}
            className="w-full rounded-lg bg-gold py-2.5 text-[13px] font-bold text-[#1A140D] disabled:opacity-50"
          >
            {saving ? "Guardando…" : "Registrar pérdida"}
          </button>
        </div>
      </Section>

      <Section title="Pérdidas recientes">
        {losses.length === 0 ? (
          <EmptyState text="Sin pérdidas reportadas." />
        ) : (
          <div className="space-y-1.5">
            {losses.map((l) => (
              <div key={l.id} className="rounded-xl border border-border bg-surface p-2.5">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[12px] font-bold">{l.description}</span>
                  <span className="font-mono text-[11.5px] text-red">-{l.qty}</span>
                </div>
                <div className="mt-0.5 text-[10px] text-text-faint">
                  <span className="rounded bg-red/15 px-1.5 py-0.5 font-mono text-[8.5px] uppercase text-red">{l.category}</span>{" "}
                  · {usersById[l.user_id] ?? "—"} · {fmtRelTime(l.created_at)}
                  {l.reason ? ` · ${l.reason}` : ""}
                  {l.item_id ? ` · vinculado a ${itemById[l.item_id]?.name ?? l.item_id}` : ""}
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}
