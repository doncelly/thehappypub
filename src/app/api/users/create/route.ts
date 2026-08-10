import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentAppUser, roleOf } from "@/lib/auth/current-user";
import { generatePin, hashPin, isValidPin } from "@/lib/auth/pin";
import { syntheticEmailFor } from "@/lib/auth/synthetic-email";

// Crear empleado (equivalente a onCreateUser() del HTML original, Personal —
// Paso 4 conecta la UI a este endpoint). Solo-jefe.
export async function POST(request: Request) {
  const caller = await getCurrentAppUser();
  if (!caller || roleOf(caller) !== "jefe") {
    return NextResponse.json({ error: "Solo un jefe puede crear usuarios." }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const role = body?.role === "jefe" ? "jefe" : "staff";
  const subrole = role === "staff" ? (body?.subrole === "cocinero" ? "cocinero" : "mesero") : null;
  const requestedPin = typeof body?.pin === "string" && body.pin.length > 0 ? body.pin : null;

  if (!name) {
    return NextResponse.json({ error: "Escribe un nombre." }, { status: 400 });
  }
  if (requestedPin && !isValidPin(requestedPin)) {
    return NextResponse.json({ error: "El PIN debe tener 4 dígitos." }, { status: 400 });
  }

  const pin = requestedPin ?? generatePin();
  const id = randomUUID();
  const email = syntheticEmailFor(id);
  const admin = createAdminClient();

  const { data: authUser, error: createAuthError } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
  });
  if (createAuthError || !authUser?.user) {
    return NextResponse.json({ error: "No se pudo crear la cuenta." }, { status: 500 });
  }

  const pinHash = await hashPin(pin);
  const { error: insertError } = await admin.from("users").insert({
    id,
    auth_user_id: authUser.user.id,
    name,
    pin_hash: pinHash,
    role,
    subrole,
    active: true,
  });
  if (insertError) {
    await admin.auth.admin.deleteUser(authUser.user.id);
    return NextResponse.json({ error: "No se pudo crear la cuenta." }, { status: 500 });
  }

  // El PIN en texto plano se devuelve UNA sola vez, para que el jefe lo comparta
  // fuera de la app — igual que el pinBanner del original. No se guarda en ningún lado.
  return NextResponse.json({ ok: true, name, pin });
}
