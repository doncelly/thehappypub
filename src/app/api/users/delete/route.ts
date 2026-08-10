import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentAppUser, roleOf } from "@/lib/auth/current-user";

// Eliminar usuario (equivalente a onUserAction('delete', id) del original).
// Solo-jefe. Borra tanto la fila de public.users como su auth.users vinculado
// (si no se limpia, queda una cuenta de Supabase Auth huérfana). El trigger
// trg_prevent_last_jefe_deletion es la última línea de defensa si esto se
// llama para el único jefe activo.
export async function POST(request: Request) {
  const caller = await getCurrentAppUser();
  if (!caller || roleOf(caller) !== "jefe") {
    return NextResponse.json({ error: "Solo un jefe puede eliminar usuarios." }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const userId = typeof body?.userId === "string" ? body.userId : null;
  if (!userId) {
    return NextResponse.json({ error: "Falta el usuario." }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: target } = await admin.from("users").select("id, auth_user_id").eq("id", userId).single();
  if (!target) {
    return NextResponse.json({ error: "Usuario no encontrado." }, { status: 404 });
  }

  const { error: deleteError } = await admin.from("users").delete().eq("id", userId);
  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 400 });
  }

  if (target.auth_user_id) {
    await admin.auth.admin.deleteUser(target.auth_user_id);
  }

  return NextResponse.json({ ok: true });
}
