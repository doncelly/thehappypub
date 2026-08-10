"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Section, EmptyState, FieldLabel, inputCls, MiniButton } from "@/components/panel-ui";
import type { Attendance, UserRow, WorkType } from "./types";

type Props = {
  date: string;
  attendance: Attendance[];
  users: UserRow[];
  onChanged: () => void;
};

const WORK_TYPE_LABEL: Record<WorkType, string> = { mesero: "Mesero", cocinero: "Cocinero", administracion: "Administración" };

function tsToTimeInput(ts: string | null): string {
  if (!ts) return "";
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function timeInputToTs(dateISO: string, hhmm: string): string | null {
  if (!hhmm) return null;
  const [h, m] = hhmm.split(":").map(Number);
  const d = new Date(dateISO + "T12:00:00");
  d.setHours(h, m, 0, 0);
  return d.toISOString();
}

// Para un mesero/cocinero el work_type siempre es su subrol. Para un jefe (que
// puede cubrir turno de mesero o de administración — el original no distinguía
// esto, es nuevo) hay que elegirlo explícitamente.
function defaultWorkTypeFor(user: UserRow): WorkType {
  if (user.role === "staff" && user.subrole) return user.subrole;
  return "mesero";
}

function editKey(userId: string, workType: WorkType): string {
  return `${userId}:${workType}`;
}

export function AsistenciaSection({ date, attendance, users, onChanged }: Props) {
  const supabase = createClient();
  const usersById = Object.fromEntries(users.map((u) => [u.id, u]));

  const [edits, setEdits] = useState<Record<string, { entrada: string; salida: string }>>(() =>
    Object.fromEntries(
      attendance.map((a) => [editKey(a.user_id, a.work_type), { entrada: tsToTimeInput(a.check_in), salida: tsToTimeInput(a.check_out) }]),
    ),
  );
  const [error, setError] = useState<string | null>(null);

  const [newPerson, setNewPerson] = useState("");
  const [newWorkType, setNewWorkType] = useState<WorkType>("mesero");
  const [newEntrada, setNewEntrada] = useState("");
  const [newSalida, setNewSalida] = useState("");
  const [saving, setSaving] = useState<string | null>(null);

  function editFor(userId: string, workType: WorkType) {
    return edits[editKey(userId, workType)] ?? { entrada: "", salida: "" };
  }

  async function saveCorrection(userId: string, workType: WorkType) {
    setError(null);
    const { entrada, salida } = editFor(userId, workType);
    const entradaTs = timeInputToTs(date, entrada);
    const salidaTs = timeInputToTs(date, salida);
    if (salidaTs && entradaTs && salidaTs < entradaTs) {
      setError("La salida no puede ser antes de la llegada");
      return;
    }
    const key = editKey(userId, workType);
    setSaving(key);
    try {
      await supabase
        .from("attendance")
        .upsert({ user_id: userId, date, work_type: workType, check_in: entradaTs, check_out: salidaTs, method: "manual" }, { onConflict: "user_id,date,work_type" });
      onChanged();
    } finally {
      setSaving(null);
    }
  }

  async function addManual() {
    setError(null);
    const user = users.find((u) => u.name.trim().toLowerCase() === newPerson.trim().toLowerCase());
    if (!user) {
      setError("Escribe un nombre que exista en Personal");
      return;
    }
    const workType = user.role === "jefe" ? newWorkType : defaultWorkTypeFor(user);
    const entradaTs = timeInputToTs(date, newEntrada);
    if (!entradaTs) {
      setError("Escribe al menos la hora de entrada");
      return;
    }
    const salidaTs = timeInputToTs(date, newSalida);
    if (salidaTs && salidaTs < entradaTs) {
      setError("La salida no puede ser antes de la llegada");
      return;
    }
    setSaving("__new__");
    try {
      await supabase
        .from("attendance")
        .upsert({ user_id: user.id, date, work_type: workType, check_in: entradaTs, check_out: salidaTs, method: "manual" }, { onConflict: "user_id,date,work_type" });
      setNewPerson("");
      setNewEntrada("");
      setNewSalida("");
      onChanged();
    } finally {
      setSaving(null);
    }
  }

  const matchedNewUser = users.find((u) => u.name.trim().toLowerCase() === newPerson.trim().toLowerCase());

  return (
    <Section title="Asistencia del día">
      {error && (
        <div className="mb-2.5 rounded-lg border border-red/40 bg-red/10 px-2.5 py-2 text-[11px] text-red">{error}</div>
      )}
      {attendance.length === 0 ? (
        <EmptyState text="Sin registros de asistencia para este día." />
      ) : (
        <div className="mb-3 space-y-2">
          {attendance.map((a) => {
            const user = usersById[a.user_id];
            const showWorkType = user?.role === "jefe"; // solo el jefe puede tener más de un turno el mismo día
            return (
              <div key={editKey(a.user_id, a.work_type)} className="rounded-lg border border-border bg-surface-2 p-2.5">
                <div className="mb-1.5 text-[11.5px] font-bold">
                  {user?.name ?? "—"}
                  {showWorkType && <span className="ml-1.5 font-mono text-[9px] uppercase text-gold">{WORK_TYPE_LABEL[a.work_type]}</span>}
                </div>
                <div className="flex items-center gap-1.5">
                  <input
                    type="time"
                    value={editFor(a.user_id, a.work_type).entrada}
                    onChange={(e) => setEdits((prev) => ({ ...prev, [editKey(a.user_id, a.work_type)]: { ...editFor(a.user_id, a.work_type), entrada: e.target.value } }))}
                    className="min-w-0 flex-1 rounded-md border border-border bg-surface px-2 py-1.5 text-[12px] text-text"
                  />
                  <input
                    type="time"
                    value={editFor(a.user_id, a.work_type).salida}
                    onChange={(e) => setEdits((prev) => ({ ...prev, [editKey(a.user_id, a.work_type)]: { ...editFor(a.user_id, a.work_type), salida: e.target.value } }))}
                    className="min-w-0 flex-1 rounded-md border border-border bg-surface px-2 py-1.5 text-[12px] text-text"
                  />
                  <MiniButton onClick={() => saveCorrection(a.user_id, a.work_type)} disabled={saving === editKey(a.user_id, a.work_type)}>
                    Guardar
                  </MiniButton>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="space-y-2.5 rounded-xl border border-border bg-surface p-3.5">
        <div className="grid grid-cols-2 gap-2.5">
          <div>
            <FieldLabel>Persona (registro manual)</FieldLabel>
            <input value={newPerson} onChange={(e) => setNewPerson(e.target.value)} list="agendaUserNames" placeholder="Ej: María" className={inputCls} />
          </div>
          <div className="min-w-0">
            <FieldLabel>Entrada</FieldLabel>
            <input type="time" value={newEntrada} onChange={(e) => setNewEntrada(e.target.value)} className={inputCls} />
          </div>
        </div>
        {matchedNewUser?.role === "jefe" && (
          <div>
            <FieldLabel>Tipo de turno (es jefe — puede ser cualquiera de los dos)</FieldLabel>
            <select value={newWorkType} onChange={(e) => setNewWorkType(e.target.value as WorkType)} className={inputCls}>
              <option value="mesero">Mesero</option>
              <option value="administracion">Administración</option>
            </select>
          </div>
        )}
        <div>
          <FieldLabel>Salida (opcional)</FieldLabel>
          <input type="time" value={newSalida} onChange={(e) => setNewSalida(e.target.value)} className={inputCls} />
        </div>
        <MiniButton onClick={addManual} disabled={saving === "__new__"}>
          + Agregar registro manual
        </MiniButton>
      </div>
    </Section>
  );
}
