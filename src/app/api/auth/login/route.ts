import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { verifyPin } from "@/lib/auth/pin";
import { establishSession } from "@/lib/auth/establish-session";
import { syntheticEmailFor } from "@/lib/auth/synthetic-email";

const MAX_ATTEMPTS = 5;
const LOCK_MINUTES = 5;

// Mensaje genérico a propósito: no revela si el problema fue el usuario, el PIN
// o el bloqueo por intentos — igual de vago para un atacante en cualquier caso.
const GENERIC_ERROR = "PIN incorrecto. Revisa que el nombre seleccionado sea el tuyo, o pide a un jefe que lo restablezca.";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const userId = typeof body?.userId === "string" ? body.userId : null;
  const pin = typeof body?.pin === "string" ? body.pin : null;
  if (!userId || !pin) {
    return NextResponse.json({ error: GENERIC_ERROR }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: user, error: fetchError } = await admin
    .from("users")
    .select("id, pin_hash, active, role, subrole, failed_pin_attempts, locked_until")
    .eq("id", userId)
    .single();

  if (fetchError || !user || !user.active) {
    return NextResponse.json({ error: GENERIC_ERROR }, { status: 401 });
  }

  if (user.locked_until && new Date(user.locked_until).getTime() > Date.now()) {
    return NextResponse.json(
      { error: "Demasiados intentos fallidos. Intenta de nuevo en unos minutos." },
      { status: 429 },
    );
  }

  const pinOk = await verifyPin(pin, user.pin_hash);
  if (!pinOk) {
    const nextAttempts = (user.failed_pin_attempts ?? 0) + 1;
    const lockingNow = nextAttempts >= MAX_ATTEMPTS;
    await admin
      .from("users")
      .update({
        failed_pin_attempts: lockingNow ? 0 : nextAttempts,
        locked_until: lockingNow ? new Date(Date.now() + LOCK_MINUTES * 60_000).toISOString() : null,
      })
      .eq("id", userId);
    return NextResponse.json({ error: GENERIC_ERROR }, { status: 401 });
  }

  await admin.from("users").update({ failed_pin_attempts: 0, locked_until: null }).eq("id", userId);

  const supabase = await createClient();
  const { error: sessionError } = await establishSession(supabase, syntheticEmailFor(user.id));
  if (sessionError) {
    return NextResponse.json({ error: sessionError }, { status: 500 });
  }

  const role = user.role === "jefe" ? "jefe" : user.subrole;
  return NextResponse.json({ ok: true, role });
}
