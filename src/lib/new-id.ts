"use client";

// crypto.randomUUID() es otro "global impuro" que la regla de pureza de React
// marca si se llama suelto en un componente — mismo motivo que Date.now() en
// lib/hooks/use-now-tick.ts. Se usa para generar el id de una fila ANTES de
// insertarla (p.ej. subir fotos a Storage con la ruta ya lista).
export function newId(): string {
  return crypto.randomUUID();
}
