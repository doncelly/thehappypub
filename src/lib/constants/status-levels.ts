// STATUS_LEVELS del HTML original — metadata de presentación (color/label/pct),
// no vive en la base de datos porque item_status.status_gauge ya usa estas mismas
// keys como CHECK constraint (ver supabase/schema.sql).
export type StatusGaugeKey = "completo" | "tres_cuartos" | "mitad" | "un_cuarto" | "agotado";

export type StatusLevel = {
  key: StatusGaugeKey;
  label: string;
  color: string;
  pct: string;
};

export const STATUS_LEVELS: StatusLevel[] = [
  { key: "completo", label: "Completo", color: "#7FA66E", pct: "100%" },
  { key: "tres_cuartos", label: "3/4", color: "#A3B25A", pct: "75%" },
  { key: "mitad", label: "Mitad", color: "#E0A83F", pct: "50%" },
  { key: "un_cuarto", label: "1/4", color: "#D9793A", pct: "25%" },
  { key: "agotado", label: "Agotado", color: "#C1462F", pct: "6%" },
];

export function levelOf(key: StatusGaugeKey | null | undefined): StatusLevel {
  return STATUS_LEVELS.find((l) => l.key === key) ?? STATUS_LEVELS[STATUS_LEVELS.length - 1];
}

export function nextStatusKey(key: StatusGaugeKey | null | undefined): StatusGaugeKey {
  const idx = STATUS_LEVELS.findIndex((l) => l.key === key);
  return STATUS_LEVELS[(idx + 1) % STATUS_LEVELS.length].key;
}

export function isCriticalGauge(key: StatusGaugeKey | null | undefined): boolean {
  return key === "agotado" || key === "un_cuarto";
}
