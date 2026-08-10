"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { fmtCOP } from "@/lib/format";
import { Section, EmptyState, FieldLabel, inputCls, MiniButton } from "@/components/panel-ui";
import type { CashRegister, CashPurchase, CashTransportAid } from "./types";

type Props = {
  date: string;
  cashRegister: CashRegister;
  purchases: CashPurchase[];
  transportAid: CashTransportAid[];
  ventasHoy: number;
  onChanged: () => void;
};

export function CajaSection({ date, cashRegister: c, purchases, transportAid, ventasHoy, onChanged }: Props) {
  const supabase = createClient();

  const [aperResp, setAperResp] = useState(c?.open_by ?? "");
  const [aperHora, setAperHora] = useState(c?.open_time?.slice(0, 5) ?? "");
  const [base, setBase] = useState(c?.base_amount != null ? String(c.base_amount) : "");
  const [remanenteRecibido, setRemanenteRecibido] = useState(c?.remnant_received != null ? String(c.remnant_received) : "");
  const [observaciones, setObservaciones] = useState(c?.observations ?? "");
  const [cierreResp, setCierreResp] = useState(c?.close_by ?? "");
  const [cierreHora, setCierreHora] = useState(c?.close_time?.slice(0, 5) ?? "");
  const [efectivo, setEfectivo] = useState(c?.cash_amount != null ? String(c.cash_amount) : "");
  const [tarjetas, setTarjetas] = useState(c?.card_amount != null ? String(c.card_amount) : "");
  const [remanenteAcum, setRemanenteAcum] = useState(c?.remnant_accumulated != null ? String(c.remnant_accumulated) : "");
  const [baseSiguiente, setBaseSiguiente] = useState(c?.next_base != null ? String(c.next_base) : "");
  const [ultimaMesa, setUltimaMesa] = useState(c?.last_table ?? "");
  const [revisado, setRevisado] = useState(c?.reviewed_by ?? "");
  const [savingApertura, setSavingApertura] = useState(false);
  const [savingCierre, setSavingCierre] = useState(false);
  const [toast, setToast] = useState<{ text: string; isError: boolean } | null>(null);

  function showToast(text: string, isError = false) {
    setToast({ text, isError });
    setTimeout(() => setToast(null), isError ? 4000 : 1800);
  }

  const [compraConcepto, setCompraConcepto] = useState("");
  const [compraValor, setCompraValor] = useState("");
  const [auxColaborador, setAuxColaborador] = useState("");
  const [auxValor, setAuxValor] = useState("");

  const totalVentas = (Number(efectivo) || 0) + (Number(tarjetas) || 0);
  const diferencia = totalVentas - ventasHoy;
  const comprasTotal = purchases.reduce((s, p) => s + p.amount, 0);
  const auxiliosTotal = transportAid.reduce((s, a) => s + a.amount, 0);

  async function ensureRow() {
    if (!c) await supabase.from("cash_register").upsert({ date });
  }

  // Upsert con solo las columnas de una sección: PostgREST arma el
  // ON CONFLICT DO UPDATE SET únicamente con las columnas del payload, así
  // que guardar la apertura no toca (ni borra) lo que ya haya en cierre, y
  // viceversa — cada botón guarda solo su sección.
  async function saveApertura() {
    setSavingApertura(true);
    try {
      const { error } = await supabase.from("cash_register").upsert({
        date,
        open_by: aperResp.trim() || null,
        open_time: aperHora || null,
        base_amount: base ? Number(base) : null,
        remnant_received: remanenteRecibido ? Number(remanenteRecibido) : null,
        observations: observaciones.trim() || null,
      });
      if (error) {
        showToast(`No se pudo guardar la apertura: ${error.message}`, true);
        return;
      }
      showToast("Apertura guardada ✓");
      onChanged();
    } finally {
      setSavingApertura(false);
    }
  }

  async function saveCierre() {
    setSavingCierre(true);
    try {
      const { error } = await supabase.from("cash_register").upsert({
        date,
        close_by: cierreResp.trim() || null,
        close_time: cierreHora || null,
        cash_amount: efectivo ? Number(efectivo) : null,
        card_amount: tarjetas ? Number(tarjetas) : null,
        remnant_accumulated: remanenteAcum ? Number(remanenteAcum) : null,
        next_base: baseSiguiente ? Number(baseSiguiente) : null,
        last_table: ultimaMesa.trim() || null,
        reviewed_by: revisado.trim() || null,
      });
      if (error) {
        showToast(`No se pudo guardar el cierre: ${error.message}`, true);
        return;
      }
      showToast("Cierre guardado ✓");
      onChanged();
    } finally {
      setSavingCierre(false);
    }
  }

  async function addCompra() {
    const valor = Number(compraValor);
    if (!compraConcepto.trim() || !valor || valor <= 0) return;
    await ensureRow();
    const { error } = await supabase.from("cash_register_purchases").insert({ date, concept: compraConcepto.trim(), amount: valor });
    if (error) {
      showToast(`No se pudo agregar la compra: ${error.message}`, true);
      return;
    }
    setCompraConcepto("");
    setCompraValor("");
    onChanged();
  }

  async function deleteCompra(id: number) {
    const { error } = await supabase.from("cash_register_purchases").delete().eq("id", id);
    if (error) {
      showToast(`No se pudo borrar la compra: ${error.message}`, true);
      return;
    }
    onChanged();
  }

  async function addAux() {
    const valor = Number(auxValor);
    if (!auxColaborador.trim() || !valor || valor <= 0) return;
    await ensureRow();
    const { error } = await supabase.from("cash_register_transport_aid").insert({ date, collaborator: auxColaborador.trim(), amount: valor });
    if (error) {
      showToast(`No se pudo agregar el auxilio: ${error.message}`, true);
      return;
    }
    setAuxColaborador("");
    setAuxValor("");
    onChanged();
  }

  async function deleteAux(id: number) {
    const { error } = await supabase.from("cash_register_transport_aid").delete().eq("id", id);
    if (error) {
      showToast(`No se pudo borrar el auxilio: ${error.message}`, true);
      return;
    }
    onChanged();
  }

  return (
    <>
      <Section title="Recibo de caja (apertura)">
        <div className="space-y-2.5 rounded-xl border border-border bg-surface p-3.5">
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            <div>
              <FieldLabel>Responsable</FieldLabel>
              <input value={aperResp} onChange={(e) => setAperResp(e.target.value)} list="cajaUserNames" placeholder="Ej: Nathaly D" className={inputCls} />
            </div>
            <div className="min-w-0">
              <FieldLabel>Hora</FieldLabel>
              <input type="time" value={aperHora} onChange={(e) => setAperHora(e.target.value)} className={inputCls} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <FieldLabel>Base de caja ($)</FieldLabel>
              <input type="number" value={base} onChange={(e) => setBase(e.target.value)} placeholder="Ej: 200000" className={inputCls} />
            </div>
            <div>
              <FieldLabel>Remanente recibido ($)</FieldLabel>
              <input
                type="number"
                value={remanenteRecibido}
                onChange={(e) => setRemanenteRecibido(e.target.value)}
                placeholder="Ej: 33200"
                className={inputCls}
              />
            </div>
          </div>
          <div>
            <FieldLabel>Observaciones</FieldLabel>
            <textarea
              value={observaciones}
              onChange={(e) => setObservaciones(e.target.value)}
              placeholder="Ej: no hay raid, no hay jabón para manos…"
              className={`${inputCls} min-h-[44px] font-normal`}
            />
          </div>
          <button
            onClick={saveApertura}
            disabled={savingApertura}
            className="w-full rounded-lg bg-gold py-2.5 text-[13px] font-bold text-[#1A140D] disabled:opacity-50"
          >
            {savingApertura ? "Guardando…" : "Guardar apertura de caja"}
          </button>
        </div>
      </Section>

      <Section title="Cierre de caja">
        <div className="space-y-2.5 rounded-xl border border-border bg-surface p-3.5">
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            <div>
              <FieldLabel>Responsable</FieldLabel>
              <input value={cierreResp} onChange={(e) => setCierreResp(e.target.value)} list="cajaUserNames" placeholder="Ej: Nathaly D" className={inputCls} />
            </div>
            <div className="min-w-0">
              <FieldLabel>Hora</FieldLabel>
              <input type="time" value={cierreHora} onChange={(e) => setCierreHora(e.target.value)} className={inputCls} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <FieldLabel>Pagos en efectivo del día ($)</FieldLabel>
              <input type="number" value={efectivo} onChange={(e) => setEfectivo(e.target.value)} placeholder="Ej: 91000" className={inputCls} />
            </div>
            <div>
              <FieldLabel>Pagos en tarjetas del día ($)</FieldLabel>
              <input type="number" value={tarjetas} onChange={(e) => setTarjetas(e.target.value)} placeholder="Ej: 1572396" className={inputCls} />
            </div>
          </div>
          <div className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-[11.5px]">
            <b>Total ventas (efectivo + tarjetas):</b> {fmtCOP(totalVentas)} &nbsp;·&nbsp; <b>Registrado en la app:</b> {fmtCOP(ventasHoy)}
          </div>

          <div className="mt-2 font-accent text-[15px]">Compras desde remanente</div>
          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <FieldLabel>Proveedor / Concepto</FieldLabel>
              <input value={compraConcepto} onChange={(e) => setCompraConcepto(e.target.value)} placeholder="Ej: Domicilios D1" className={inputCls} />
            </div>
            <div>
              <FieldLabel>Valor ($)</FieldLabel>
              <input type="number" value={compraValor} onChange={(e) => setCompraValor(e.target.value)} placeholder="Ej: 19800" className={inputCls} />
            </div>
          </div>
          <MiniButton onClick={addCompra}>+ Agregar compra</MiniButton>
          {purchases.length === 0 ? (
            <EmptyState text="Sin compras registradas." />
          ) : (
            <div className="space-y-1.5">
              {purchases.map((p) => (
                <div key={p.id} className="rounded-lg border border-border bg-surface-2 px-2.5 py-1.5 text-[11px]">
                  <div>{p.concept}</div>
                  <div className="mt-1 flex items-center justify-end gap-1.5">
                    <span className="font-mono">{fmtCOP(p.amount)}</span>
                    <MiniButton variant="danger" onClick={() => deleteCompra(p.id)}>
                      ✕
                    </MiniButton>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="mt-2 font-accent text-[15px]">Auxilios de transporte</div>
          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <FieldLabel>Colaborador</FieldLabel>
              <input value={auxColaborador} onChange={(e) => setAuxColaborador(e.target.value)} list="cajaUserNames" placeholder="Ej: María" className={inputCls} />
            </div>
            <div>
              <FieldLabel>Valor ($)</FieldLabel>
              <input type="number" value={auxValor} onChange={(e) => setAuxValor(e.target.value)} placeholder="Ej: 20000" className={inputCls} />
            </div>
          </div>
          <MiniButton onClick={addAux}>+ Agregar auxilio</MiniButton>
          {transportAid.length === 0 ? (
            <EmptyState text="Sin auxilios registrados." />
          ) : (
            <div className="space-y-1.5">
              {transportAid.map((a) => (
                <div key={a.id} className="rounded-lg border border-border bg-surface-2 px-2.5 py-1.5 text-[11px]">
                  <div>{a.collaborator}</div>
                  <div className="mt-1 flex items-center justify-end gap-1.5">
                    <span className="font-mono">{fmtCOP(a.amount)}</span>
                    <MiniButton variant="danger" onClick={() => deleteAux(a.id)}>
                      ✕
                    </MiniButton>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="mt-2 font-accent text-[15px]">Cierre</div>
          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <FieldLabel>Remanente acumulado ($)</FieldLabel>
              <input type="number" value={remanenteAcum} onChange={(e) => setRemanenteAcum(e.target.value)} className={inputCls} />
            </div>
            <div>
              <FieldLabel>Base para el siguiente turno ($)</FieldLabel>
              <input type="number" value={baseSiguiente} onChange={(e) => setBaseSiguiente(e.target.value)} className={inputCls} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <FieldLabel>Última mesa atendida</FieldLabel>
              <input value={ultimaMesa} onChange={(e) => setUltimaMesa(e.target.value)} className={inputCls} />
            </div>
            <div>
              <FieldLabel>Revisado por</FieldLabel>
              <input value={revisado} onChange={(e) => setRevisado(e.target.value)} list="cajaUserNames" className={inputCls} />
            </div>
          </div>

          <div className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-[11.5px]">
            <div>
              Compras desde remanente: <b>{fmtCOP(comprasTotal)}</b>
            </div>
            <div>
              Auxilios de transporte: <b>{fmtCOP(auxiliosTotal)}</b>
            </div>
            <div className={Math.abs(diferencia) <= 1000 ? "text-green" : "text-red"}>
              <b>
                Diferencia (caja vs. app): {diferencia >= 0 ? "+" : ""}
                {fmtCOP(diferencia)}
              </b>
            </div>
          </div>

          <button
            onClick={saveCierre}
            disabled={savingCierre}
            className="w-full rounded-lg bg-gold py-2.5 text-[13px] font-bold text-[#1A140D] disabled:opacity-50"
          >
            {savingCierre ? "Guardando…" : "Guardar cierre de caja"}
          </button>
        </div>
      </Section>

      {toast && (
        <div
          className={`fixed bottom-6 left-1/2 -translate-x-1/2 rounded-full px-5 py-2.5 text-[12.5px] font-bold shadow-lg ${
            toast.isError ? "bg-red text-white" : "bg-gold text-[#1A140D]"
          }`}
        >
          {toast.text}
        </div>
      )}
    </>
  );
}
