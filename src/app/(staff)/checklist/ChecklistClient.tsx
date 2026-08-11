"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { compressImage } from "@/lib/compress-image";
import { Section } from "@/components/panel-ui";
import { APERTURA_ITEMS, CIERRE_ITEMS, allChecked } from "@/lib/constants/checklist-areas";

const BUCKET = "happy-pub-photos";

type NestedAreas = Record<string, Record<string, boolean>>;
type Entry = { section: string; done: boolean; areas: NestedAreas; has_photo: boolean };
type SectionState = { done: boolean; areas: NestedAreas; hasPhoto: boolean; photoUrl: string | null };

type Props = {
  date: string;
  userId: string;
  role: "jefe" | "mesero" | "cocinero";
  entries: Entry[];
  photoUrls: Record<string, string>;
};

const ALISTAMIENTO_PARTES = [
  { key: "alistamiento_apertura_caja", title: "1.1 Apertura de caja" },
  { key: "alistamiento_inventarios_sanidad", title: "1.2 Inventarios y documentos de sanidad (escanear y subir)" },
  { key: "alistamiento_organizacion", title: "1.3 Organización de los espacios" },
  { key: "alistamiento_cristaleria", title: "1.4 Limpieza de cristalería" },
  { key: "alistamiento_actividad_dia", title: "1.5 Actividad del día" },
] as const;

function buildInitial(entries: Entry[], photoUrls: Record<string, string>): Record<string, SectionState> {
  const byKey: Record<string, SectionState> = {
    inventario: { done: false, areas: {}, hasPhoto: false, photoUrl: null },
    apertura: { done: false, areas: {}, hasPhoto: false, photoUrl: null },
    cierre: { done: false, areas: {}, hasPhoto: false, photoUrl: null },
  };
  for (const { key } of ALISTAMIENTO_PARTES) {
    byKey[key] = { done: false, areas: {}, hasPhoto: false, photoUrl: null };
  }
  for (const e of entries) {
    byKey[e.section] = { done: e.done, areas: e.areas ?? {}, hasPhoto: e.has_photo, photoUrl: photoUrls[e.section] ?? null };
  }
  return byKey;
}

