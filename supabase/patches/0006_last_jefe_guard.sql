-- Patch: nunca permitir desactivar ni eliminar al último jefe activo, a nivel
-- de base de datos (no solo deshabilitando el botón en el cliente como hacía
-- el original). Ya está incluido en supabase/schema.sql para instalaciones
-- nuevas — esto es solo para aplicarlo sobre el proyecto que ya corriste.
-- Correr después de 0001-0005.

create or replace function public.prevent_last_jefe_deactivation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.role = 'jefe' and old.active = true and new.active = false then
    if (select count(*) from public.users where role = 'jefe' and active = true and id <> old.id) = 0 then
      raise exception 'Debe existir al menos un jefe activo.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_prevent_last_jefe_deactivation on public.users;
create trigger trg_prevent_last_jefe_deactivation before update on public.users
  for each row execute function public.prevent_last_jefe_deactivation();

create or replace function public.prevent_last_jefe_deletion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.role = 'jefe' and old.active = true then
    if (select count(*) from public.users where role = 'jefe' and active = true and id <> old.id) = 0 then
      raise exception 'Debe existir al menos un jefe activo.';
    end if;
  end if;
  return old;
end;
$$;

drop trigger if exists trg_prevent_last_jefe_deletion on public.users;
create trigger trg_prevent_last_jefe_deletion before delete on public.users
  for each row execute function public.prevent_last_jefe_deletion();
