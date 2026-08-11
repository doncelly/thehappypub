// computeAutoBonos() del original — "ventas" y "puntualidad" nunca se guardan,
// se calculan siempre a partir de datos reales. Compartido entre
// CalificacionesSection (Agenda) y el reporte PDF semanal (Panel).

// Puntos por ventas del día (equipo completo, mismo dato que ya usaba el
// check ✓/✗ de "Ventas"): no llega a la meta = 0, cumple hasta +10% sobre
// meta = 5, +10-20% = 8, +20% o más = 10. Es venta que ya entró de más, por
// eso el punto 15 del backlog lo trata como "autofinanciado".
export function computeAutoVentasPuntos(dailyGoal: number | null, ventasDelDia: number): number | null {
  if (!dailyGoal) return null;
  if (ventasDelDia < dailyGoal) return 0;
  const pctSobreMeta = (ventasDelDia - dailyGoal) / dailyGoal;
  if (pctSobreMeta >= 0.2) return 10;
  if (pctSobreMeta >= 0.1) return 8;
  return 5;
}

// Punto 15 del backlog: 1 punto = $1.000 (decidido con el usuario 11 ago
// 2026 — valor conservador, más fácil subirlo después que bajarlo).
export const PUNTO_VALOR_PESOS = 1000;

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
