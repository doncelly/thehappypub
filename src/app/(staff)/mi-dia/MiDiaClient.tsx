"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { fmtCOP, fmtHM } from "@/lib/format";
import { distMeters } from "@/lib/geo";
import { shiftEarnings, type Rates, type WorkType } from "@/lib/earnings";
import { useNowTick } from "@/lib/hooks/use-now-tick";
import { Section, EmptyState } from "@/components/panel-ui";
import { generatePersonalReportPdf } from "./personal-report";

type CurrentUser = { id: string; name: string; role: "jefe" | "staff"; subrole: "mesero" | "cocinero" | null };
type AgendaDay = { promo: string | null; event: string | null; daily_goal: number | null } | null;
type AttendanceRow = { user_id: string; date: string; work_type: WorkType; check_in: string | null; check_out: string | null; method: "auto" | "manual" };
type AttendanceLite = { date: string; work_type: WorkType; check_in: string | null; check_out: string | null };
type Geofence = { venue_lat: number; venue_lng: number; arrive_radius_m: number; leave_radius_m: number } | null;
type Shift = {
  id: string;
  person_name: string;
  user_id: string | null;
  area: string | null;
  schedule_label: string | null;
  cleaning_task: string | null;
  done: boolean;
};
type Bonus = {
  service: boolean | null;
  task_alistamiento: boolean | null;
  task_inventario: boolean | null;
  task_apertura: boolean | null;
  task_cierre: boolean | null;
} | null;

type Props = {
  date: string;
  user: CurrentUser;
  agendaDay: AgendaDay;
  ventasHoy: number;
  myAttendanceToday: AttendanceRow[];
  myAttendanceQuincena: AttendanceLite[];
  geofence: Geofence;
  rates: Rates | null;
  shiftsToday: Shift[];
  myBonus: Bonus;
  scheduleUrl: string | null;
  cajaAbiertaHoy: boolean;
  inventarioListoHoy: boolean;
};

const GEO_POLL_MS = 60_000;
const WORK_TYPE_LABEL: Record<WorkType, string> = { mesero: "Mesero", cocinero: "Cocinero", administracion: "Administración" };

function emojiFor(v: boolean | null): string {
  return v === true ? "😊" : v === false ? "😞" : "⏳";
}

