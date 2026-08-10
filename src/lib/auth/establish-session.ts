import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Crea una sesión real de Supabase Auth para `email` en el cliente `supabase`
 * dado (debe ser el cliente server-side atado a cookies, ver lib/supabase/server.ts,
 * para que la sesión quede persistida como cookie httpOnly en la respuesta).
 *
 * Cómo funciona: como jefe/mesero/cocinero solo tienen PIN (no password), no
 * podemos usar signInWithPassword. En vez de eso, el service role genera un
 * magic link (que nunca se envía por correo — el email es sintético) y el
 * cliente de la request "canjea" ese token con verifyOtp, exactamente como si
 * el usuario hubiera hecho clic en un magic link real. Esto solo se llama
 * DESPUÉS de verificar el PIN contra pin_hash (ver lib/auth/pin.ts).
 */
export async function establishSession(
  supabase: SupabaseClient,
  email: string,
): Promise<{ error: string | null }> {
  const admin = createAdminClient();

  const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  if (linkError || !linkData?.properties?.hashed_token) {
    console.error("[establishSession] generateLink falló:", linkError, linkData);
    return {
      error:
        process.env.NODE_ENV === "production"
          ? "No se pudo iniciar la sesión. Intenta de nuevo."
          : `generateLink falló: ${linkError?.message ?? "sin hashed_token en la respuesta"}`,
    };
  }

  // Con token_hash NO se debe mandar `email` también — son dos formas de
  // verificar y GoTrue rechaza la mezcla ("Only the token_hash and type should
  // be provided").
  const { error: verifyError } = await supabase.auth.verifyOtp({
    type: "magiclink",
    token_hash: linkData.properties.hashed_token,
  });
  if (verifyError) {
    console.error("[establishSession] verifyOtp falló:", verifyError);
    return {
      error:
        process.env.NODE_ENV === "production"
          ? "No se pudo iniciar la sesión. Intenta de nuevo."
          : `verifyOtp falló: ${verifyError.message}`,
    };
  }

  return { error: null };
}
