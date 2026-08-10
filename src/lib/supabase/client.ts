"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/lib/types/database.types";

// Cliente de Supabase para Client Components. Usa la anon key — todo el acceso a
// datos pasa por RLS (ver supabase/schema.sql). Nunca importar la service role key aquí.
export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
