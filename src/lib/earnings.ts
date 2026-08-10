// shiftEarnings/splitShiftMinutes del HTML original. Todo recibe timestamps
// como parámetros explícitos (nada de Date.now() interno) — así son funciones
// puras normales, usables desde cualquier componente sin chocar con la regla
// de pureza de React, y el llamador decide de dónde sale "ahora" (useNowTick).

export type WorkType = "mesero" | "cocinero" | "administracion";

export type Rates = {
  mesero_t1: number;
  mesero_t2: number;
  mesero_t3: number;
  cocinero_flat: number;
  administracion_flat: number;
};

function overlapMinutes(aStart: number, aEnd: number, bStart: number, bEnd: number): number {
  const s = Math.max(aStart, bStart);
  const e = Math.min(aEnd, bEnd);
  return Math.max(0, (e - s) / 60000);
}

// Un turno de mesero se paga distinto según caiga antes de 11pm, entre 11pm y
// 1am, o después de 1am — igual que la liquidación real del original.
// Cocinero y administración son tarifa plana, sin franja horaria.
function splitShiftMinutes(entradaTs: number, salidaTs: number) {
  const startDay = new Date(entradaTs);
  startDay.setHours(0, 0, 0, 0);
  const d23 = new Date(startDay);
  d23.setHours(23, 0, 0, 0);
  const d01next = new Date(startDay);
  d01next.setDate(d01next.getDate() + 1);
  d01next.setHours(1, 0, 0, 0);
  const dayEnd = new Date(startDay);
  dayEnd.setDate(dayEnd.getDate() + 1);
  dayEnd.setHours(23, 0, 0, 0);

  const t1 = overlapMinutes(entradaTs, salidaTs, startDay.getTime(), d23.getTime());
  const t2 = overlapMinutes(entradaTs, salidaTs, d23.getTime(), d01next.getTime());
  const t3 = overlapMinutes(entradaTs, salidaTs, d01next.getTime(), dayEnd.getTime());
  return { t1, t2, t3 };
}

export function shiftEarnings(
  workType: WorkType,
  rates: Rates,
  entradaTs: number | null,
  salidaTs: number | null,
  nowMs: number,
): number {
  if (!entradaTs) return 0;
  const end = salidaTs ?? nowMs;

  if (workType === "cocinero" || workType === "administracion") {
    const totalMin = (end - entradaTs) / 60000;
    const flat = workType === "cocinero" ? rates.cocinero_flat : rates.administracion_flat;
    return totalMin * (flat / 60);
  }
  const { t1, t2, t3 } = splitShiftMinutes(entradaTs, end);
  return t1 * (rates.mesero_t1 / 60) + t2 * (rates.mesero_t2 / 60) + t3 * (rates.mesero_t3 / 60);
}
