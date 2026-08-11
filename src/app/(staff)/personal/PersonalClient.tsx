"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Section, EmptyState, FieldLabel, inputCls, MiniButton } from "@/components/panel-ui";

type UserRow = { id: string; name: string; role: "jefe" | "staff"; subrole: "mesero" | "cocinero" | null; active: boolean };
type Rates = { mesero_antes_medianoche: number; mesero_despues_medianoche: number; cocinero_flat: number; administracion_flat: number } | null;
type Geofence = { arrive_radius_m: number; leave_radius_m: number } | null;

type Props = {
  users: UserRow[];
  rates: Rates;
  geofence: Geofence;
};

function roleLabel(u: UserRow): string {
  return u.role === "jefe" ? "Jefe" : u.subrole === "cocinero" ? "Cocinero" : "Mesero";
}

export function PersonalClient({ users, rates, geofence }: Props) {
  const router = useRouter();
  const supabase = createClient();

  const [name, setName] = useState("");
  const [role, setRole] = useState<"staff" | "jefe">("staff");
  const [subrole, setSubrole] = useState<"mesero" | "cocinero">("mesero");
  const [pin, setPin] = useState("");
  const [creating, setCreating] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [rMeseroAntes, setRMeseroAntes] = useState(String(rates?.mesero_antes_medianoche ?? ""));
  const [rMeseroDespues, setRMeseroDespues] = useState(String(rates?.mesero_despues_medianoche ?? ""));
  const [rCocineroFlat, setRCocineroFlat] = useState(String(rates?.cocinero_flat ?? ""));
  const [rAdminFlat, setRAdminFlat] = useState(String(rates?.administracion_flat ?? ""));
  const [savingRates, setSavingRates] = useState(false);

  const [geoArrive, setGeoArrive] = useState(String(geofence?.arrive_radius_m ?? ""));
  const [geoLeave, setGeoLeave] = useState(String(geofence?.leave_radius_m ?? ""));
  const [savingGeo, setSavingGeo] = useState(false);

  const activeJefes = users.filter((u) => u.role === "jefe" && u.active).length;
  const sorted = [...users].sort((a, b) => {
    if (a.role !== b.role) return a.role === "jefe" ? -1 : 1;
    if (a.active !== b.active) return a.active ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  const meseros = users.filter((u) => u.active && u.role === "staff" && u.subrole === "mesero");

  async function createUser() {
    setError(null);
    setCreating(true);
    try {
      const res = await fetch("/api/users/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, role, subrole: role === "staff" ? subrole : undefined, pin: pin || undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "No se pudo crear el usuario.");
        return;
      }
      setBanner(`Usuario creado. PIN de ${data.name}: ${data.pin} — compártelo por fuera de esta pantalla.`);
      setName("");
      setPin("");
      router.refresh();
    } finally {
      setCreating(false);
    }
  }

  async function resetPin(userId: string) {
    setError(null);
    const res = await fetch("/api/users/reset-pin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "No se pudo restablecer el PIN.");
      return;
    }
    setBanner(`Nuevo PIN de ${data.name}: ${data.pin} — compártelo por fuera de esta pantalla.`);
  }

  async function toggleActive(u: UserRow) {
    setError(null);
    const { error: err } = await supabase.from("users").update({ active: !u.active }).eq("id", u.id);
    if (err) {
      setError(err.message);
      return;
    }
    router.refresh();
  }

  async function deleteUser(u: UserRow) {
    setError(null);
    if (!confirm(`¿Eliminar a ${u.name} definitivamente? Esta acción no se puede deshacer.`)) return;
    const res = await fetch("/api/users/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: u.id }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "No se pudo eliminar.");
      return;
    }
    router.refresh();
  }

  async function saveRates() {
    setSavingRates(true);
    try {
      await supabase
        .from("hourly_rates")
        .update({
          mesero_antes_medianoche: Number(rMeseroAntes) || 0,
          mesero_despues_medianoche: Number(rMeseroDespues) || 0,
          cocinero_flat: Number(rCocineroFlat) || 0,
          administracion_flat: Number(rAdminFlat) || 0,
        })
        .eq("id", 1);
      router.refresh();
    } finally {
      setSavingRates(false);
    }
  }

  async function saveGeo() {
    setSavingGeo(true);
    try {
      await supabase
        .from("geofence_settings")
        .update({ arrive_radius_m: Number(geoArrive) || 70, leave_radius_m: Number(geoLeave) || 150 })
        .eq("id", 1);
      router.refresh();
    } finally {
      setSavingGeo(false);
    }
  }

  return (
    <div>
      {error && <div className="mb-3.5 rounded-lg border border-red/40 bg-red/10 px-3 py-2 text-[11.5px] text-red">{error}</div>}

      <Section title="Crear usuario">
        <div className="space-y-2.5 rounded-xl border border-border bg-surface p-3.5">
          <div>
            <FieldLabel>Nombre</FieldLabel>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej: Erika" className={inputCls} />
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <FieldLabel>Rol</FieldLabel>
              <select value={role} onChange={(e) => setRole(e.target.value as "staff" | "jefe")} className={inputCls}>
                <option value="staff">Personal (mesero/cocinero)</option>
                <option value="jefe">Jefe / Administrador</option>
              </select>
            </div>
            {role === "staff" && (
              <div>
                <FieldLabel>Tipo</FieldLabel>
                <select value={subrole} onChange={(e) => setSubrole(e.target.value as "mesero" | "cocinero")} className={inputCls}>
                  <option value="mesero">Mesero</option>
                  <option value="cocinero">Cocinero</option>
                </select>
              </div>
            )}
          </div>
          <div>
            <FieldLabel>PIN (4 dígitos, opcional)</FieldLabel>
            <input
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
              maxLength={4}
              inputMode="numeric"
              placeholder="Auto"
              className={inputCls}
            />
          </div>
          <button
            onClick={createUser}
            disabled={creating || !name.trim()}
            className="w-full rounded-lg bg-gold py-2.5 text-[13px] font-bold text-[#1A140D] disabled:opacity-50"
          >
            {creating ? "Creando…" : "Crear usuario"}
          </button>
        </div>
        {banner && (
          <div className="mt-2.5 rounded-lg border border-green/40 bg-green/10 px-3 py-2 text-[12px] leading-relaxed text-green">
            {banner}
          </div>
        )}
      </Section>

      <Section title="Equipo">
        {sorted.length === 0 ? (
          <EmptyState text="Sin usuarios todavía." />
        ) : (
          <div className="space-y-1.5">
            {sorted.map((u) => {
              const isLastJefe = u.role === "jefe" && u.active && activeJefes <= 1;
              return (
                <div key={u.id} className="rounded-xl border border-border bg-surface px-3 py-2.5">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-8 w-8 flex-none items-center justify-center rounded-full border border-border bg-surface-2 text-[11px] font-bold text-gold">
                      {u.name
                        .trim()
                        .split(/\s+/)
                        .map((w) => w[0])
                        .slice(0, 2)
                        .join("")
                        .toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1 flex-wrap items-center gap-1.5 text-[12.5px] font-semibold sm:flex">
                      <div className="truncate">{u.name}</div>
                      <span
                        className={`rounded px-1.5 py-0.5 font-mono text-[8.5px] uppercase ${
                          u.role === "jefe" ? "bg-gold/20 text-gold" : "bg-text-dim/15 text-text-dim"
                        }`}
                      >
                        {roleLabel(u)}
                      </span>
                      {!u.active && <span className="rounded bg-red/15 px-1.5 py-0.5 font-mono text-[8.5px] uppercase text-red">Inactivo</span>}
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap justify-end gap-1.5">
                    <MiniButton onClick={() => resetPin(u.id)}>Restablecer PIN</MiniButton>
                    {u.active ? (
                      <MiniButton variant="warn" onClick={() => toggleActive(u)} disabled={isLastJefe}>
                        Quitar acceso
                      </MiniButton>
                    ) : (
                      <MiniButton onClick={() => toggleActive(u)}>Reactivar</MiniButton>
                    )}
                    <MiniButton variant="danger" onClick={() => deleteUser(u)} disabled={isLastJefe}>
                      Eliminar
                    </MiniButton>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Section>

      <Section title="Tarifas por hora">
        <p className="mb-2.5 text-[11px] text-text-faint">
          Se usan para calcular el acumulado que ve cada persona en &quot;Mi día&quot;. Mesero tiene franja nocturna; cocinero es tarifa
          plana.
        </p>
        <div className="space-y-2.5 rounded-xl border border-border bg-surface p-3.5">
          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <FieldLabel>Mesero — antes de medianoche ($/h)</FieldLabel>
              <input type="number" value={rMeseroAntes} onChange={(e) => setRMeseroAntes(e.target.value)} className={inputCls} />
            </div>
            <div>
              <FieldLabel>Mesero — desde medianoche ($/h)</FieldLabel>
              <input type="number" value={rMeseroDespues} onChange={(e) => setRMeseroDespues(e.target.value)} className={inputCls} />
            </div>
          </div>
          <div>
            <FieldLabel>Cocinero — tarifa plana ($/h)</FieldLabel>
            <input type="number" value={rCocineroFlat} onChange={(e) => setRCocineroFlat(e.target.value)} className={inputCls} />
          </div>
          <div>
            <FieldLabel>Administración — tarifa plana ($/h)</FieldLabel>
            <input type="number" value={rAdminFlat} onChange={(e) => setRAdminFlat(e.target.value)} className={inputCls} />
          </div>
          <button
            onClick={saveRates}
            disabled={savingRates}
            className="w-full rounded-lg bg-gold py-2.5 text-[13px] font-bold text-[#1A140D] disabled:opacity-50"
          >
            {savingRates ? "Guardando…" : "Guardar tarifas"}
          </button>
        </div>
      </Section>

      <Section title="Radio de ubicación">
        <p className="mb-2.5 text-[11px] text-text-faint">
          Qué tan cerca del local debe estar alguien para que se marque su llegada sola, y qué tan lejos para la salida.
        </p>
        <div className="space-y-2.5 rounded-xl border border-border bg-surface p-3.5">
          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <FieldLabel>Llegada (metros)</FieldLabel>
              <input type="number" value={geoArrive} onChange={(e) => setGeoArrive(e.target.value)} className={inputCls} />
            </div>
            <div>
              <FieldLabel>Salida (metros)</FieldLabel>
              <input type="number" value={geoLeave} onChange={(e) => setGeoLeave(e.target.value)} className={inputCls} />
            </div>
          </div>
          <button
            onClick={saveGeo}
            disabled={savingGeo}
            className="w-full rounded-lg bg-gold py-2.5 text-[13px] font-bold text-[#1A140D] disabled:opacity-50"
          >
            {savingGeo ? "Guardando…" : "Guardar radio"}
          </button>
        </div>
      </Section>

      <Section title="QR de calificación de servicio">
        {meseros.length === 0 ? (
          <EmptyState text="No hay meseros activos todavía." />
        ) : (
          <div className="grid grid-cols-2 gap-2.5">
            {meseros.map((u) => (
              <QrCard key={u.id} userId={u.id} name={u.name} />
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}

function QrCard({ userId, name }: { userId: string; name: string }) {
  const [origin, setOrigin] = useState("");
  useEffect(() => {
    const id = setTimeout(() => setOrigin(window.location.origin), 0);
    return () => clearTimeout(id);
  }, []);
  const rateUrl = origin ? `${origin}/rate/${userId}` : "";
  const qrImg = rateUrl ? `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(rateUrl)}` : "";

  return (
    <div className="rounded-xl border border-border bg-surface p-2.5 text-center">
      <div className="mb-1.5 text-[11.5px] font-bold">{name}</div>
      {qrImg && (
        // eslint-disable-next-line @next/next/no-img-element -- imagen generada por un servicio externo de QR, no un asset local
        <img src={qrImg} alt={`QR de ${name}`} className="mx-auto h-[150px] w-[150px] rounded-lg bg-white p-1.5" />
      )}
      <div className="mt-1.5 text-[9.5px] text-text-faint">Imprime esta imagen y ponla en su mesa asignada</div>
    </div>
  );
}
