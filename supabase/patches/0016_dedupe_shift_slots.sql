-- Patch: el patch 0013 insertaba los slots de turno (Cocina 1, Mesas 1, Mesas
-- 2...) sin protección contra duplicados — si el CATCHUP se corrió más de una
-- vez, quedaron duplicados (cada slot x2). Este patch los limpia y agrega una
-- restricción única para que no vuelva a pasar. Ya está reflejado en
-- supabase/schema.sql y supabase/seed.sql para instalaciones nuevas. Correr
-- después de 0001-0015 (seguro de correr más de una vez).

-- Se queda con la fila más antigua de cada (weekday, shift_type, slot_label)
-- y borra el resto — todas las duplicadas tienen el mismo contenido porque
-- vienen de repetir el mismo insert, así que no importa cuál se conserva.
delete from public.shift_schedule_templates a
using public.shift_schedule_templates b
where a.weekday = b.weekday
  and a.shift_type = b.shift_type
  and a.slot_label = b.slot_label
  and a.id > b.id;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'shift_schedule_templates_slot_unique'
  ) then
    alter table public.shift_schedule_templates
      add constraint shift_schedule_templates_slot_unique unique (weekday, shift_type, slot_label);
  end if;
end $$;
