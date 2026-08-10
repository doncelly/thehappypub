-- Patch: feed de "Actividad reciente" del Panel (shared.activity[] del original).
-- Ya está incluido en supabase/schema.sql para instalaciones nuevas — esto es
-- solo para aplicarlo sobre el proyecto que ya corriste. Correr una vez en el
-- editor SQL de Supabase, DESPUÉS de 0001, 0002 y 0003.

create table if not exists public.activity_log (
  id          bigint generated always as identity primary key,
  message     text not null,
  color       text not null default '#E8A33D',
  created_at  timestamptz not null default now()
);
comment on table public.activity_log is 'shared.activity[] del original — solo la escriben triggers, nunca el cliente directamente.';

alter table public.activity_log enable row level security;

drop policy if exists "activity_log: lectura jefe" on public.activity_log;
create policy "activity_log: lectura jefe" on public.activity_log for select to authenticated using (public.is_jefe());

create or replace function public.log_item_status_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  item_name text;
  item_unit text;
  actor_name text;
  level_label text;
begin
  select name, unit into item_name, item_unit from public.items where id = new.item_id;
  select name into actor_name from public.users where id = new.updated_by;
  actor_name := coalesce(actor_name, 'Alguien');

  if new.status_gauge is not null then
    level_label := case new.status_gauge
      when 'completo' then 'Completo'
      when 'tres_cuartos' then '3/4'
      when 'mitad' then 'Mitad'
      when 'un_cuarto' then '1/4'
      when 'agotado' then 'Agotado'
      else new.status_gauge
    end;
    insert into public.activity_log (message, color)
    values (
      format('%s marcó "%s" como %s', actor_name, item_name, level_label),
      case new.status_gauge
        when 'completo' then '#7FA66E'
        when 'tres_cuartos' then '#A3B25A'
        when 'mitad' then '#E0A83F'
        when 'un_cuarto' then '#D9793A'
        when 'agotado' then '#C1462F'
        else '#E8A33D'
      end
    );
  elsif new.qty is not null then
    insert into public.activity_log (message, color)
    values (
      format('%s ajustó "%s" a %s %s', actor_name, item_name, new.qty, coalesce(item_unit, '')),
      '#E8A33D'
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_item_status_activity on public.item_status;
create trigger trg_item_status_activity after insert or update on public.item_status
  for each row execute function public.log_item_status_activity();

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'activity_log'
  ) then
    alter publication supabase_realtime add table public.activity_log;
  end if;
end $$;
