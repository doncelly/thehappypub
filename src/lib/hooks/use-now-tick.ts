"use client";

import { useEffect, useState } from "react";

// Date.now() no puede llamarse suelto en el cuerpo de un componente (regla de
// pureza de React) — este hook lo aisla en un efecto y lo mantiene fresco con
// un intervalo. Usado por cualquier vista que necesite "ahora" para calcular
// vencimientos de lock, ganancias en vivo, etc. (Vender, Mi día).
export function useNowTick(intervalMs = 30_000): number {
  const [now, setNow] = useState(0);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const kickoff = setTimeout(tick, 0);
    const id = setInterval(tick, intervalMs);
    return () => {
      clearTimeout(kickoff);
      clearInterval(id);
    };
  }, [intervalMs]);
  return now;
}
