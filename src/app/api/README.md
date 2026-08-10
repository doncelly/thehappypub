# API routes

## Implementados (Paso 3)

- `auth/setup` — crea el primer jefe (solo si `public.users` está vacía).
- `auth/login` — verifica PIN contra `pin_hash` (bcrypt) + bloqueo temporal tras 5
  intentos fallidos, y crea la sesión real de Supabase Auth (ver
  `src/lib/auth/establish-session.ts`).
- `auth/logout` — cierra sesión.
- `users/create` — solo-jefe. Crea `auth.users` (email sintético) + fila en
  `public.users`. Devuelve el PIN en texto plano una sola vez.
- `users/reset-pin` — solo-jefe. Genera PIN nuevo y actualiza `pin_hash`.

## Pendientes (Paso 4, según se necesiten)

- `checklist/upload-photo` — podría hacerse client-side directo contra Storage
  (ya tiene RLS propio, ver `schema.sql` sección 17) en vez de por acá; se decide
  cuando se construya el módulo de Checklist.
