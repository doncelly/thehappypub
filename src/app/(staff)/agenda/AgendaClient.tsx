"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { fmtCOP, mondayOf } from "@/lib/format";
import { Section, FieldLabel, inputCls } from "@/components/panel-ui";
import type {
  AgendaDay,
  WeeklyGoal,
  Shift,
  Attendance,
  Bonus,
  DefaultTask,
  MenuCategory,
  UserRow,
  ServiceRating,
  WeekdayTemplate,
  ShiftScheduleTemplate,
} from "./types";
import { TurnosSection } from "./TurnosSection";
import { AsistenciaSection } from "./AsistenciaSection";
import { CalificacionesSection } from "./CalificacionesSection";
import { PlantillaSection } from "./PlantillaSection";
import { generateAndSaveSchedulePdf } from "./schedule-pdf";

type Props = {
  date: string;
  currentUserName: string;
  agendaDay: AgendaDay;
  weeklyGoal: WeeklyGoal;
  shifts: Shift[];
  attendance: Attendance[];
  bonuses: Bonus[];
  defaultTasks: DefaultTask[];
  menuCategories: MenuCategory[];
  users: UserRow[];
  ventasHoy: number;
  ventasAyer: number;
  serviceRatings: ServiceRating[];
  weekdayTemplates: WeekdayTemplate[];
  shiftScheduleTemplates: ShiftScheduleTemplate[];
  weeklyPuntualidadByUser: Record<string, number>;
};

const WEEKDAY_LABELS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

function shiftDate(iso: string, delta: number): string {
  const d = new Date(iso + "T12:00:00");
  d.setDate(d.getDate() + delta);
  return d.toISOString().slice(0, 10);
}

