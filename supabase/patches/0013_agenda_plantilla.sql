-- Patch: Plantilla semanal de Agenda — valores por defecto de "Operación del
-- día" y horario de turnos por día de semana, editable en Agenda → Plantilla,
-- para no llenar los mismos datos a mano cada día. Ya está reflejado en
-- supabase/schema.sql y supabase/seed.sql (con los datos reales de
-- Horarios.csv) para instalaciones nuevas — esto es solo para aplicarlo sobre
-- el proyecto que ya corriste. Correr después de 0001-0012.

alter table public.default_weekday_tasks add column if not exists transport_aid boolean not null default false;

update public.default_weekday_tasks set transport_aid = true where shift_type = 'mesa' and weekday in (2,3,4,5,6);
update public.default_weekday_tasks set transport_aid = false where shift_type = 'mesa' and weekday in (0,1);
update public.default_weekday_tasks set transport_aid = true where shift_type = 'cocina' and weekday in (2,3,4,5,6);
update public.default_weekday_tasks set transport_aid = false where shift_type = 'cocina' and weekday in (0,1);

create table if not exists public.weekday_templates (
  weekday      integer primary key check (weekday between 0 and 6),
  start_time   time,
  shift_admin  text,
  daily_goal   numeric,
  promo        text,
  event        text
);
comment on table public.weekday_templates is 'Plantilla editable de "Operación del día" por día de semana — ver Agenda → Plantilla.';

create table if not exists public.shift_schedule_templates (
  id             uuid primary key default gen_random_uuid(),
  weekday        integer not null check (weekday between 0 and 6),
  shift_type     text not null check (shift_type in ('mesa','cocina')),
  slot_label     text not null,
  schedule_label text,
  sort_order     integer not null default 0
);
comment on table public.shift_schedule_templates is 'Plantilla editable de horarios por slot de turno y día de semana — ver Agenda → Plantilla.';

-- Necesaria para que el insert de más abajo pueda usar "on conflict" y este
-- patch sea seguro de correr más de una vez (antes no la tenía; si ya la
-- agregó el patch 0016 en una corrida anterior, este bloque no hace nada).
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'shift_schedule_templates_slot_unique'
  ) then
    alter table public.shift_schedule_templates
      add constraint shift_schedule_templates_slot_unique unique (weekday, shift_type, slot_label);
  end if;
end $$;

alter table public.weekday_templates enable row level security;
alter table public.shift_schedule_templates enable row level security;

drop policy if exists "catalogo: lectura autenticados" on public.weekday_templates;
create policy "catalogo: lectura autenticados" on public.weekday_templates for select to authenticated using (true);
drop policy if exists "catalogo: mutacion jefe" on public.weekday_templates;
create policy "catalogo: mutacion jefe" on public.weekday_templates for all to authenticated using (public.is_jefe()) with check (public.is_jefe());

drop policy if exists "catalogo: lectura autenticados" on public.shift_schedule_templates;
create policy "catalogo: lectura autenticados" on public.shift_schedule_templates for select to authenticated using (true);
drop policy if exists "catalogo: mutacion jefe" on public.shift_schedule_templates;
create policy "catalogo: mutacion jefe" on public.shift_schedule_templates for all to authenticated using (public.is_jefe()) with check (public.is_jefe());

insert into public.weekday_templates (weekday, start_time, shift_admin, daily_goal, promo, event) values
  (1, '17:00', '1', 950000,  'Hamburguesa + cerveza artesanal (gratis) antes de 9pm', 'NA'),
  (2, '17:00', '2', 950000,  'Alitas con descuento del 15% todo el día', 'NA'),
  (3, '17:00', '1', 950000,  'Cerveza artesanal de barril con 15% descuento antes de 9pm', 'NA'),
  (4, '16:00', '2', 1710000, 'Cócteles 2x1 antes de 7pm', 'NA'),
  (5, '15:00', '1', 1330000, 'Cerveza artesanal de barril con 15% descuento antes de 9pm', 'NA'),
  (6, '15:00', '2', 1710000, 'Hamburguesa + cerveza artesanal (gratis) antes de 7pm', 'NA'),
  (0, '14:00', null, 950000, 'Alitas con descuento del 15% todo el día', 'NA')
on conflict (weekday) do nothing;

insert into public.shift_schedule_templates (weekday, shift_type, slot_label, schedule_label, sort_order) values
  (1, 'cocina', 'Cocina 1', '15:30 A CIERRE', 1),
  (1, 'mesa',   'Mesas 1',  '15:30 A CIERRE', 1),
  (2, 'cocina', 'Cocina 1', '16:00 A CIERRE', 1),
  (2, 'mesa',   'Mesas 2',  '16:00 A CIERRE', 2),
  (3, 'cocina', 'Cocina 1', '16:00 A CIERRE', 1),
  (3, 'mesa',   'Mesas 1',  '16:00 A CIERRE', 1),
  (4, 'cocina', 'Cocina 1', '15:00 A CIERRE', 1),
  (4, 'mesa',   'Mesas 1',  '15:00 A CIERRE', 1),
  (4, 'mesa',   'Mesas 2',  '19:00 A CIERRE', 2),
  (5, 'cocina', 'Cocina 1', '14:00 A CIERRE', 1),
  (5, 'mesa',   'Mesas 1',  '19:00 A CIERRE', 1),
  (5, 'mesa',   'Mesas 2',  '14:00 A CIERRE', 2),
  (6, 'cocina', 'Cocina 1', '14:00 A CIERRE', 1),
  (6, 'mesa',   'Mesas 1',  '14:00 A CIERRE', 1),
  (6, 'mesa',   'Mesas 2',  '19:00 A CIERRE', 2),
  (0, 'cocina', 'Cocina 1', '13:00 A CIERRE', 1),
  (0, 'mesa',   'Mesas 1',  '13:00 A CIERRE', 1)
on conflict (weekday, shift_type, slot_label) do nothing;
