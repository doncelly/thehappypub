"use client";

import { useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { daysUntilDue } from "@/lib/format";
import { Section, FieldLabel } from "@/components/panel-ui";

type Bill = { service_id: string; label: string; due_day: number | null };

type Props = {
  today: string;
  bills: Bill[];
};

// SERVICIOS del original — el orden real (no alfabético) importa.
const ORDER = ["internet", "agua", "luz", "gas", "arriendo"];

export function VencimientosClient({ today, bills: initialBills }: Props) {
  const supabase = createClient();
  const [bills, setBills] = useState(
    [...initialBills].sort((a, b) => ORDER.indexOf(a.service_id) - ORDER.indexOf(b.service_id)),
  );
  const debounceTimers = useRef<Record<string, ReturnType<typeof setTimeout> | null>>({});

  function onDiaChange(serviceId: string, value: string) {
    const dia = value ? parseInt(value, 10) : null;
    setBills((prev) => prev.map((b) => (b.service_id === serviceId ? { ...b, due_day: dia } : b)));

    const timers = debounceTimers.current;
    if (timers[serviceId]) clearTimeout(timers[serviceId]!);
    timers[serviceId] = setTimeout(async () => {
      await supabase.from("utility_bills").update({ due_day: dia }).eq("service_id", serviceId);
    }, 500);
  }

  return (
    <Section title="Vencimientos">
      <p className="mb-3 text-[11px] leading-relaxed text-text-faint">
        Días que faltan para el vencimiento de cada recibo — se calcula solo según el día del mes que definas, mes a mes.
      </p>
      <div className="space-y-2.5">
        {bills.map((b) => {
          const dias = daysUntilDue(today, b.due_day);
          let color = "text-text-dim";
          let text = "Sin fecha configurada";
          if (dias !== null) {
            color = dias <= 3 ? "text-red" : dias <= 7 ? "text-amber" : "text-green";
            text = dias === 0 ? "¡Vence hoy!" : dias === 1 ? "Vence mañana" : `Faltan ${dias} días`;
          }
          return (
            <div key={b.service_id} className="grid grid-cols-2 gap-2.5 rounded-xl border border-border bg-surface p-3.5">
              <div>
                <FieldLabel>{b.label}</FieldLabel>
                <input
                  type="number"
                  min={1}
                  max={31}
                  value={b.due_day ?? ""}
                  onChange={(e) => onDiaChange(b.service_id, e.target.value)}
                  placeholder="Día del mes (Ej: 15)"
                  className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-[13px] font-semibold text-text"
                />
              </div>
              <div className={`flex items-center justify-center text-center text-[13px] font-bold ${color}`}>{text}</div>
            </div>
          );
        })}
      </div>
    </Section>
  );
}