export function ChecklistClient({ date, userId, role, entries, photoUrls }: Props) {
  const supabase = createClient();
  const [sections, setSections] = useState<Record<string, SectionState>>(() => buildInitial(entries, photoUrls));
  const [toast, setToast] = useState<string | null>(null);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 1800);
  }

  async function toggleDone(section: string) {
    const prevState = sections[section];
    const next = !prevState.done;
    setSections((prev) => ({ ...prev, [section]: { ...prev[section], done: next } }));
    const { error } = await supabase
      .from("checklist_entries")
      .upsert({ date, user_id: userId, section, done: next, completed_at: next ? new Date().toISOString() : null });
    if (error) {
      setSections((prev) => ({ ...prev, [section]: prevState }));
      showToast("No se pudo guardar, intenta de nuevo");
    }
  }

  async function toggleItem(section: string, area: string, item: string, checked: boolean) {
    const prevState = sections[section];
    const nextAreas: NestedAreas = { ...prevState.areas, [area]: { ...prevState.areas[area], [item]: checked } };
    setSections((prev) => ({ ...prev, [section]: { ...prev[section], areas: nextAreas } }));
    const { error } = await supabase.from("checklist_entries").upsert({ date, user_id: userId, section, areas: nextAreas });
    if (error) {
      setSections((prev) => ({ ...prev, [section]: prevState }));
      showToast("No se pudo guardar, intenta de nuevo");
    }
  }

  async function markAllArea(section: string, area: string, items: string[]) {
    const prevState = sections[section];
    const nextAreas: NestedAreas = { ...prevState.areas, [area]: Object.fromEntries(items.map((i) => [i, true])) };
    setSections((prev) => ({ ...prev, [section]: { ...prev[section], areas: nextAreas } }));
    const { error } = await supabase.from("checklist_entries").upsert({ date, user_id: userId, section, areas: nextAreas });
    if (error) {
      setSections((prev) => ({ ...prev, [section]: prevState }));
      showToast("No se pudo guardar, intenta de nuevo");
    }
  }

  async function markAllSection(section: string, items: Record<string, string[]>) {
    const prevState = sections[section];
    const nextAreas: NestedAreas = Object.fromEntries(
      Object.entries(items).map(([area, list]) => [area, Object.fromEntries(list.map((i) => [i, true]))]),
    );
    setSections((prev) => ({ ...prev, [section]: { ...prev[section], areas: nextAreas } }));
    const { error } = await supabase.from("checklist_entries").upsert({ date, user_id: userId, section, areas: nextAreas });
    if (error) {
      setSections((prev) => ({ ...prev, [section]: prevState }));
      showToast("No se pudo guardar, intenta de nuevo");
    }
  }

  async function uploadPhoto(section: string, file: File | undefined) {
    if (!file) return;
    showToast("Guardando foto…");
    try {
      const blob = await compressImage(file);
      const path = `checklist/${date}/${userId}/${section}.jpg`;
      const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, blob, { upsert: true, contentType: "image/jpeg" });
      if (uploadError) throw uploadError;

      await supabase.from("checklist_photos").upsert({ date, user_id: userId, section, storage_path: path });
      await supabase.from("checklist_entries").upsert({ date, user_id: userId, section, has_photo: true });

      const previewUrl = URL.createObjectURL(blob);
      setSections((prev) => ({ ...prev, [section]: { ...prev[section], hasPhoto: true, photoUrl: previewUrl } }));
      showToast("Foto guardada ✓");
    } catch {
      showToast("No se pudo procesar la foto");
    }
  }

  return (
    <div>
      <Section title="1. Alistamiento del establecimiento">
        <div className="space-y-2.5">
          {ALISTAMIENTO_PARTES.map(({ key, title }) => (
            <SimpleSection
              key={key}
              title={title}
              state={sections[key]}
              onToggle={() => toggleDone(key)}
              onPhoto={(f) => uploadPhoto(key, f)}
            />
          ))}
        </div>
      </Section>
      <SimpleSection
        title="Inventario"
        state={sections.inventario}
        onToggle={() => toggleDone("inventario")}
        onPhoto={(f) => uploadPhoto("inventario", f)}
      />
      {role !== "cocinero" && (
        <>
          <AreaSection
            title="Apertura por áreas"
            items={APERTURA_ITEMS}
            state={sections.apertura}
            onToggleItem={(a, i, c) => toggleItem("apertura", a, i, c)}
            onMarkAllArea={(a, list) => markAllArea("apertura", a, list)}
            onMarkAllSection={() => markAllSection("apertura", APERTURA_ITEMS)}
            onPhoto={(f) => uploadPhoto("apertura", f)}
          />
          <AreaSection
            title="Cierre por áreas"
            items={CIERRE_ITEMS}
            state={sections.cierre}
            onToggleItem={(a, i, c) => toggleItem("cierre", a, i, c)}
            onMarkAllArea={(a, list) => markAllArea("cierre", a, list)}
            onMarkAllSection={() => markAllSection("cierre", CIERRE_ITEMS)}
            onPhoto={(f) => uploadPhoto("cierre", f)}
          />
        </>
      )}

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 rounded-full bg-gold px-5 py-2.5 text-[12.5px] font-bold text-[#1A140D] shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}

function StatusPill({ done }: { done: boolean }) {
  return (
    <span className={`rounded-full px-2 py-0.5 font-mono text-[10px] ${done ? "bg-green/20 text-green" : "bg-amber/15 text-amber"}`}>
      {done ? "Listo" : "Pendiente"}
    </span>
  );
}

function PhotoRow({ photoUrl, onPhoto }: { photoUrl: string | null; onPhoto: (f: File | undefined) => void }) {
  return (
    <div className="mt-2.5 flex items-center gap-2.5">
      {photoUrl && (
        // eslint-disable-next-line @next/next/no-img-element -- foto firmada de Storage, no un asset estático de /public
        <img src={photoUrl} alt="Evidencia" className="h-11 w-11 flex-none rounded-lg border border-border object-cover" />
      )}
      <input
        type="file"
        accept="image/*"
        capture="environment"
        onChange={(e) => onPhoto(e.target.files?.[0])}
        className="flex-1 text-[10.5px] text-text-dim"
      />
    </div>
  );
}

function SimpleSection({
  title,
  state,
  onToggle,
  onPhoto,
}: {
  title: string;
  state: SectionState;
  onToggle: () => void;
  onPhoto: (f: File | undefined) => void;
}) {
  return (
    <Section title={title}>
      <div className="rounded-xl border border-border bg-surface p-3.5">
        <div className="mb-1 flex items-center justify-between">
          <label className="flex items-center gap-2 text-[12.5px]">
            <input type="checkbox" checked={state.done} onChange={onToggle} className="h-[17px] w-[17px] accent-gold" />
            Listo
          </label>
          <StatusPill done={state.done} />
        </div>
        <PhotoRow photoUrl={state.photoUrl} onPhoto={onPhoto} />
      </div>
    </Section>
  );
}

function AreaSection({
  title,
  items,
  state,
  onToggleItem,
  onMarkAllArea,
  onMarkAllSection,
  onPhoto,
}: {
  title: string;
  items: Record<string, string[]>;
  state: SectionState;
  onToggleItem: (area: string, item: string, checked: boolean) => void;
  onMarkAllArea: (area: string, items: string[]) => void;
  onMarkAllSection: () => void;
  onPhoto: (f: File | undefined) => void;
}) {
  const [openArea, setOpenArea] = useState<string | null>(null);
  const overallDone = allChecked(items, state.areas);

  return (
    <Section title={title}>
      <div className="rounded-xl border border-border bg-surface p-3.5">
        <div className="mb-2 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={onMarkAllSection}
            className="rounded-lg border border-gold/40 px-2.5 py-1 text-[10.5px] font-bold text-gold"
          >
            ✓ Marcar todo
          </button>
          <StatusPill done={overallDone} />
        </div>
        {Object.entries(items).map(([area, list]) => {
          const areaChecks = state.areas[area] ?? {};
          const areaDone = list.every((i) => areaChecks[i]);
          const doneCount = list.filter((i) => areaChecks[i]).length;
          const isOpen = openArea === area;
          return (
            <div key={area} className="border-b border-border last:border-0">
              <button
                type="button"
                onClick={() => setOpenArea(isOpen ? null : area)}
                className="flex w-full items-center justify-between py-2.5 text-left text-[12.5px]"
              >
                <span className="flex items-center gap-2">
                  <span className={`text-[10px] transition-transform ${isOpen ? "rotate-90" : ""}`}>▶</span>
                  {area}
                </span>
                <span className={`font-mono text-[10px] ${areaDone ? "text-green" : "text-text-faint"}`}>
                  {doneCount}/{list.length}
                </span>
              </button>
              {isOpen && (
                <div className="pb-2 pl-5">
                  {list.map((item) => (
                    <label key={item} className="flex items-center gap-2 py-1 text-[11.5px] text-text-dim">
                      <input
                        type="checkbox"
                        checked={!!areaChecks[item]}
                        onChange={(e) => onToggleItem(area, item, e.target.checked)}
                        className="h-[15px] w-[15px] accent-gold"
                      />
                      {item}
                    </label>
                  ))}
                  {!areaDone && (
                    <button
                      type="button"
                      onClick={() => onMarkAllArea(area, list)}
                      className="mt-1 text-[10.5px] font-bold text-gold underline underline-offset-2"
                    >
                      Marcar toda esta área
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
        <PhotoRow photoUrl={state.photoUrl} onPhoto={onPhoto} />
      </div>
    </Section>
  );
}
