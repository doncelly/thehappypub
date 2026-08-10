// computeAutoBonos() del original — "ventas" y "puntualidad" nunca se guardan,
// se calculan siempre a partir de datos reales. Compartido entre
// CalificacionesSection (Agenda) y el reporte PDF semanal (Panel).

export function computeAutoVentas(dailyGoal: number | null, ventasDelDia: number): boolean | null {
  return dailyGoal ? ventasDelDia >= dailyGoal : null;
}

export function computeAutoPuntualidad(scheduleLabel: string | null | undefined, checkInIso: string | null | undefined): boolean | null {
  if (!scheduleLabel || !checkInIso) return null;
  const m = scheduleLabel.match(/(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const startMin = parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
  const d = new Date(checkInIso);
  return d.getHours() * 60 + d.getMinutes() <= startMin + 10;
}
