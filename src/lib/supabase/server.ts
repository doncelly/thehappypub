import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@/lib/types/database.types";

// Cliente de Supabase para Server Components / Server Actions / Route Handlers.
// Usa la anon key + cookies de sesión — sigue pasando por RLS como el usuario logueado.
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value, ...options });
          } catch {
            // Se llama desde un Server Component sin permiso de escritura de cookies.
            // Se ignora: el middleware (src/middleware.ts) se encarga de refrescar la sesión.
          }
        },
        remove(name: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value: "", ...options });
          } catch {
            // Ver comentario en set().
          }
        },
      },
    },
  );
}
