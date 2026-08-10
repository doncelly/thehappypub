import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database.types";

/**
 * Cliente con la service role key — SALTA RLS por completo.
 *
 * Uso exclusivo en Route Handlers / Server Actions, y solo para lo que de verdad
 * lo necesita:
 *   - Provisionar auth.users al crear un empleado (Paso 3).
 *   - Verificar el PIN contra pin_hash y emitir la sesión (Paso 3).
 *   - Restablecer el PIN de un usuario (solo tras confirmar que quien llama es jefe).
 *
 * El paquete "server-only" hace que el build falle si esto se importa desde un
 * Client Component por error.
 */
export function createAdminClient() {
  return createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}
