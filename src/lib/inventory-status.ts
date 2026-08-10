import type { StatusGaugeKey } from "@/lib/constants/status-levels";

// Forma cruda que puede devolver PostgREST para un embed items -> item_status:
// normalmente un objeto único (item_id es PK 1:1), pero se acepta también un
// array de 1 elemento o null por si acaso, en vez de asumir una sola forma.
export type RawItemStatus =
  | { status_gauge: StatusGaugeKey | null; qty: number | null; updated_at: string | null; updated_by: string | null }
  | { status_gauge: StatusGaugeKey | null; qty: number | null; updated_at: string | null; updated_by: string | null }[]
  | null;

export type ItemStatus = {
  status_gauge: StatusGaugeKey | null;
  qty: number | null;
  updated_at: string | null;
  updatedByName: string;
};

export function normalizeStatus(raw: RawItemStatus, usersById: Record<string, string>): ItemStatus {
  const row = Array.isArray(raw) ? (raw[0] ?? null) : raw;
  return {
    status_gauge: row?.status_gauge ?? null,
    qty: row?.qty ?? null,
    updated_at: row?.updated_at ?? null,
    updatedByName: row?.updated_by ? (usersById[row.updated_by] ?? "—") : "—",
  };
}

export function isCriticalItem(
  mode: "gauge" | "qty",
  min: number | null,
  status: Pick<ItemStatus, "status_gauge" | "qty">,
): boolean {
  if (mode === "gauge") return status.status_gauge === "agotado" || status.status_gauge === "un_cuarto";
  return min != null && (status.qty ?? 0) <= min;
}
