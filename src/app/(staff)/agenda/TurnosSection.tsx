"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Section, EmptyState, FieldLabel, inputCls, MiniButton } from "@/components/panel-ui";
import type { Shift, DefaultTask, UserRow } from "./types";

type Props = {
  date: string;
  shifts: Shift[];
  defaultTasks: DefaultTask[];
  users: UserRow[];
  onChanged: () => void;
};

export function TurnosSection({ date, shifts, defaultTasks, users, onChanged }: Props) {
  const supabase = createClient();
  const weekday = new Date(date + "T12:00:00").getDay();

  const [person, setPerson] = useState("");
  const [area, setArea] = useState("");
  const [horario, setHorario] = useState("");
  const [tipo, setTipo] = useState<"mesa" | "cocina">("mesa");
  const [tarea, setTarea] = useState(() => defaultTasks.find((t) => t.weekday === weekday && t.shift_type === "mesa")?.task ?? "");
  const [saving, setSaving] = useState(false);

  function onTipoChange(next: "mesa" | "cocina") {
    setTipo(next);
    setTarea(defaultTasks.find((t) => t.weekday === weekday && t.shift_type === next)?.task ?? "");
  }

  async function addTurno() {
    if (!person.trim()) return;
    setSaving(true);
    try {
      const matchedUser = users.find((u) => u.name.trim().toLowerCase() === person.trim().toLowerCase());
      await supabase.from("shifts").insert({
        date,
        person_name: person.trim(),
        user_id: matchedUser?.id ?? null,
        area: area.trim() || null,
        schedule_label: horario.trim() || null,
        shift_type: tipo,
        cleaning_task: tarea.trim() || null,
      });
      setPerson("");
      setArea("");
      setHorario("");
      onChanged();
    } finally {
      setSaving(false);
    }
  }

  async function toggleDone(id: string, done: boolean) {
    await supabase.from("shifts").update({ done }).eq("id", id);
    onChanged();
  }

  async function deleteTurno(id: string) {
    await supabase.from("shifts").delete().eq("id", id);
    onChanged();
  }

  return (
    <Section title="Turnos y aseo">
      {shifts.length === 0 ? (
        <EmptyState text="Sin turnos agregados para este día." />
      ) : (
        <div className="mb-3 space-y-1.5">
          {shifts.map((t) => (
            <div key={t.id} className="flex items-start gap-2.5 rounded-lg border border-border bg-surface-2 px-2.5 py-2">
              <input
                type="checkbox"
                checked={t.done}
                onChange={(e) => toggleDone(t.id, e.target.checked)}
                className="mt-0.5 h-[18px] w-[18px] flex-none accent-gold"
              />
              <div className="min-w-0 flex-1 text-[11.5px]">
                <div className="font-bold">
                  {t.person_name}
                  {t.area ? ` · ${t.area}` : ""}
                </div>
                {t.schedule_label && <div className="mt-0.5 text-[10.5px] text-text-dim">{t.schedule_label}</div>}
                {t.cleaning_task && (
                  <div className={`mt-0.5 text-[10.5px] ${t.done ? "text-green line-through" : "text-amber"}`}>
                    🧽 {t.cleaning_task}
                  </div>
                )}
              </div>
              <MiniButton variant="danger" onClick={() => deleteTurno(t.id)}>
                ✕
              </MiniButton>
            </div>
          ))}
        </div>
      )}

      <div className="space-y-2.5 rounded-xl border border-border bg-surface p-3.5">
        <div className="grid grid-cols-2 gap-2.5">
          <div>
            <FieldLabel>Persona</FieldLabel>
            <input
              value={person}
              onChange={(e) => setPerson(e.target.value)}
              list="agendaUserNames"
              placeholder="Ej: Erika"
              className={inputCls}
            />
            <datalist id="agendaUserNames">
              {users.map((u) => (
                <option key={u.id} value={u.name} />
              ))}
            </datalist>
          </div>
          <div>
            <FieldLabel>Área</FieldLabel>
            <input value={area} onChange={(e) => setArea(e.target.value)} placeholder="Ej: Cocina, Mesera 1…" className={inputCls} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          <div>
            <FieldLabel>Horario</FieldLabel>
            <input value={horario} onChange={(e) => setHorario(e.target.value)} placeholder="Ej: 15:00 A CIERRE" className={inputCls} />
          </div>
          <div>
            <FieldLabel>Tipo (para sugerir aseo)</FieldLabel>
            <select value={tipo} onChange={(e) => onTipoChange(e.target.value as "mesa" | "cocina")} className={inputCls}>
              <option value="mesa">Mesa</option>
              <option value="cocina">Cocina</option>
            </select>
          </div>
        </div>
        <div>
          <FieldLabel>Tarea de aseo</FieldLabel>
          <input value={tarea} onChange={(e) => setTarea(e.target.value)} placeholder="Ej: Ventanas" className={inputCls} />
        </div>
        <button
          onClick={addTurno}
          disabled={saving || !person.trim()}
          className="w-full rounded-lg bg-gold py-2.5 text-[13px] font-bold text-[#1A140D] disabled:opacity-50"
        >
          Agregar turno
        </button>
      </div>
    </Section>
  );
}
