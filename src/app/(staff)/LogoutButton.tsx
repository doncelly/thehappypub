"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function LogoutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function onClick() {
    setPending(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      router.replace("/login");
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <button
      onClick={onClick}
      disabled={pending}
      className="rounded-md border border-border px-2.5 py-1.5 text-[10px] font-semibold text-text-dim disabled:opacity-50"
    >
      Cerrar sesión
    </button>
  );
}
