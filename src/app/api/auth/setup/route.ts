import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { hashPin, isValidPin } from "@/lib/auth/pin";
import { establishSession } from "@/lib/auth/establish-session";
import { syntheticEmailFor } from "@/lib/auth/synthetic-email";

// Alta del primer jefe (equivalente a onSetupSubmit() del HTML original).
// Solo funciona mientras no exista NINGÚN usuario todavía — después de eso,
// los usuarios se crean desde Personal (/api/users/create, solo-jefe).
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const pin = typeof body?.pin === "string" ? body.pin : "";

  if (!name || !isValidPin(pin)) {
    return NextResponse.json(
      { error: "Escribe tu nombre y un PIN de 4 dígitos." },
      { status: 400 },
    );
  }

  const admin = createAdminClient();

  const { count, error: countError } = await admin
    .from("users")
    .select("id", { count: "exact", head: true });
  if (countError) {
    return NextResponse.json({ error: "No se pudo verificar el estado del equipo." }, { status: 500 });
  }
  if ((count ?? 0) > 0) {
    return NextResponse.json(
      { error: "Ya existe al menos un usuario — usa el login normal." },
      { status: 409 },
    );
  }

  const id = randomUUID();
  const email = syntheticEmailFor(id);

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
    role: "jefe",
    subrole: null,
    active: true,
  });
  if (insertError) {
    await admin.auth.admin.deleteUser(authUser.user.id); // no dejar un auth.users huérfano
    return NextResponse.json({ error: "No se pudo crear la cuenta." }, { status: 500 });
  }

  const supabase = await createClient();
  const { error: sessionError } = await establishSession(supabase, email);
  if (sessionError) {
    return NextResponse.json({ error: sessionError }, { status: 500 });
  }

  return NextResponse.json({ ok: true, role: "jefe" });
}
