"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function SetupForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      const res = await fetch("/api/auth/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, pin }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "No se pudo crear la cuenta.");
        return;
      }
      router.replace("/panel");
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit}>
      {error && (
        <div className="mb-3.5 rounded-lg border border-red/40 bg-red/10 px-2.5 py-2 text-xs text-red">
          {error}
        </div>
      )}
      <div className="mb-3.5">
        <label className="mb-1.5 block font-mono text-[10px] uppercase tracking-wide text-text-faint">
          Tu nombre
        </label>
        <input
          type="text"
          placeholder="Ej: Cristian"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2.5 text-sm font-semibold text-text"
        />
      </div>
      <div className="mb-3.5">
        <label className="mb-1.5 block font-mono text-[10px] uppercase tracking-wide text-text-faint">
          Crea un PIN (4 dígitos)
        </label>
        <input
          type="text"
          inputMode="numeric"
          maxLength={4}
          placeholder="••••"
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
          className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2.5 text-center font-mono text-lg tracking-[8px] text-text"
        />
      </div>
      <button
        type="submit"
        disabled={pending || pin.length !== 4 || !name.trim()}
        className="mt-1 w-full rounded-lg bg-gold py-3 text-sm font-bold text-[#1A140D] disabled:opacity-50"
      >
        {pending ? "Creando…" : "Crear cuenta de jefe"}
      </button>
    </form>
  );
}
