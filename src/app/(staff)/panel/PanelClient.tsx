"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { normalizeStatus, isCriticalItem, type RawItemStatus, type ItemStatus } from "@/lib/inventory-status";
import { levelOf, type StatusGaugeKey } from "@/lib/constants/status-levels";
import { fmtCOP, fmtDateShort, fmtDateLabel, fmtHM, fmtQty, fmtRelTime, bogotaDateOf } from "@/lib/format";
import { Section, EmptyState, Row, MiniButton } from "@/components/panel-ui";
import { APERTURA_ITEMS, CIERRE_ITEMS, allChecked } from "@/lib/constants/checklist-areas";
import { generateWeeklyReportPdf, exportCajaCsv } from "./reports";

type CategoryRow = { id: string; label: string; domain: string; sort_order: number };

type RawItemRow = {
  id: string;
  name: string;
  category: string;
  mode: "gauge" | "qty";
  unit: string | null;
  step: number | null;
  min: number | null;
  item_status: RawItemStatus;
};
type ItemRow = Omit<RawItemRow, "item_status"> & { item_status: ItemStatus };

type AttendanceRow = { user_id: string; work_type: "mesero" | "cocinero" | "administracion"; check_in: string | null; check_out: string | null };
type OrderRow = { id: string; table_label: string; total: number; created_at: string; user_id: string };
type PairWatch = { id: number; label: string; item_a: string; item_b: string; sort_order: number };
type StockHistoryRow = { item_id: string; date: string; qty: number };
type ShiftRow = {
  id: string;
  person_name: string;
  user_id: string | null;
  area: string | null;
  schedule_label: string | null;
  shift_type: "mesa" | "cocina";
  cleaning_task: string | null;
  done: boolean;
};
type ChecklistRow = { user_id: string; section: string; done: boolean; areas: Record<string, Record<string, boolean>> };
type ActivityRow = { id: number; message: string; color: string; created_at: string };

type Props = {
  today: string;
  monday: string;
  weekDays: string[];
  categories: CategoryRow[];
  initialItems: RawItemRow[];
  initialAttendance: AttendanceRow[];
  dailyGoal: number | null;
  weeklyGoal: number | null;
  initialOrders: OrderRow[];
  pairWatches: PairWatch[];
  stockHistoryWeek: StockHistoryRow[];
  shiftsToday: ShiftRow[];
  checklistToday: ChecklistRow[];
  initialActivity: ActivityRow[];
  users: { id: string; name: string }[];
  currentUserName: string;
  monthlyGoal: number | null;
  ventasMes: number;
  cajaAyerDiferencia: number | null;
  reportsByYear: Record<string, { date: string; url: string }[]>;
};


