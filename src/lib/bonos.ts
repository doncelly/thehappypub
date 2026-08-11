// computeAutoBonos() del original — "ventas" y "puntualidad" nunca se guardan,
// se calculan siempre a partir de datos reales. Compartido entre
// CalificacionesSection (Agenda) y el reporte PDF semanal (Panel).

export function computeAutoVentas(dailyGoal: number | null, ventasDelDia: number): boolean | null {
  return dailyGoal ? ventasDelDia >= dailyGoal : null;
}

export const PUNTUALIDAD_META_SEMANAL = 35;

// Puntos por puntualidad: a tiempo o hasta 10 min tarde = 5, 11-15 min = 3,
// más de 15 min = 0. La meta semanal de bonificación es PUNTUALIDAD_META_SEMANAL.
export function computeAutoPuntualidadPuntos(scheduleLabel: string | null | undefined, checkInIso: string | null | undefined): number | null {
  if (!scheduleLabel || !checkInIso) return null;
  const m = scheduleLabel.match(/(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const startMin = parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
  const d = new Date(checkInIso);
  const lateMin = d.getHours() * 60 + d.getMinutes() - startMin;
  if (lateMin <= 10) return 5;
  if (lateMin <= 15) return 3;
  return 0;
}
