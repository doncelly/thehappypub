-- Patch: meta mensual mínima ("para no estar en rojos"), solo-jefe, editable
-- desde Panel. Ya está reflejado en supabase/schema.sql para instalaciones
-- nuevas — esto es solo para aplicarlo sobre el proyecto que ya corriste.
-- Correr después de 0001-0018.

create table if not exists public.monthly_goal_settings (
  id        integer primary key default 1,
  min_goal  numeric not null default 19000000,
  constraint monthly_goal_settings_singleton check (id = 1)
);
comment on table public.monthly_goal_settings is 'Meta mensual mínima de punto de equilibrio, editable por jefe — ver Panel.';

insert into public.monthly_goal_settings (id, min_goal) values (1, 19000000) on conflict (id) do nothing;

alter table public.monthly_goal_settings enable row level security;

drop policy if exists "monthly_goal_settings: solo jefe" on public.monthly_goal_settings;
create policy "monthly_goal_settings: solo jefe" on public.monthly_goal_settings for all to authenticated
  using (public.is_jefe()) with check (public.is_jefe());
