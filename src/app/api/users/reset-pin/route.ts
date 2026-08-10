import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentAppUser, roleOf } from "@/lib/auth/current-user";
import { generatePin, hashPin } from "@/lib/auth/pin";

// Restablecer PIN (equivalente a onUserAction('pin', id) del original). Solo-jefe.
export async function POST(request: Request) {
  const caller = await getCurrentAppUser();
  if (!caller || roleOf(caller) !== "jefe") {
    return NextResponse.json({ error: "Solo un jefe puede restablecer un PIN." }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const userId = typeof body?.userId === "string" ? body.userId : null;
  if (!userId) {
    return NextResponse.json({ error: "Falta el usuario." }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: target } = await admin.from("users").select("id, name").eq("id", userId).single();
  if (!target) {
    return NextResponse.json({ error: "Usuario no encontrado." }, { status: 404 });
  }

  const pin = generatePin();
  const pinHash = await hashPin(pin);
  const { error: updateError } = await admin
    .from("users")
    .update({ pin_hash: pinHash, failed_pin_attempts: 0, locked_until: null })
    .eq("id", userId);
  if (updateError) {
    return NextResponse.json({ error: "No se pudo restablecer el PIN." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, name: target.name, pin });
}
