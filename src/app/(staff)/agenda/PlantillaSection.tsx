"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Section, FieldLabel, inputCls, MiniButton } from "@/components/panel-ui";
import type { WeekdayTemplate, ShiftScheduleTemplate, DefaultTask } from "./types";

const WEEKDAY_LABELS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
const WEEKDAY_SHORT = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

type Props = {
  weekdayTemplates: WeekdayTemplate[];
  shiftScheduleTemplates: ShiftScheduleTemplate[];
  defaultTasks: DefaultTask[];
  onChanged: () => void;
};

export function PlantillaSection({ weekdayTemplates, shiftScheduleTemplates, defaultTasks, onChanged }: Props) {
  const supabase = createClient();
  const todayWeekday = new Date().getDay();
  const [weekday, setWeekday] = useState(todayWeekday);
  const [saving, setSaving] = useState(false);

  const tpl = weekdayTemplates.find((t) => t.weekday === weekday) ?? null;
  const [start, setStart] = useState(tpl?.start_time?.slice(0, 5) ?? "");
  const [admon, setAdmon] = useState(tpl?.shift_admin ?? "");
  const [meta, setMeta] = useState(tpl?.daily_goal != null ? String(tpl.daily_goal) : "");
  const [promo, setPromo] = useState(tpl?.promo ?? "");
  const [evento, setEvento] = useState(tpl?.event ?? "");

  function pickWeekday(next: number) {
    const t = weekdayTemplates.find((x) => x.weekday === next) ?? null;
    setWeekday(next);
    setStart(t?.start_time?.slice(0, 5) ?? "");
    setAdmon(t?.shift_admin ?? "");
    setMeta(t?.daily_goal != null ? String(t.daily_goal) : "");
    setPromo(t?.promo ?? "");
    setEvento(t?.event ?? "");
  }

  async function saveTemplate() {
    setSaving(true);
    try {
      await supabase.from("weekday_templates").upsert({
        weekday,
        start_time: start || null,
        shift_admin: admon.trim() || null,
        daily_goal: meta ? Number(meta) : null,
        promo: promo.trim() || null,
        event: evento.trim() || null,
      });
      onChanged();
    } finally {
      setSaving(false);
    }
  }

  const slots = shiftScheduleTemplates.filter((s) => s.weekday === weekday);
  const [slotLabel, setSlotLabel] = useState("");
  const [slotType, setSlotType] = useState<"mesa" | "cocina">("mesa");
  const [slotSchedule, setSlotSchedule] = useState("");
  const [slotPerson, setSlotPerson] = useState("");
  const [savingSlot, setSavingSlot] = useState(false);

  async function addSlot() {
    if (!slotLabel.trim()) return;
    setSavingSlot(true);
    try {
      await supabase.from("shift_schedule_templates").insert({
        weekday,
        shift_type: slotType,
        slot_label: slotLabel.trim(),
        schedule_label: slotSchedule.trim() || null,
        default_person: slotPerson.trim() || null,
        sort_order: slots.length + 1,
      });
      setSlotLabel("");
      setSlotSchedule("");
      setSlotPerson("");
      onChanged();
    } finally {
      setSavingSlot(false);
    }
  }

  async function deleteSlot(id: string) {
    await supabase.from("shift_schedule_templates").delete().eq("id", id);
    onChanged();
  }

  async function updateSlotPerson(id: string, defaultPerson: string) {
    await supabase.from("shift_schedule_templates").update({ default_person: defaultPerson.trim() || null }).eq("id", id);
    onChanged();
  }

  const taskMesa = defaultTasks.find((t) => t.weekday === weekday && t.shift_type === "mesa") ?? null;
  const taskCocina = defaultTasks.find((t) => t.weekday === weekday && t.shift_type === "cocina") ?? null;
  const [tareaMesa, setTareaMesa] = useState(taskMesa?.task ?? "");
  const [auxMesa, setAuxMesa] = useState(taskMesa?.transport_aid ?? false);
  const [tareaCocina, setTareaCocina] = useState(taskCocina?.task ?? "");
  const [auxCocina, setAuxCocina] = useState(taskCocina?.transport_aid ?? false);
  const [savingAseo, setSavingAseo] = useState(false);

  function pickWeekdayAseo(next: number) {
    const tm = defaultTasks.find((t) => t.weekday === next && t.shift_type === "mesa") ?? null;
    const tc = defaultTasks.find((t) => t.weekday === next && t.shift_type === "cocina") ?? null;
    setTareaMesa(tm?.task ?? "");
    setAuxMesa(tm?.transport_aid ?? false);
    setTareaCocina(tc?.task ?? "");
    setAuxCocina(tc?.transport_aid ?? false);
  }

  async function saveAseo() {
    setSavingAseo(true);
    try {
      await Promise.all([
        supabase.from("default_weekday_tasks").upsert({ weekday, shift_type: "mesa", task: tareaMesa.trim() || "NA", transport_aid: auxMesa }),
        supabase.from("default_weekday_tasks").upsert({ weekday, shift_type: "cocina", task: tareaCocina.trim() || "NA", transport_aid: auxCocina }),
      ]);
      onChanged();
    } finally {
      setSavingAseo(false);
    }
  }

  return (
    <Section title="Plantilla semanal">
      <p className="mb-2.5 text-[11px] leading-relaxed text-text-faint">
        Valores predeterminados por día de semana. En días normales, usa &quot;Aplicar plantilla&quot; arriba en vez de llenar todo a mano —
        para un evento especial, visita de distrito, etc., edita el día directamente sin tocar esto.
      </p>
      <div className="mb-3 flex gap-1.5 overflow-x-auto pb-0.5">
        {WEEKDAY_SHORT.map((label, i) => (
          <button
            key={i}
            onClick={() => {
              pickWeekday(i);
              pickWeekdayAseo(i);
            }}
            className={`flex-none whitespace-nowrap rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold ${
              i === weekday ? "border-navy bg-navy text-white" : "border-border bg-surface text-text-dim"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="mb-3 space-y-2.5 rounded-xl border border-border bg-surface p-3.5">
        <div className="text-[12px] font-bold">{WEEKDAY_LABELS[weekday]} — Operación del día</div>
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          <div className="min-w-0 overflow-hidden">
            <FieldLabel>Inicio de operación</FieldLabel>
            <input type="time" value={start} onChange={(e) => setStart(e.target.value)} className={`${inputCls} min-w-0 appearance-none`} />
          </div>
          <div>
            <FieldLabel>Admin de turno</FieldLabel>
            <input value={admon} onChange={(e) => setAdmon(e.target.value)} placeholder="Ej: 1, 2, Cristian…" className={inputCls} />
          </div>
        </div>
        <div>
          <FieldLabel>Meta de venta ($)</FieldLabel>
          <input type="number" value={meta} onChange={(e) => setMeta(e.target.value)} placeholder="Ej: 950000" className={inputCls} />
        </div>
        <div>
          <FieldLabel>Promo</FieldLabel>
          <textarea value={promo} onChange={(e) => setPromo(e.target.value)} className={`${inputCls} min-h-[44px] font-normal`} />
        </div>
        <div>
          <FieldLabel>Evento / Sorteo / Partido (predeterminado)</FieldLabel>
          <input value={evento} onChange={(e) => setEvento(e.target.value)} placeholder="NA" className={inputCls} />
        </div>
        <button onClick={saveTemplate} disabled={saving} className="w-full rounded-lg bg-gold py-2.5 text-[13px] font-bold text-[#1A140D] disabled:opacity-50">
          {saving ? "Guardando…" : "Guardar predeterminado de este día"}
        </button>
      </div>

      <div className="mb-3 space-y-2.5 rounded-xl border border-border bg-surface p-3.5">
        <div className="text-[12px] font-bold">{WEEKDAY_LABELS[weekday]} — Aseo y auxilio de transporte</div>
        <div>
          <FieldLabel>Tarea de aseo — Mesas</FieldLabel>
          <input value={tareaMesa} onChange={(e) => setTareaMesa(e.target.value)} className={inputCls} />
        </div>
        <label className="flex items-center gap-2 text-[11.5px]">
          <input type="checkbox" checked={auxMesa} onChange={(e) => setAuxMesa(e.target.checked)} className="h-[16px] w-[16px] accent-gold" />
          Auxilio de transporte (mesas, después de 11pm)
        </label>
        <div>
          <FieldLabel>Tarea de aseo — Cocina</FieldLabel>
          <input value={tareaCocina} onChange={(e) => setTareaCocina(e.target.value)} className={inputCls} />
        </div>
        <label className="flex items-center gap-2 text-[11.5px]">
          <input type="checkbox" checked={auxCocina} onChange={(e) => setAuxCocina(e.target.checked)} className="h-[16px] w-[16px] accent-gold" />
          Auxilio de transporte (cocina, después de 11pm)
        </label>
        <button onClick={saveAseo} disabled={savingAseo} className="w-full rounded-lg bg-gold py-2.5 text-[13px] font-bold text-[#1A140D] disabled:opacity-50">
          {savingAseo ? "Guardando…" : "Guardar aseo/auxilio de este día"}
        </button>
      </div>

      <div className="space-y-2.5 rounded-xl border border-border bg-surface p-3.5">
        <div className="text-[12px] font-bold">{WEEKDAY_LABELS[weekday]} — Slots de turno (horario)</div>
        {slots.length === 0 ? (
          <p className="text-[11px] text-text-faint">Sin slots configurados para este día.</p>
        ) : (
          <div className="space-y-1.5">
            {slots.map((s) => (
              <SlotRow key={s.id} slot={s} onDelete={() => deleteSlot(s.id)} onSavePerson={(name) => updateSlotPerson(s.id, name)} />
            ))}
          </div>
        )}
        <div className="grid grid-cols-2 gap-2.5">
          <div>
            <FieldLabel>Nombre del slot</FieldLabel>
            <input value={slotLabel} onChange={(e) => setSlotLabel(e.target.value)} placeholder="Ej: Mesas 2" className={inputCls} />
          </div>
          <div>
            <FieldLabel>Tipo</FieldLabel>
            <select value={slotType} onChange={(e) => setSlotType(e.target.value as "mesa" | "cocina")} className={inputCls}>
              <option value="mesa">Mesa</option>
              <option value="cocina">Cocina</option>
            </select>
          </div>
        </div>
        <div>
          <FieldLabel>Persona sugerida (opcional — si siempre es la misma)</FieldLabel>
          <input value={slotPerson} onChange={(e) => setSlotPerson(e.target.value)} placeholder="Ej: Sol" className={inputCls} />
        </div>
        <div>
          <FieldLabel>Horario</FieldLabel>
          <input value={slotSchedule} onChange={(e) => setSlotSchedule(e.target.value)} placeholder="Ej: 19:00 A CIERRE" className={inputCls} />
        </div>
        <MiniButton onClick={addSlot} disabled={savingSlot || !slotLabel.trim()}>
          + Agregar slot
        </MiniButton>
      </div>
    </Section>
  );
}

function SlotRow({
  slot,
  onDelete,
  onSavePerson,
}: {
  slot: ShiftScheduleTemplate;
  onDelete: () => void;
  onSavePerson: (name: string) => void;
}) {
  const [person, setPerson] = useState(slot.default_person ?? "");

  return (
    <div className="flex items-center gap-2.5 rounded-lg border border-border bg-surface-2 px-2.5 py-2">
      <div className="min-w-0 flex-1 text-[11.5px]">
        <div className="font-bold">
          {slot.slot_label} <span className="font-mono text-[9px] uppercase text-text-faint">{slot.shift_type}</span>
        </div>
        {slot.schedule_label && <div className="text-[10.5px] text-text-dim">{slot.schedule_label}</div>}
        <input
          value={person}
          onChange={(e) => setPerson(e.target.value)}
          onBlur={() => person !== (slot.default_person ?? "") && onSavePerson(person)}
          placeholder="Persona sugerida"
          className="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1 text-[11px] text-text"
        />
      </div>
      <MiniButton variant="danger" onClick={onDelete}>
        ✕
      </MiniButton>
    </div>
  );
}
