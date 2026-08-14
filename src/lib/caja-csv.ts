// Construcción del CSV de cierres de caja — separado de reports.ts (que es
// "use client", para la descarga en el navegador) porque la subida a Drive
// necesita generar el mismo CSV desde un Route Handler (servidor).

export type CashRegisterCsvRow = {
  date: string;
  open_by: string | null;
  base_amount: number | null;
  remnant_received: number | null;
  observations: string | null;
  close_by: string | null;
  cash_amount: number | null;
  card_amount: number | null;
  other_payment_amount: number | null;
  remnant_accumulated: number | null;
  next_base: number | null;
  last_table: string | null;
};

export const CAJA_CSV_HEADER = [
  "Fecha",
  "Responsable apertura",
  "Base",
  "Remanente recibido",
  "Observaciones",
  "Responsable cierre",
  "Efectivo",
  "Tarjetas",
  "Otros medios de pago",
  "Total ventas (caja)",
  "Ventas registradas (app)",
  "Remanente acumulado",
  "Base siguiente",
  "Última mesa",
];

export function buildCajaCsvRows(
  days: string[],
  cashRegisters: CashRegisterCsvRow[],
  ventasByDate: Record<string, number>,
): (string | number)[][] {
  const rows: (string | number)[][] = [CAJA_CSV_HEADER];
  for (const d of days) {
    const c = cashRegisters.find((r) => r.date === d);
    if (!c) continue;
    const ventasApp = ventasByDate[d] ?? 0;
    const totalCaja = (Number(c.cash_amount) || 0) + (Number(c.card_amount) || 0) + (Number(c.other_payment_amount) || 0);
    rows.push([
      d,
      c.open_by ?? "",
      c.base_amount ?? "",
      c.remnant_received ?? "",
      (c.observations ?? "").replace(/[\r\n,]/g, " "),
      c.close_by ?? "",
      c.cash_amount ?? "",
      c.card_amount ?? "",
      c.other_payment_amount ?? "",
      totalCaja,
      ventasApp,
      c.remnant_accumulated ?? "",
      c.next_base ?? "",
      c.last_table ?? "",
    ]);
  }
  return rows;
}

export function rowsToCsvString(rows: (string | number)[][]): string {
  return "﻿" + rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
}
