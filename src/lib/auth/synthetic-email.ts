import "server-only";

// Supabase Auth necesita un email. El usuario nunca lo ve ni lo usa — solo
// existe para que auth.users tenga una fila vinculable a public.users.id
// (estable: no cambia aunque el jefe le cambie el nombre a alguien).
const SYNTHETIC_EMAIL_DOMAIN = "users.thehappypub.internal";

export function syntheticEmailFor(userId: string): string {
  return `${userId}@${SYNTHETIC_EMAIL_DOMAIN}`;
}