export function AgendaClient(props: Props) {
  const { date, users } = props;
  const router = useRouter();
  const supabase = createClient();

  const weekday = new Date(date + "T12:00:00").getDay();
  const template = props.weekdayTemplates.find((t) => t.weekday === weekday) ?? null;
  const usingTemplate = !props.agendaDay && !!template;

  // Si el día no tiene datos guardados todavía, arranca con los valores de la
  // plantilla de ese día de semana en vez de vacío — así no hay que llenar
  // nada a mano en un día normal, solo revisar y "Guardar día". Si el día ya
  // tiene datos guardados (o es una excepción que ya se editó), esos mandan.
  const [start, setStart] = useState(props.agendaDay?.start_time?.slice(0, 5) ?? template?.start_time?.slice(0, 5) ?? "");
  const [admon, setAdmon] = useState(props.agendaDay?.shift_admin ?? template?.shift_admin ?? "");
  const [meta, setMeta] = useState(() => {
    const v = props.agendaDay?.daily_goal ?? template?.daily_goal;
    return v != null ? String(v) : "";
  });
  const [metaSemanal, setMetaSemanal] = useState(props.weeklyGoal?.goal != null ? String(props.weeklyGoal.goal) : "");
  const [promo, setPromo] = useState(props.agendaDay?.promo ?? template?.promo ?? "");
  const [descPct, setDescPct] = useState(props.agendaDay?.discount_pct != null ? String(props.agendaDay.discount_pct) : "");
  const [descCat, setDescCat] = useState(props.agendaDay?.discount_category ?? "todas");
  const [evento, setEvento] = useState(props.agendaDay?.event ?? template?.event ?? "");
  const [saving, setSaving] = useState(false);
  const [pdfStatus, setPdfStatus] = useState<string | null>(null);
  const [generatingPdf, setGeneratingPdf] = useState(false);

  function goTo(newDate: string) {
    router.push(`/agenda?date=${newDate}`);
  }

  async function onGenerateSchedulePdf() {
    setGeneratingPdf(true);
    setPdfStatus(null);
    try {
      const monday = mondayOf(date);
      const { error } = await generateAndSaveSchedulePdf(supabase, monday);
      setPdfStatus(error ? `No se pudo generar: ${error}` : "Horario guardado ✓ — ya lo pueden descargar en Mi día.");
    } finally {
      setGeneratingPdf(false);
    }
  }

  async function saveDay() {
    setSaving(true);
    try {
      const monday = mondayOf(date);
      await supabase.from("agenda_days").upsert({
        date,
        start_time: start || null,
        shift_admin: admon.trim() || null,
        daily_goal: meta ? Number(meta) : null,
        promo: promo.trim() || null,
        discount_pct: descPct ? Number(descPct) : null,
        discount_category: descPct ? descCat : null,
        event: evento.trim() || null,
      });
      if (metaSemanal) {
        await supabase.from("weekly_goals").upsert({ week_monday: monday, goal: Number(metaSemanal) });
      }
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="mb-3.5 flex items-center gap-2">
        <button
          onClick={() => goTo(shiftDate(date, -1))}
          className="h-8 w-8 flex-none rounded-lg border border-border bg-surface text-text-dim"
        >
          ‹
        </button>
        <input
          type="date"
          value={date}
          onChange={(e) => e.target.value && goTo(e.target.value)}
          className="min-w-0 flex-1 appearance-none rounded-lg border border-border bg-surface px-2.5 py-2 text-[12px] font-semibold text-text"
        />
        <button
          onClick={() => goTo(shiftDate(date, 1))}
          className="h-8 w-8 flex-none rounded-lg border border-border bg-surface text-text-dim"
        >
          ›
        </button>
      </div>

      <Section title="Operación del día">
        <div className="space-y-3 rounded-xl border border-border bg-surface p-3.5">
          {usingTemplate && (
            <div className="rounded-lg border border-gold/40 bg-gold/10 px-3 py-2 text-[11px] text-gold">
              📋 Prellenado con la plantilla de {WEEKDAY_LABELS[weekday]} — si es un evento especial, ajusta lo que cambie antes de
              guardar.
            </div>
          )}
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            <div className="min-w-0 overflow-hidden">
              <FieldLabel>Inicio de operación</FieldLabel>
              <input type="time" value={start} onChange={(e) => setStart(e.target.value)} className={`${inputCls} min-w-0 appearance-none`} />
            </div>
            <div>
              <FieldLabel>Admin de turno</FieldLabel>
              <input
                value={admon}
                onChange={(e) => setAdmon(e.target.value)}
                placeholder="Ej: 1, 2, Cristian…"
                className={inputCls}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <FieldLabel>Meta de venta diaria ($)</FieldLabel>
              <input
                type="number"
                value={meta}
                onChange={(e) => setMeta(e.target.value)}
                placeholder="Ej: 950000"
                className={inputCls}
              />
            </div>
            <div>
              <FieldLabel>Meta semanal (lun–dom, $)</FieldLabel>
              <input
                type="number"
                value={metaSemanal}
                onChange={(e) => setMetaSemanal(e.target.value)}
                placeholder="Ej: 6000000"
                className={inputCls}
              />
            </div>
          </div>
          <div>
            <FieldLabel>Promo del día</FieldLabel>
            <textarea
              value={promo}
              onChange={(e) => setPromo(e.target.value)}
              placeholder="Ej: Hamburguesa + cerveza artesanal gratis antes de 9pm"
              className={`${inputCls} min-h-[44px] font-normal`}
            />
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <FieldLabel>Descuento activo hoy (%)</FieldLabel>
              <input
                type="number"
                min={0}
                max={100}
                value={descPct}
                onChange={(e) => setDescPct(e.target.value)}
                placeholder="Ej: 15"
                className={inputCls}
              />
            </div>
            <div>
              <FieldLabel>Aplica a</FieldLabel>
              <select value={descCat} onChange={(e) => setDescCat(e.target.value)} className={inputCls}>
                <option value="todas">Todas las categorías</option>
                {props.menuCategories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <FieldLabel>Evento / Sorteo / Partido</FieldLabel>
            <input value={evento} onChange={(e) => setEvento(e.target.value)} placeholder="NA" className={inputCls} />
          </div>
          <button
            onClick={saveDay}
            disabled={saving}
            className="w-full rounded-lg bg-gold py-2.5 text-[13px] font-bold text-[#1A140D] disabled:opacity-50"
          >
            {saving ? "Guardando…" : "Guardar día"}
          </button>
          {props.ventasAyer > 0 && (
            <div className="text-[11px] text-text-dim">
              Ventas del día anterior (sistema): <b>{fmtCOP(props.ventasAyer)}</b>
            </div>
          )}
        </div>
      </Section>

      <TurnosSection
        date={date}
        shifts={props.shifts}
        defaultTasks={props.defaultTasks}
        shiftScheduleTemplates={props.shiftScheduleTemplates}
        users={users}
        onChanged={() => router.refresh()}
      />

      <Section title="Horario de la semana (PDF)">
        <div className="space-y-2.5 rounded-xl border border-border bg-surface p-3.5">
          <p className="text-[11px] leading-relaxed text-text-faint">
            Genera un PDF con los turnos ya asignados esta semana (lun-dom), más ventas y cumplimiento de meta día por día (hasta
            hoy), y lo guarda para que meseros y cocinera lo descarguen desde Mi día.
          </p>
          <button
            onClick={onGenerateSchedulePdf}
            disabled={generatingPdf}
            className="w-full rounded-lg bg-gold py-2.5 text-[13px] font-bold text-[#1A140D] disabled:opacity-50"
          >
            {generatingPdf ? "Generando…" : "📄 Generar y guardar horario semanal"}
          </button>
          {pdfStatus && <p className="text-[11px] text-text-dim">{pdfStatus}</p>}
        </div>
      </Section>

      <AsistenciaSection date={date} attendance={props.attendance} users={users} onChanged={() => router.refresh()} />

      <CalificacionesSection
        date={date}
        shifts={props.shifts}
        bonuses={props.bonuses}
        users={users}
        attendance={props.attendance}
        dailyGoal={props.agendaDay?.daily_goal ?? null}
        ventasHoy={props.ventasHoy}
        serviceRatings={props.serviceRatings}
        weeklyPuntualidadByUser={props.weeklyPuntualidadByUser}
        onChanged={() => router.refresh()}
      />

      <PlantillaSection
        weekdayTemplates={props.weekdayTemplates}
        shiftScheduleTemplates={props.shiftScheduleTemplates}
        defaultTasks={props.defaultTasks}
        onChanged={() => router.refresh()}
      />
    </div>
  );
}
