-- Patch: permite leer nombres de usuarios activos SIN sesión (anon), para el
-- selector de nombre en /login. Ya está incluido en supabase/schema.sql para
-- instalaciones nuevas — esto es solo para aplicarlo sobre el proyecto que ya
-- corriste. Correr una vez en el editor SQL de Supabase.

drop policy if exists "users: lectura publica para login" on public.users;
create policy "users: lectura publica para login" on public.users for select to anon using (active = true);
grant select (id, name, active) on public.users to anon;
