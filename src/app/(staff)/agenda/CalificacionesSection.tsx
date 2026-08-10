"use client";

import { createClient } from "@/lib/supabase/client";
import { computeAutoVentas, computeAutoPuntualidad } from "@/lib/bonos";
import { Section, EmptyState } from "@/components/panel-ui";
import type { Shift, Bonus, UserRow, Attendance, ServiceRating } from "./types";

type Props = {
  date: string;
  shifts: Shift[];
  bonuses: Bonus[];
  users: UserRow[];
  attendance: Attendance[];
  dailyGoal: number | null;
  ventasHoy: number;
  serviceRatings: ServiceRating[];
  onChanged: () => void;
};

type BonoKey = "service" | "task_alistamiento" | "task_inventario" | "task_apertura" | "task_cierre";

function emojiFor(v: boolean | null): string {
  return v === true ? "😊" : v === false ? "😞" : "⏳";
}

function computeAuto(dailyGoal: number | null, ventasHoy: number, shift: Shift | undefined, checkIn: string | null) {
  return {
    ventas: computeAutoVentas(dailyGoal, ventasHoy),
    puntualidad: computeAutoPuntualidad(shift?.schedule_label, checkIn),
  };
}

export function CalificacionesSection({ date, shifts, bonuses, users, attendance, dailyGoal, ventasHoy, serviceRatings, onChanged }: Props) {
  const supabase = createClient();

  const uniqueNames = [...new Set(shifts.map((t) => t.person_name.trim().toLowerCase()))];
  const people = uniqueNames
    .map((n) => users.find((u) => u.name.trim().toLowerCase() === n))
    .filter((u): u is UserRow => !!u);

  const bonusByUser = Object.fromEntries(bonuses.map((b) => [b.user_id, b]));
  const attendanceByUser = Object.fromEntries(attendance.map((a) => [a.user_id, a]));
  const shiftByUser = Object.fromEntries(
    shifts.filter((t) => t.user_id).map((t) => [t.user_id as string, t]),
  );

  async function cycle(userId: string, key: BonoKey) {
    const current = bonusByUser[userId];
    const cur = current?.[key] ?? null;
    const next = cur === null ? true : cur === true ? false : null;
    await supabase.from("bonuses").upsert({ ...current, date, user_id: userId, [key]: next });
    onChanged();
  }

  if (people.length === 0) {
    return (
      <Section title="Calificación del equipo">
        <EmptyState text="Agrega turnos primero para poder calificar al equipo." />
      </Section>
    );
  }

  return (
    <Section title="Calificación del equipo">
      <div className="space-y-2.5">
        {people.map((u) => {
          const manual = bonusByUser[u.id];
          const auto = computeAuto(dailyGoal, ventasHoy, shiftByUser[u.id], attendanceByUser[u.id]?.check_in ?? null);
          const ratings = serviceRatings.filter((r) => r.user_id === u.id);
          const cats: { key: string; label: string; val: boolean | null; auto: boolean }[] = [
            { key: "ventas", label: "Ventas", val: auto.ventas, auto: true },
            { key: "puntualidad", label: "Puntualidad", val: auto.puntualidad, auto: true },
            { key: "service", label: "Servicio", val: manual?.service ?? null, auto: false },
            { key: "task_alistamiento", label: "Alistamiento", val: manual?.task_alistamiento ?? null, auto: false },
            { key: "task_inventario", label: "Inventario", val: manual?.task_inventario ?? null, auto: false },
            { key: "task_apertura", label: "Apertura", val: manual?.task_apertura ?? null, auto: false },
            { key: "task_cierre", label: "Cierre", val: manual?.task_cierre ?? null, auto: false },
          ];
          return (
            <div key={u.id} className="rounded-xl border border-border bg-surface p-3">
              <div className="mb-2.5 text-[12.5px] font-bold">{u.name}</div>
              {ratings.length > 0 && (
                <div className="mb-2.5 text-[11px] text-text-faint">
                  {ratings.filter((r) => r.rating === "bien").length}😊{" "}
                  {ratings.filter((r) => r.rating === "regular").length}😐{" "}
                  {ratings.filter((r) => r.rating === "mal").length}😞 (calificado por clientes vía QR)
                </div>
              )}
              <div className="grid grid-cols-3 gap-1.5">
                {cats.map((c) => (
                  <button
                    key={c.key}
                    disabled={c.auto}
                    onClick={() => !c.auto && cycle(u.id, c.key as BonoKey)}
                    className={`flex flex-col items-center gap-1 rounded-lg border border-border bg-surface-2 px-1 py-1.5 ${c.auto ? "" : "cursor-pointer"}`}
                  >
                    <div className="text-lg">{emojiFor(c.val)}</div>
                    <div className="text-center text-[8.5px] leading-tight text-text-faint">{c.label}</div>
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </Section>
  );
}