export function PanelClient(props: Props) {
  const { categories, weekDays, users, currentUserName } = props;
  const supabase = useMemo(() => createClient(), []);
  const usersById = useMemo(() => Object.fromEntries(users.map((u) => [u.id, u.name])), [users]);

  const [items, setItems] = useState<ItemRow[]>(() =>
    props.initialItems.map((it) => ({ ...it, item_status: normalizeStatus(it.item_status, usersById) })),
  );
  const [attendance, setAttendance] = useState<AttendanceRow[]>(props.initialAttendance);
  const [orders, setOrders] = useState<OrderRow[]>(props.initialOrders);
  const [activity, setActivity] = useState<ActivityRow[]>(props.initialActivity);
  const [stockFilter, setStockFilter] = useState<string>(() => {
    const firstQtyCat = categories.find((c) => props.initialItems.some((it) => it.category === c.id && it.mode === "qty"));
    return firstQtyCat?.id ?? "";
  });
  const [reportToast, setReportToast] = useState<string | null>(null);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [exportingCsv, setExportingCsv] = useState(false);
  const [monthlyGoalInput, setMonthlyGoalInput] = useState(props.monthlyGoal != null ? String(props.monthlyGoal) : "");
  const [savingMonthlyGoal, setSavingMonthlyGoal] = useState(false);

  async function saveMonthlyGoal() {
    setSavingMonthlyGoal(true);
    try {
      await supabase.from("monthly_goal_settings").update({ min_goal: Number(monthlyGoalInput) || 0 }).eq("id", 1);
      showReportToast("Meta mensual guardada ✓");
    } finally {
      setSavingMonthlyGoal(false);
    }
  }
  const [uploadingDrive, setUploadingDrive] = useState(false);

  function showReportToast(msg: string) {
    setReportToast(msg);
    setTimeout(() => setReportToast(null), 2200);
  }

  async function onDownloadWeeklyPdf() {
    setGeneratingPdf(true);
    showReportToast("Generando PDF…");
    try {
      await generateWeeklyReportPdf(supabase, props.today);
      showReportToast("PDF descargado — revisa la carpeta de Descargas ✓");
    } catch {
      showReportToast("No se pudo generar el PDF");
    } finally {
      setGeneratingPdf(false);
    }
  }

  async function onExportCajaCsv() {
    setExportingCsv(true);
    try {
      const ok = await exportCajaCsv(supabase, props.today);
      showReportToast(ok ? "CSV descargado ✓" : "No hay cierres de caja registrados en los últimos 7 días");
    } catch {
      showReportToast("No se pudo generar el CSV");
    } finally {
      setExportingCsv(false);
    }
  }

  async function onSyncCajaSheet() {
    setUploadingDrive(true);
    showReportToast("Actualizando hoja de cierres…");
    try {
      const res = await fetch("/api/drive/sync-caja-sheet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: props.today }),
      });
      const data = await res.json();
      showReportToast(res.ok ? `Pestaña ${data.tab} actualizada ✓` : data.error || "No se pudo actualizar la hoja");
    } catch {
      showReportToast("No se pudo actualizar la hoja de cierres");
    } finally {
      setUploadingDrive(false);
    }
  }

  // Realtime: reemplaza el polling de 3s para las partes que más cambian en
  // vivo. Metas, turnos, checklist y stock semanal se recargan al navegar —
  // cambian pocas veces al día, no necesitan su propio canal.
  useEffect(() => {
    const channel = supabase
      .channel("panel-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "item_status" }, (payload) => {
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
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "attendance" }, (payload) => {
        const row = payload.new as AttendanceRow & { date: string };
        if (row.date !== props.today) return;
        // Filtra por user_id + work_type (no solo user_id): un jefe puede
        // tener turno de mesero Y de administración el mismo día — un evento
        // de uno no debe borrar el registro del otro.
        setAttendance((prev) => {
          const rest = prev.filter((a) => !(a.user_id === row.user_id && a.work_type === row.work_type));
          return [...rest, { user_id: row.user_id, work_type: row.work_type, check_in: row.check_in, check_out: row.check_out }];
        });
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "orders" }, (payload) => {
        const row = payload.new as OrderRow;
        setOrders((prev) => [row, ...prev]);
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "orders" }, (payload) => {
        const row = payload.new as OrderRow;
        setOrders((prev) => prev.map((o) => (o.id === row.id ? row : o)));
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "activity_log" }, (payload) => {
        const row = payload.new as ActivityRow;
        setActivity((prev) => [row, ...prev].slice(0, 15));
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, usersById, props.today]);

  // ---- inventario: críticos / ok / % aprovisionado / faltantes ----
  const { criticalCount, okCount, aprovPct, faltantes } = useMemo(() => {
    let critical = 0;
    const missing: ItemRow[] = [];
    for (const it of items) {
      if (isCriticalItem(it.mode, it.min, it.item_status)) {
        critical++;
        missing.push(it);
      }
    }
    const total = items.length || 1;
    return {
      criticalCount: critical,
      okCount: items.length - critical,
      aprovPct: Math.round(((items.length - critical) / total) * 100),
      faltantes: missing,
    };
  }, [items]);

  // ---- personal en sitio ahora ----
  const personalEnSitio = attendance
    .filter((a) => a.check_in && !a.check_out)
    .map((a) => ({ name: usersById[a.user_id] ?? "—", since: a.check_in }));

  // ---- ventas hoy / semana ----
  const ventasHoy = orders.filter((o) => bogotaDateOf(o.created_at) === props.today).reduce((s, o) => s + o.total, 0);
  const ventasSemana = orders.reduce((s, o) => s + o.total, 0);

  // ---- pares a vigilar ----
  const qtyByItemId = useMemo(() => {
    const map: Record<string, number> = {};
    for (const it of items) if (it.mode === "qty") map[it.id] = it.item_status.qty ?? 0;
    return map;
  }, [items]);
  const itemNameById = useMemo(() => Object.fromEntries(items.map((it) => [it.id, it.name])), [items]);

  // ---- resumen del equipo hoy ----
  const attendanceByUser = useMemo(() => Object.fromEntries(attendance.map((a) => [a.user_id, a])), [attendance]);
  const checklistByUser = useMemo(() => {
    const map: Record<string, ChecklistRow[]> = {};
    for (const c of props.checklistToday) (map[c.user_id] ??= []).push(c);
    return map;
  }, [props.checklistToday]);
  const staffToday = props.shiftsToday
    .map((t) => {
      const uid = t.user_id ?? users.find((u) => u.name.trim().toLowerCase() === t.person_name.trim().toLowerCase())?.id;
      if (!uid) return null;
      const asist = attendanceByUser[uid];
      const cl = checklistByUser[uid] ?? [];
      let clDone = 0;
      const alistamiento = cl.find((c) => c.section === "alistamiento");
      const inventario = cl.find((c) => c.section === "inventario");
      const apertura = cl.find((c) => c.section === "apertura");
      const cierre = cl.find((c) => c.section === "cierre");
      if (alistamiento?.done) clDone++;
      if (inventario?.done) clDone++;
      // Cocina no ve "Apertura/Cierre por áreas" en /checklist (esas áreas son
      // de sala/terraza/barra) — para esos turnos el total es 2, no 4.
      const clTotal = t.shift_type === "cocina" ? 2 : 4;
      if (clTotal === 4) {
        if (apertura && allChecked(APERTURA_ITEMS, apertura.areas ?? {})) clDone++;
        if (cierre && allChecked(CIERRE_ITEMS, cierre.areas ?? {})) clDone++;
      }
      return { turno: t, name: usersById[uid] ?? t.person_name, asist, clDone, clTotal };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  // ---- stock semanal (solo categorías con items por cantidad) ----
  const qtyCategories = categories.filter((c) => props.initialItems.some((it) => it.category === c.id && it.mode === "qty"));
  const stockByItemDate = useMemo(() => {
    const map: Record<string, Record<string, number>> = {};
    for (const row of props.stockHistoryWeek) {
      (map[row.item_id] ??= {})[row.date] = row.qty;
    }
    return map;
  }, [props.stockHistoryWeek]);
  const stockItems = props.initialItems.filter((it) => it.mode === "qty" && it.category === stockFilter);

  const descuadreAyer = props.cajaAyerDiferencia != null && Math.abs(props.cajaAyerDiferencia) > 1000 ? props.cajaAyerDiferencia : null;

  return (
    <div>
      {descuadreAyer != null && (
        <div className="mb-3.5 rounded-xl border border-red/40 bg-red/10 px-3 py-2.5 text-[11.5px] leading-relaxed text-red">
          ⚠️ <b>Descuadre en la caja de ayer:</b> {descuadreAyer >= 0 ? "sobran" : "faltan"} {fmtCOP(Math.abs(descuadreAyer))}{" "}
          (efectivo + tarjetas contados vs. ventas registradas en la app).
        </div>
      )}

      <Section title="Personal en sitio ahora">
        {personalEnSitio.length === 0 ? (
          <EmptyState text="Nadie marcado como presente ahora mismo." />
        ) : (
          <div className="grid grid-cols-1 gap-1.5 lg:grid-cols-2 xl:grid-cols-3">
            {personalEnSitio.map((p, i) => (
              <Row key={i} left={`🟢 ${p.name}`} right={`desde ${fmtHM(p.since)}`} />
            ))}
          </div>
        )}
      </Section>

      <Section title="Meta de ventas">
        <div className="space-y-3 rounded-xl border border-amber/30 bg-gradient-to-br from-amber/10 to-orange/5 p-3.5">
          {props.dailyGoal ? (
            <GoalBar label="Hoy" current={ventasHoy} goal={props.dailyGoal} />
          ) : (
            <div className="text-[11.5px] text-text-dim">Sin meta de hoy — defínela en Agenda.</div>
          )}
          {props.weeklyGoal ? (
            <GoalBar label="Semana (lun–dom)" current={ventasSemana} goal={props.weeklyGoal} />
          ) : (
            <div className="text-[11.5px] text-text-dim">Sin meta semanal — defínela en Agenda.</div>
          )}
          {props.monthlyGoal && <GoalBar label="Mes (mínimo para no estar en rojos)" current={props.ventasMes} goal={props.monthlyGoal} />}
          <div className="flex items-center gap-1.5 border-t border-border/50 pt-2.5">
            <input
              type="number"
              value={monthlyGoalInput}
              onChange={(e) => setMonthlyGoalInput(e.target.value)}
              placeholder="Ej: 19000000"
              className="w-full min-w-0 rounded-lg border border-border bg-surface-2 px-2.5 py-1.5 text-[12px] font-semibold text-text"
            />
            <MiniButton onClick={saveMonthlyGoal} disabled={savingMonthlyGoal}>
              Guardar meta mensual
            </MiniButton>
          </div>
        </div>
      </Section>

      <div className="mb-4 grid grid-cols-3 gap-2">
        <SummaryCard num={criticalCount} label="Bajo mínimo" alert />
        <SummaryCard num={okCount} label="En buen nivel" />
        <SummaryCard num={`${aprovPct}%`} label="Aprovisionado" />
      </div>

      <Section title="Barra y Cocina — qué hay">
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <BarraOcinaList title="🍺 Barra" items={items.filter((it) => it.category === "barra")} />
          <BarraOcinaList title="🍳 Cocina" items={items.filter((it) => it.category === "cocina")} />
        </div>
      </Section>

      <Section title="Productos que faltan">
        {faltantes.length === 0 ? (
          <EmptyState text="Todo por encima del mínimo — nada falta ahora mismo." />
        ) : (
          <div className="grid grid-cols-1 gap-1.5 lg:grid-cols-2 xl:grid-cols-3">
            {faltantes.map((it) => (
              <Row
                key={it.id}
                left={it.name}
                right={it.mode === "gauge" ? levelOf(it.item_status.status_gauge).label : fmtQty(it.unit ?? "", it.item_status.qty ?? 0)}
                rightClass="text-red"
              />
            ))}
          </div>
        )}
      </Section>

      <Section title="Resumen del equipo hoy">
        {staffToday.length === 0 ? (
          <EmptyState text="Nadie programado hoy todavía — agrégalos en Agenda." />
        ) : (
          <div className="grid grid-cols-1 gap-1.5 lg:grid-cols-2 xl:grid-cols-3">
            {staffToday.map(({ turno, name, asist, clDone, clTotal }) => {
              const label = !asist?.check_in ? "⏳ sin llegar" : `✓ ${fmtHM(asist.check_in)}`;
              const aseo = turno.cleaning_task ? (turno.done ? "🧽 ✓" : "🧽 ⏳") : "";
              return (
                <Row key={turno.id} left={`${name} ${aseo}`} right={`${label} · Checklist ${clDone}/${clTotal}`} />
              );
            })}
          </div>
        )}
      </Section>

      <Section title="Pares a vigilar">
        <div className="grid grid-cols-1 gap-2 lg:grid-cols-2 xl:grid-cols-3">
          {props.pairWatches.map((p) => {
            const a = qtyByItemId[p.item_a] ?? 0;
            const b = qtyByItemId[p.item_b] ?? 0;
            const match = a === b;
            return (
              <div key={p.id} className="rounded-xl border border-border bg-surface p-2.5">
                <div className="mb-1.5 text-[11px] text-text-dim">{p.label}</div>
                <div className="flex items-center gap-2.5">
                  <div>
                    <div className={`font-display text-lg font-bold ${match ? "text-green" : "text-red"}`}>{a}</div>
                    <div className="text-[9.5px] text-text-faint">{itemNameById[p.item_a] ?? p.item_a}</div>
                  </div>
                  <div className="text-[13px] text-text-faint">{match ? "=" : "⚠️ ≠"}</div>
                  <div>
                    <div className={`font-display text-lg font-bold ${match ? "text-green" : "text-red"}`}>{b}</div>
                    <div className="text-[9.5px] text-text-faint">{itemNameById[p.item_b] ?? p.item_b}</div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </Section>

      <Section title="Pedidos recientes">
        {orders.length === 0 ? (
          <EmptyState text="Todavía no se han registrado pedidos." />
        ) : (
          <div className="grid grid-cols-1 gap-1.5 lg:grid-cols-2 xl:grid-cols-3">
            {orders.slice(0, 8).map((o) => (
              <div key={o.id} className="rounded-xl border border-border bg-surface p-2.5">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[12px] font-bold">Mesa {o.table_label}</span>
                  <span className="font-mono text-[11.5px] text-gold">{fmtCOP(o.total)}</span>
                </div>
                <div className="mt-1 text-[10px] text-text-faint">
                  {usersById[o.user_id] ?? "—"} · {fmtRelTime(o.created_at)}
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title="Stock semanal">
        <p className="mb-2 text-[11px] text-text-faint">
          Semana de lunes a domingo. Solo productos por cantidad.
        </p>
        <div className="mb-2.5 flex gap-1.5 overflow-x-auto pb-0.5">
          {qtyCategories.map((c) => (
            <button
              key={c.id}
              onClick={() => setStockFilter(c.id)}
              className={`flex-none whitespace-nowrap rounded-full border px-2.5 py-1 text-[10.5px] font-semibold ${
                c.id === stockFilter ? "border-gold bg-gold text-[#1A140D]" : "border-border bg-surface text-text-dim"
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full border-collapse text-[11px]">
            <thead>
              <tr>
                <th className="whitespace-nowrap border-b border-border px-2 py-1.5 text-left font-mono text-[9px] uppercase text-text-faint">
                  Producto
                </th>
                {weekDays.map((d) => (
                  <th key={d} className="whitespace-nowrap border-b border-border px-2 py-1.5 text-left font-mono text-[9px] uppercase text-text-faint">
                    {fmtDateShort(d)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {stockItems.map((it) => (
                <tr key={it.id}>
                  <td className="whitespace-nowrap border-b border-border px-2 py-1.5">{it.name}</td>
                  {weekDays.map((d) => (
                    <td key={d} className="whitespace-nowrap border-b border-border px-2 py-1.5 text-text-dim">
                      {stockByItemDate[it.id]?.[d] ?? "—"}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="Actividad reciente">
        {activity.length === 0 ? (
          <EmptyState text="Todavía no hay actividad reportada." />
        ) : (
          <div>
            {activity.map((a) => (
              <div key={a.id} className="flex gap-2.5 border-b border-border py-2 last:border-0">
                <div className="mt-1.5 h-[7px] w-[7px] flex-none rounded-full" style={{ backgroundColor: a.color }} />
                <div>
                  <div className="text-[11.5px]">{a.message}</div>
                  <div className="mt-0.5 font-mono text-[9px] text-text-faint">{fmtRelTime(a.created_at)}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title="Reporte semanal">
        <div className="space-y-2.5 rounded-xl border border-border bg-surface p-3.5">
          <p className="text-[11px] leading-relaxed text-text-faint">
            Genera un PDF con asistencia, cumplimiento de meta, bonificaciones y pérdidas de los últimos 7 días. Se
            descarga a la carpeta de Descargas de tu navegador y también queda guardado abajo, agrupado por año.
          </p>
          <button
            onClick={onDownloadWeeklyPdf}
            disabled={generatingPdf}
            className="w-full rounded-lg bg-gold py-2.5 text-[13px] font-bold text-[#1A140D] disabled:opacity-50"
          >
            {generatingPdf ? "Generando…" : "📄 Descargar PDF de la semana"}
          </button>
          <button
            onClick={onExportCajaCsv}
            disabled={exportingCsv}
            className="w-full rounded-lg border border-border bg-surface-2 py-2.5 text-[13px] font-bold text-text disabled:opacity-50"
          >
            {exportingCsv ? "Exportando…" : "📊 Exportar cierres de caja a CSV"}
          </button>
          <button
            onClick={onSyncCajaSheet}
            disabled={uploadingDrive}
            className="w-full rounded-lg border border-border bg-surface-2 py-2.5 text-[13px] font-bold text-text disabled:opacity-50"
          >
            {uploadingDrive ? "Actualizando…" : "☁️ Actualizar hoja de cierres en Drive"}
          </button>
          <p className="text-[11px] text-text-faint">
            Escribe directamente en la pestaña de la fecha de hoy en tu hoja de cálculo de cierres (la crea
            duplicando la plantilla si todavía no existe) — necesita que el jefe haya configurado la cuenta de
            servicio de Google, ver GOOGLE_DRIVE_SETUP.md. Si no está lista, siempre puedes exportar el CSV y
            subirlo tú mismo.
          </p>

          {Object.keys(props.reportsByYear).length > 0 && (
            <div className="space-y-1.5 border-t border-border pt-2.5">
              <p className="text-[11px] font-bold text-text-dim">Reportes semanales guardados</p>
              {Object.entries(props.reportsByYear)
                .sort(([a], [b]) => (a < b ? 1 : -1))
                .map(([year, reports]) => (
                  <details key={year} className="rounded-lg border border-border bg-surface-2 px-2.5 py-1.5">
                    <summary className="cursor-pointer text-[12px] font-semibold">
                      {year} ({reports.length})
                    </summary>
                    <div className="mt-1.5 space-y-1">
                      {reports.map((r) => (
                        <a
                          key={r.date}
                          href={r.url}
                          target="_blank"
                          rel="noreferrer"
                          className="block text-[11.5px] text-gold underline"
                        >
                          📄 {fmtDateLabel(r.date)}
                        </a>
                      ))}
                    </div>
                  </details>
                ))}
            </div>
          )}
        </div>
      </Section>

      <p className="mt-1 text-center text-[10.5px] text-text-faint">Hola, {currentUserName} 👋</p>

      {reportToast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 rounded-full bg-gold px-5 py-2.5 text-[12.5px] font-bold text-[#1A140D] shadow-lg">
          {reportToast}
        </div>
      )}
    </div>
  );
}

function SummaryCard({ num, label, alert }: { num: number | string; label: string; alert?: boolean }) {
  return (
    <div className="rounded-xl border border-border bg-surface px-2 py-3 text-center">
      <div className={`font-display text-xl font-bold ${alert ? "text-red" : "text-gold"}`}>{num}</div>
      <div className="mt-0.5 font-mono text-[9px] uppercase tracking-wide text-text-faint">{label}</div>
    </div>
  );
}

// Estado completo de una categoría (no solo lo crítico, como "Productos que
// faltan") — para saber de un vistazo qué hay en Barra o en Cocina.
function BarraOcinaList({ title, items }: { title: string; items: ItemRow[] }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-3">
      <div className="mb-2 text-[12px] font-bold">{title}</div>
      {items.length === 0 ? (
        <p className="text-[11px] text-text-faint">Sin productos en esta categoría.</p>
      ) : (
        <div className="space-y-1">
          {items.map((it) => {
            const critical = isCriticalItem(it.mode, it.min, it.item_status);
            const value = it.mode === "gauge" ? levelOf(it.item_status.status_gauge).label : fmtQty(it.unit ?? "", it.item_status.qty ?? 0);
            return (
              <div key={it.id} className="flex items-baseline justify-between gap-2 text-[11px]">
                <span className="min-w-0 truncate">{it.name}</span>
                <span className={`flex-none font-mono ${critical ? "text-red" : "text-text-dim"}`}>{value}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function GoalBar({ label, current, goal }: { label: string; current: number; goal: number }) {
  const pct = Math.min(100, Math.round((current / goal) * 100));
  return (
    <div>
      <div className="text-[11.5px]">
        <b>{label}:</b> {fmtCOP(current)} / {fmtCOP(goal)}
      </div>
      <div className="mt-1.5 h-[9px] overflow-hidden rounded-md border border-border bg-surface-2">
        <div className="h-full rounded-md bg-gradient-to-r from-navy to-gold" style={{ width: `${pct}%` }} />
      </div>
      <div className="mt-1 text-[11px] text-text-dim">{pct}% cumplido</div>
    </div>
  );
}
