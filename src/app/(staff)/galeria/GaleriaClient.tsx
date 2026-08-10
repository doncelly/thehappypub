"use client";

import { useState } from "react";
import { EmptyState } from "@/components/panel-ui";

export type GaleriaItem = { path: string; title: string; meta: string; cat: "recibidos" | "checklist" };

type Props = {
  items: GaleriaItem[];
  photoUrls: Record<string, string>;
};

const FILTERS = [
  { id: "all", label: "Todo" },
  { id: "recibidos", label: "Recibidos" },
  { id: "checklist", label: "Checklist" },
] as const;

export function GaleriaClient({ items, photoUrls }: Props) {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["id"]>("all");
  const visible = filter === "all" ? items : items.filter((i) => i.cat === filter);

  return (
    <div>
      <div className="mb-3.5 flex gap-1.5">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={`rounded-full border px-3 py-1.5 text-[11.5px] font-semibold ${
              filter === f.id ? "border-gold bg-gold text-[#1A140D]" : "border-border bg-surface text-text-dim"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <EmptyState text="Todavía no hay fotos subidas." />
      ) : (
        <div className="space-y-2">
          {visible.map((i, idx) => (
            <div key={idx} className="rounded-xl border border-border bg-surface p-2.5">
              <div className="text-[12px] font-bold">{i.title}</div>
              <div className="mt-0.5 text-[10px] text-text-faint">{i.meta}</div>
              <div className="mt-1.5">
                {/* eslint-disable-next-line @next/next/no-img-element -- foto firmada de Storage */}
                <img
                  src={photoUrls[i.path]}
                  alt={i.title}
                  className="h-24 w-24 cursor-pointer rounded-lg border border-border object-cover"
                  onClick={() => window.open(photoUrls[i.path], "_blank")}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="mt-4 text-[10.5px] leading-relaxed text-text-faint">
        The Happy Pub no puede subir estas fotos automáticamente a una carpeta de Google Drive en tiempo real — eso
        necesitaría un servidor propio con permisos de Google. Esta galería es el reemplazo dentro de la misma app:
        siempre actualizada, sin salir a buscar en otro lado.
      </p>
    </div>
  );
}
