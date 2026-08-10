import "server-only";

// console.error(objetoPostgrestError) se ve como "{}" en varios overlays de
// consola (incluido el de Next.js) porque no todos extraen sus propiedades al
// serializar. Con los campos ya como texto, el mensaje real siempre se ve.
export function logSupabaseError(
  label: string,
  error: { message: string; code?: string; details?: string } | null,
) {
  if (!error) return;
  console.error(`[${label}] ${error.message} (code ${error.code ?? "?"})`, error.details ?? "");
}