export function MiDiaClient(props: Props) {
  const { user, rates } = props;
  const supabase = useMemo(() => createClient(), []);
  const isMesero = user.role === "staff" && user.subrole === "mesero";
  // El jefe no tiene un work_type fijo: a veces cubre un turno de mesero, a
  // veces uno de administración (el original nunca pagaba esto — es nuevo).
  // Mesero/cocinero sí lo tienen fijo, igual al subrol, y mantienen la
  // geocerca automática tal como el original.
  const fixedWorkType: WorkType | null = user.role === "staff" ? (user.subrole as WorkType) : null;
  const [selectedWorkType, setSelectedWorkType] = useState<WorkType>(fixedWorkType ?? "mesero");
  const activeWorkType = fixedWorkType ?? selectedWorkType;

  const nowTick = useNowTick(60_000);

  const [attendanceList, setAttendanceList] = useState<AttendanceRow[]>(props.myAttendanceToday);
  const [geoStatus, setGeoStatus] = useState<"wait" | "ok" | "err">(props.geofence && fixedWorkType ? "wait" : "err");
  const [geoText, setGeoText] = useState(
    !props.geofence
      ? "El jefe todavía no configuró el radio de geocerca."
      : fixedWorkType
        ? "Buscando tu ubicación…"
        : "Como jefe, elige abajo qué turno vas a marcar — la ubicación automática no aplica.",
  );
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function showToast(msg: string) {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 1800);
  }

  const [generatingPdf, setGeneratingPdf] = useState(false);
  async function onDownloadPersonalPdf() {
    setGeneratingPdf(true);
    showToast("Generando PDF…");
    try {
      await generatePersonalReportPdf(supabase, props.date, user, rates);
      showToast("PDF descargado ✓");
    } catch {
      showToast("No se pudo generar el PDF");
    } finally {
      setGeneratingPdf(false);
    }
  }

  function attendanceFor(workType: WorkType): AttendanceRow | undefined {
    return attendanceList.find((a) => a.work_type === workType);
  }

  async function markAttendance(workType: WorkType, field: "check_in" | "check_out", method: "auto" | "manual") {
    const current = attendanceFor(workType);
    if (field === "check_out" && !current?.check_in) return;
    if (current?.[field]) return;
    const nowIso = new Date().toISOString();
    const next: AttendanceRow = {
      user_id: user.id,
      date: props.date,
      work_type: workType,
      check_in: field === "check_in" ? nowIso : (current?.check_in ?? null),
      check_out: field === "check_out" ? nowIso : (current?.check_out ?? null),
      method,
    };
    setAttendanceList((prev) => [...prev.filter((a) => a.work_type !== workType), next]);
    await supabase.from("attendance").upsert(next, { onConflict: "user_id,date,work_type" });
    if (method === "manual") showToast("Registrado ✓");
  }

  // checkGeofence() del original — igual que Vender/Panel, la geolocalización
  // vive en un efecto (nunca en el cuerpo del componente). Solo corre para
  // mesero/cocinero, que tienen un único work_type sin ambigüedad.
  useEffect(() => {
    if (!fixedWorkType) return;
    if (!props.geofence) return;
    if (!navigator.geolocation) {
      const t = setTimeout(() => {
        setGeoStatus("err");
        setGeoText("Tu navegador no soporta ubicación. Usa el registro manual.");
      }, 0);
      return () => clearTimeout(t);
    }
    const geo = props.geofence;
    const workType = fixedWorkType;

    function check() {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const d = distMeters(pos.coords.latitude, pos.coords.longitude, geo!.venue_lat, geo!.venue_lng);
          setAttendanceList((prevList) => {
            const current = prevList.find((a) => a.work_type === workType);
            if (!current?.check_in && d <= geo!.arrive_radius_m) {
              markAttendance(workType, "check_in", "auto");
              setGeoStatus("ok");
              setGeoText(`Llegada registrada`);
            } else if (current?.check_in && !current?.check_out && d > geo!.leave_radius_m) {
              markAttendance(workType, "check_out", "auto");
              setGeoStatus("ok");
              setGeoText(`Salida registrada`);
            } else if (current?.check_in && current?.check_out) {
              setGeoStatus("ok");
              setGeoText(`Turno completo hoy: ${fmtHM(current.check_in)} – ${fmtHM(current.check_out)}`);
            } else {
              setGeoStatus("wait");
              setGeoText(d <= geo!.arrive_radius_m ? "Ubicación activa, cerca del local." : `Ubicación activa — a ${Math.round(d)} m del local.`);
            }
            return prevList;
          });
        },
        () => {
          setGeoStatus("err");
          setGeoText("Activa el permiso de ubicación en tu navegador para registrar tu llegada automáticamente.");
        },
        { enableHighAccuracy: true, maximumAge: 20_000, timeout: 9_000 },
      );
    }

    check();
    const id = setInterval(check, GEO_POLL_MS);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo debe correr una vez al montar, igual que el original (setInterval propio)
  }, []);

  // nowTick arranca en 0 hasta que el efecto del hook lo llena (ver
  // use-now-tick.ts) — mientras tanto las ganancias muestran $0 por una
  // fracción de segundo en vez de un número basura. La quincena suma TODOS los
  // work_type que la persona haya cubierto (un jefe puede tener mesero +
  // administración el mismo día).
  const activeAttendance = attendanceFor(activeWorkType);
  const hoyGanado = activeAttendance?.check_in && rates && nowTick
    ? shiftEarnings(
        activeWorkType,
        rates,
        new Date(activeAttendance.check_in).getTime(),
        activeAttendance.check_out ? new Date(activeAttendance.check_out).getTime() : null,
        nowTick,
      )
    : 0;
  const quincenaGanado = rates && nowTick
    ? props.myAttendanceQuincena.reduce((sum, a) => {
        if (!a.check_in) return sum;
        return (
          sum +
          shiftEarnings(a.work_type, rates, new Date(a.check_in).getTime(), a.check_out ? new Date(a.check_out).getTime() : null, nowTick)
        );
      }, 0)
    : 0;

  const myName = user.name.trim().toLowerCase();
  const misTurnos = props.shiftsToday.filter(
    (t) => t.person_name.trim().toLowerCase().includes(myName) || myName.includes(t.person_name.trim().toLowerCase()),
  );

  async function toggleMiTarea(id: string, checked: boolean) {
    await supabase.from("shifts").update({ done: checked }).eq("id", id);
    showToast(checked ? "Tarea marcada ✓" : "Tarea desmarcada");
  }

  const b = props.myBonus;
  const ventasOK = props.agendaDay?.daily_goal ? props.ventasHoy >= props.agendaDay.daily_goal : null;

  // Punto 11 del backlog: recordar el orden de actividades al llegar (1ª
  // apertura de caja, 2ª inventario diario) — solo un aviso, no bloquea nada.
  // Aplica a jefe/mesero (quienes abren caja); cocinero no la abre y por eso
  // no ve este aviso. La 2ª actividad (inventario) solo la puede completar el
  // mesero, porque Checklist no está disponible para el jefe.
  const hasCheckedInToday = attendanceList.some((a) => a.check_in);
  const showAperturaBanner = (isMesero || user.role === "jefe") && hasCheckedInToday && !props.cajaAbiertaHoy;
  const showInventarioBanner = isMesero && hasCheckedInToday && props.cajaAbiertaHoy && !props.inventarioListoHoy;

  return (
    <div>
      {showAperturaBanner && (
        <a
          href="/caja"
          className="mb-4 block rounded-xl border border-amber/50 bg-amber/10 p-3 text-[12px] font-semibold text-amber"
        >
          ⚠️ Actividad 1 de hoy: falta abrir la caja.
        </a>
      )}
      {showInventarioBanner && (
        <a
          href="/checklist"
          className="mb-4 block rounded-xl border border-amber/50 bg-amber/10 p-3 text-[12px] font-semibold text-amber"
        >
          ⚠️ Actividad 2 de hoy: falta el inventario diario (Checklist).
        </a>
      )}

      <div className="mb-4 rounded-2xl border border-amber/30 bg-gradient-to-br from-amber/10 to-orange/5 p-3.5">
        {props.agendaDay?.promo && (
          <div className="text-[11.5px]">
            <b className="text-gold">Promo:</b> {props.agendaDay.promo}
          </div>
        )}
        {props.agendaDay?.event && props.agendaDay.event.toUpperCase() !== "NA" && (
          <div className="mt-1 text-[11.5px]">
            <b className="text-gold">Evento:</b> {props.agendaDay.event}
          </div>
        )}
        {isMesero && props.agendaDay?.daily_goal ? (
          <>
            <div className="mt-2 text-[11.5px]">
              Meta: {fmtCOP(props.agendaDay.daily_goal)} · Van: {fmtCOP(props.ventasHoy)}
            </div>
            <div className="mt-1.5 h-[9px] overflow-hidden rounded-md border border-border bg-surface-2">
              <div
                className="h-full rounded-md bg-gradient-to-r from-navy to-gold"
                style={{ width: `${Math.min(100, Math.round((props.ventasHoy / props.agendaDay.daily_goal) * 100))}%` }}
              />
            </div>
          </>
        ) : (
          <div className="mt-2 text-[11.5px] text-text-dim">
            {props.agendaDay?.daily_goal ? `Meta del día: ${fmtCOP(props.agendaDay.daily_goal)}` : "Sin meta definida hoy"}
          </div>
        )}
      </div>

      {props.scheduleUrl && (
        <a
          href={props.scheduleUrl}
          target="_blank"
          rel="noreferrer"
          className="mb-4 flex items-center justify-center gap-2 rounded-xl border border-gold/40 bg-gold/10 py-2.5 text-[12.5px] font-bold text-gold"
        >
          📄 Ver horario de esta semana (PDF)
        </a>
      )}

      <Section title="Mi asistencia">
        {!fixedWorkType && (
          <div className="mb-2.5 flex gap-1.5">
            {(["mesero", "administracion"] as WorkType[]).map((wt) => (
              <button
                key={wt}
                onClick={() => setSelectedWorkType(wt)}
                className={`flex-1 rounded-lg border px-2 py-1.5 text-[11.5px] font-semibold ${
                  activeWorkType === wt ? "border-gold bg-gold text-[#1A140D]" : "border-border bg-surface text-text-dim"
                }`}
              >
                Turno de {WORK_TYPE_LABEL[wt]}
              </button>
            ))}
          </div>
        )}
        <div className="mb-2.5 flex items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2.5 text-[11px]">
          <span
            className={`h-[9px] w-[9px] flex-none rounded-full ${geoStatus === "ok" ? "bg-green" : geoStatus === "err" ? "bg-red" : "bg-amber"}`}
          />
          {geoText}
        </div>
        <div className="mb-2.5 rounded-xl border border-border bg-surface px-3 py-2.5 text-[12px]">
          <b>Turno de {WORK_TYPE_LABEL[activeWorkType]}:</b> {fmtHM(activeAttendance?.check_in ?? null)} – {fmtHM(activeAttendance?.check_out ?? null)}
        </div>
        {(geoStatus === "err" || !fixedWorkType) && (
          <div className="flex gap-2">
            <button
              onClick={() => markAttendance(activeWorkType, "check_in", "manual")}
              className="flex-1 rounded-lg bg-gold py-2 text-[12px] font-bold text-[#1A140D]"
            >
              Marcar llegada
            </button>
            <button
              onClick={() => markAttendance(activeWorkType, "check_out", "manual")}
              className="flex-1 rounded-lg border border-border bg-surface-2 py-2 text-[12px] font-bold text-text"
            >
              Marcar salida
            </button>
          </div>
        )}
      </Section>

      <Section title="Ganancias">
        <div className="space-y-2.5 rounded-xl border border-border bg-surface px-3 py-2.5 text-[12px]">
          <div>
            💰 <b>Hoy ({WORK_TYPE_LABEL[activeWorkType]}):</b> {fmtCOP(hoyGanado)} &nbsp;·&nbsp; <b>Quincena (todo):</b> {fmtCOP(quincenaGanado)}
          </div>
          <button
            onClick={onDownloadPersonalPdf}
            disabled={generatingPdf}
            className="w-full rounded-lg border border-border bg-surface-2 py-2 text-[11.5px] font-bold text-text disabled:opacity-50"
          >
            {generatingPdf ? "Generando…" : "📄 Descargar mi reporte en PDF"}
          </button>
        </div>
      </Section>

      <Section title="Mi reporte">
        <div className="rounded-xl border border-border bg-surface p-3">
          <div className="grid grid-cols-3 gap-1.5">
            {[
              { label: "Ventas", val: ventasOK },
              { label: "Puntualidad", val: null },
              { label: "Servicio", val: b?.service ?? null },
              { label: "Alistamiento", val: b?.task_alistamiento ?? null },
              { label: "Inventario", val: b?.task_inventario ?? null },
              { label: "Apertura", val: b?.task_apertura ?? null },
              { label: "Cierre", val: b?.task_cierre ?? null },
            ].map((c) => (
              <div key={c.label} className="flex flex-col items-center gap-1 rounded-lg border border-border bg-surface-2 px-1 py-1.5">
                <div className="text-lg">{emojiFor(c.val)}</div>
                <div className="text-center text-[8.5px] leading-tight text-text-faint">{c.label}</div>
              </div>
            ))}
          </div>
        </div>
      </Section>

      <Section title="Mi turno">
        {misTurnos.length === 0 ? (
          <EmptyState text="No tienes turno asignado hoy." />
        ) : (
          <div className="space-y-1.5">
            {misTurnos.map((t) => (
              <div key={t.id} className="flex items-start gap-2.5 rounded-lg border border-border bg-surface-2 px-2.5 py-2">
                <input
                  type="checkbox"
                  checked={t.done}
                  onChange={(e) => toggleMiTarea(t.id, e.target.checked)}
                  className="mt-0.5 h-[18px] w-[18px] flex-none accent-gold"
                />
                <div className="text-[11.5px]">
                  <div className="font-bold">{t.area || "Tu turno"}</div>
                  {t.schedule_label && <div className="mt-0.5 text-text-dim">{t.schedule_label}</div>}
                  {t.cleaning_task ? (
                    <div className={`mt-0.5 ${t.done ? "text-green line-through" : "text-amber"}`}>🧽 {t.cleaning_task}</div>
                  ) : (
                    <div className="mt-0.5 text-text-dim">Sin tarea de aseo asignada.</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title="Equipo hoy">
        {props.shiftsToday.length === 0 ? (
          <EmptyState text="Aún no hay turnos publicados para hoy." />
        ) : (
          <div className="space-y-1.5">
            {props.shiftsToday.map((t) => (
              <div key={t.id} className="rounded-lg border border-border bg-surface-2 px-2.5 py-2 text-[11.5px]">
                <div className="font-bold">
                  {t.person_name}
                  {t.area ? ` · ${t.area}` : ""}
                </div>
                {t.schedule_label && <div className="mt-0.5 text-text-dim">{t.schedule_label}</div>}
                {t.cleaning_task && <div className={`mt-0.5 ${t.done ? "text-green line-through" : "text-amber"}`}>🧽 {t.cleaning_task}</div>}
              </div>
            ))}
          </div>
        )}
      </Section>

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 rounded-full bg-gold px-5 py-2.5 text-[12.5px] font-bold text-[#1A140D] shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}
