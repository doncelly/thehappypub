import "server-only";
import { getGoogleAccessToken } from "./google-auth";

// Sincroniza la hoja de cierres de caja de Google Sheets del jefe (un archivo
// .xlsx que ya usaba a mano, con UNA PESTAÑA POR FECHA — no una fila por
// fecha). Cada pestaña nueva se crea duplicando una pestaña plantilla fija
// (la misma que el jefe duplica a mano), y se le cambia el nombre a la fecha.
// Ver GOOGLE_DRIVE_SETUP.md para la configuración.

const SCOPES = ["https://www.googleapis.com/auth/spreadsheets"];
const SHEETS_API = "https://sheets.googleapis.com/v4/spreadsheets";

async function sheetsApiFetch<T>(url: string, accessToken: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Google Sheets rechazó la solicitud (${res.status}): ${text.slice(0, 400)}`);
  }
  return res.json() as Promise<T>;
}

type SheetProps = { sheetId: number; title: string };

async function listSheets(spreadsheetId: string, accessToken: string): Promise<SheetProps[]> {
  const data = await sheetsApiFetch<{ sheets: { properties: SheetProps }[] }>(
    `${SHEETS_API}/${spreadsheetId}?fields=sheets.properties(sheetId,title)`,
    accessToken,
  );
  return (data.sheets ?? []).map((s) => s.properties);
}

async function duplicateSheet(spreadsheetId: string, sourceSheetId: number, newTitle: string, accessToken: string): Promise<void> {
  await sheetsApiFetch(`${SHEETS_API}/${spreadsheetId}:batchUpdate`, accessToken, {
    method: "POST",
    body: JSON.stringify({ requests: [{ duplicateSheet: { sourceSheetId, newSheetName: newTitle } }] }),
  });
}

async function getValues(spreadsheetId: string, range: string, accessToken: string): Promise<string[][]> {
  const data = await sheetsApiFetch<{ values?: string[][] }>(
    `${SHEETS_API}/${spreadsheetId}/values/${encodeURIComponent(range)}`,
    accessToken,
  );
  return data.values ?? [];
}

async function batchUpdateValues(
  spreadsheetId: string,
  data: { range: string; values: (string | number)[][] }[],
  accessToken: string,
): Promise<void> {
  if (data.length === 0) return;
  await sheetsApiFetch(`${SHEETS_API}/${spreadsheetId}/values:batchUpdate`, accessToken, {
    method: "POST",
    body: JSON.stringify({ valueInputOption: "USER_ENTERED", data }),
  });
}

// Encuentra la pestaña de la fecha (duplicando la plantilla si hace falta) y
// devuelve el título REAL a usar para escribir en ella. `candidates` son
// variantes de nombre a buscar antes de crear una nueva (ej. "07/08/2026" y
// "7/08/2026") — el jefe no siempre le pone el cero al día cuando duplica la
// pestaña a mano, así que si no revisamos ambas variantes podríamos crear una
// pestaña duplicada en vez de actualizar la que ya existe. Si ninguna
// coincide, se crea con `candidates[0]` (el nombre canónico, con cero).
export async function ensureDateTab(spreadsheetId: string, templateTitle: string, candidates: string[]): Promise<string> {
  const accessToken = await getGoogleAccessToken(SCOPES);
  const sheets = await listSheets(spreadsheetId, accessToken);
  const existing = candidates.find((c) => sheets.some((s) => s.title === c));
  if (existing) return existing;

  const canonical = candidates[0];
  const template = sheets.find((s) => s.title === templateTitle);
  if (!template) {
    throw new Error(`No se encontró la pestaña plantilla "${templateTitle}" en la hoja de cálculo.`);
  }
  await duplicateSheet(spreadsheetId, template.sheetId, canonical, accessToken);
  return canonical;
}

// Busca en la columna dada (0 = primera del rango leído) la fila cuyo texto
// contiene `needle` — para ubicar encabezados como "DETALLE DE COMPRAS DESDE
// REMANENTE" sin depender de que el número de fila sea siempre el mismo.
function findRowIndex(values: string[][], colIndex: number, needle: string): number {
  const target = needle.trim().toLowerCase();
  return values.findIndex((row) => (row[colIndex] ?? "").trim().toLowerCase().includes(target));
}

export type CajaTabWrite = {
  /** Celda → valor, ej. {"B7": "Nathaly", "B8": "07/08/2026"}. */
  cells: Record<string, string | number>;
  /** Filas de "Detalle de compras desde remanente" (columnas E=proveedor/concepto, G=valor). */
  compras: { concept: string; amount: number }[];
  /** Filas de "Detalle de auxilios de transporte" (columnas E=colaborador, F=valor). */
  auxilios: { collaborator: string; amount: number }[];
};

// Nunca toca la columna G de auxilios (el total, que puede ser una celda
// combinada/fórmula) ni agrega o borra filas — solo sobreescribe tantas filas
// como líneas tenga `compras`/`auxilios` hoy, empezando justo debajo del
// encabezado de cada tabla.
export async function writeCajaTab(spreadsheetId: string, tabTitle: string, write: CajaTabWrite): Promise<void> {
  const accessToken = await getGoogleAccessToken(SCOPES);

  const data: { range: string; values: (string | number)[][] }[] = Object.entries(write.cells).map(([cell, value]) => ({
    range: `'${tabTitle}'!${cell}`,
    values: [[value]],
  }));

  const grid = await getValues(spreadsheetId, `'${tabTitle}'!E1:G60`, accessToken);

  const comprasHeaderRow = findRowIndex(grid, 0, "detalle de compras");
  if (comprasHeaderRow >= 0) {
    const dataStartRow = comprasHeaderRow + 3; // 1-indexed: encabezado(1) + títulos de columna(1) + primera fila de datos
    write.compras.forEach((c, i) => {
      data.push({ range: `'${tabTitle}'!E${dataStartRow + i}`, values: [[c.concept]] });
      data.push({ range: `'${tabTitle}'!G${dataStartRow + i}`, values: [[c.amount]] });
    });
  }

  const auxiliosHeaderRow = findRowIndex(grid, 0, "detalle de auxilios");
  if (auxiliosHeaderRow >= 0) {
    const dataStartRow = auxiliosHeaderRow + 3;
    write.auxilios.forEach((a, i) => {
      data.push({ range: `'${tabTitle}'!E${dataStartRow + i}`, values: [[a.collaborator]] });
      data.push({ range: `'${tabTitle}'!F${dataStartRow + i}`, values: [[a.amount]] });
    });
  }

  await batchUpdateValues(spreadsheetId, data, accessToken);
}
