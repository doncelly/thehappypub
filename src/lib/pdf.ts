"use client";

import { jsPDF } from "jspdf";

// Colores de marca — mismos valores que tailwind.config.ts (:root del HTML original).
export const BRAND_NAVY: [number, number, number] = [48, 65, 138]; // #30418A
export const BRAND_GOLD: [number, number, number] = [198, 141, 23]; // #C68D17
export const BRAND_TEXT: [number, number, number] = [30, 30, 30];
export const GRAY: [number, number, number] = [110, 118, 165];

// Nombre viejo del acento dorado — se mantiene para no tocar cada línea que
// ya lo importa en reports.ts / personal-report.ts.
export const HAPPY_GOLD = BRAND_GOLD;

const HEADER_H = 26;
export const MARGIN_X = 14;

async function fetchDataUrl(path: string): Promise<string> {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`No se pudo cargar ${path}`);
  const blob = await res.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error(`No se pudo leer ${path}`));
    reader.readAsDataURL(blob);
  });
}

// Encabezado de marca (franja navy + logo + título en Cheddar Gothic Serif,
// repetido en cada página) + el mismo helper line(text,size,color,bold) del
// original, que ahora también dispara el encabezado nuevo en cada salto de
// página automático. Es async porque carga el logo y la fuente de marca
// desde /public antes de dibujar — los llamadores (reports.ts,
// personal-report.ts) ya son funciones async, así que un await más no cambia
// su forma. Si el logo o la fuente no cargan (sin red, etc.) el reporte
// igual se genera, solo cae a Helvetica y sin logo.
export async function createReportDoc(title: string) {
  const doc = new jsPDF();
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();

  let logoDataUrl: string | null = null;
  try {
    logoDataUrl = await fetchDataUrl("/brand/logo.png");
  } catch {
    // sin logo no se rompe el reporte
  }

  let brandFontOk = false;
  try {
    const fontDataUrl = await fetchDataUrl("/fonts/CheddarGothicSerif.ttf");
    const base64 = fontDataUrl.slice(fontDataUrl.indexOf(",") + 1);
    doc.addFileToVFS("CheddarGothicSerif.ttf", base64);
    doc.addFont("CheddarGothicSerif.ttf", "CheddarGothicSerif", "normal");
    brandFontOk = true;
  } catch {
    // cae a Helvetica si no se pudo cargar/registrar la fuente de marca
  }

  let pageNum = 1;

  function drawHeader() {
    doc.setFillColor(...BRAND_NAVY);
    doc.rect(0, 0, pageW, HEADER_H, "F");
    if (logoDataUrl) {
      try {
        doc.addImage(logoDataUrl, "PNG", MARGIN_X, 4, 18, 18);
      } catch {
        // formato de imagen raro — sigue sin logo
      }
    }
    doc.setFont(brandFontOk ? "CheddarGothicSerif" : "helvetica", brandFontOk ? "normal" : "bold");
    doc.setFontSize(16);
    doc.setTextColor(...BRAND_GOLD);
    doc.text(title, logoDataUrl ? MARGIN_X + 24 : MARGIN_X, 17);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...GRAY);
    doc.text(`The Happy Pub — página ${pageNum}`, pageW - MARGIN_X, pageH - 8, { align: "right" });

    doc.setTextColor(...BRAND_TEXT);
  }

  drawHeader();
  let y = HEADER_H + 12;

  function line(text: string, size = 10, color: [number, number, number] = BRAND_TEXT, bold = false) {
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setFontSize(size);
    doc.setTextColor(...color);
    doc.text(String(text), MARGIN_X, y);
    doc.setFont("helvetica", "normal");
    y += Math.max(5, size * 0.55);
    if (y > pageH - 15) {
      doc.addPage();
      pageNum++;
      drawHeader();
      y = HEADER_H + 12;
    }
  }

  function space(extra: number) {
    y += extra;
  }

  // Para insertar contenido que no es texto línea-por-línea (p.ej. una tabla
  // de jspdf-autotable) en el mismo flujo: leer dónde quedó el cursor,
  // dibujar lo que sea con las coordenadas de doc directamente, y avisar acá
  // dónde quedó para que el próximo line()/space() siga después, no encima.
  function getY() {
    return y;
  }
  function setY(newY: number) {
    y = newY;
  }
  function ensureSpace(neededHeight: number) {
    if (y + neededHeight > pageH - 15) {
      doc.addPage();
      pageNum++;
      drawHeader();
      y = HEADER_H + 12;
    }
  }

  return { doc, line, space, getY, setY, ensureSpace };
}
