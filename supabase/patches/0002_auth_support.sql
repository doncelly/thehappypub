-- Patch: soporte para el login por PIN + Supabase Auth (Paso 3).
-- Ya está incluido en supabase/schema.sql para instalaciones nuevas — esto es
-- solo para aplicarlo sobre el proyecto que ya corriste. Correr una vez en el
-- editor SQL de Supabase, DESPUÉS de 0001_public_login_read.sql.

alter table public.users
  add column if not exists failed_pin_attempts integer not null default 0,
  add column if not exists locked_until timestamptz;

create or replace function public.current_app_user()
returns table(id uuid, name text, role text, subrole text, active boolean)
language sql
security definer
stable
set search_path = public
as $$
  select u.id, u.name, u.role, u.subrole, u.active
  from public.users u
  where u.auth_user_id = auth.uid();
$$;
comment on function public.current_app_user is
  'Perfil propio para la app (who-bar, nav por rol). El cliente no tiene GRANT sobre '
  'users.auth_user_id (sección 16 de schema.sql) así que no puede hacer este filtro por '
  'su cuenta — por eso es una función SECURITY DEFINER en vez de una policy + select normal.';

grant execute on function public.current_app_user() to authenticated;
