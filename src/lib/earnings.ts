// shiftEarnings/splitShiftMinutes del HTML original. Todo recibe timestamps
// como parámetros explícitos (nada de Date.now() interno) — así son funciones
// puras normales, usables desde cualquier componente sin chocar con la regla
// de pureza de React, y el llamador decide de dónde sale "ahora" (useNowTick).

export type WorkType = "mesero" | "cocinero" | "administracion";

export type Rates = {
  mesero_antes_medianoche: number;
  mesero_despues_medianoche: number;
  cocinero_flat: number;
  administracion_flat: number;
};

function overlapMinutes(aStart: number, aEnd: number, bStart: number, bEnd: number): number {
  const s = Math.max(aStart, bStart);
  const e = Math.min(aEnd, bEnd);
  return Math.max(0, (e - s) / 60000);
}

// Un turno de mesero se paga distinto antes o después de medianoche —
// cocinero y administración son tarifa plana, sin franja horaria.
function splitShiftMinutes(entradaTs: number, salidaTs: number) {
  const startDay = new Date(entradaTs);
  startDay.setHours(0, 0, 0, 0);
  const midnight = new Date(startDay);
  midnight.setDate(midnight.getDate() + 1);
  const dayEnd = new Date(startDay);
  dayEnd.setDate(dayEnd.getDate() + 2);

  const antesMedianoche = overlapMinutes(entradaTs, salidaTs, startDay.getTime(), midnight.getTime());
  const despuesMedianoche = overlapMinutes(entradaTs, salidaTs, midnight.getTime(), dayEnd.getTime());
  return { antesMedianoche, despuesMedianoche };
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
  const { antesMedianoche, despuesMedianoche } = splitShiftMinutes(entradaTs, end);
  return antesMedianoche * (rates.mesero_antes_medianoche / 60) + despuesMedianoche * (rates.mesero_despues_medianoche / 60);
}
