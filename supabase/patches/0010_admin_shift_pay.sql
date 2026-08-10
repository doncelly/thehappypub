-- Patch: turnos de administración pagados por hora (nuevo respecto al
-- original — ahí "Admin de turno" era solo un campo de texto, sin tarifa). El
-- mismo jefe puede cubrir un turno de mesero Y uno de administración el mismo
-- día; cada uno se paga con su propia tarifa, así que attendance necesita
-- distinguir bajo qué tipo de turno se marcó cada entrada/salida.
-- Ya está reflejado en supabase/schema.sql para instalaciones nuevas — esto es
-- solo para aplicarlo sobre el proyecto que ya corriste. Correr después de
-- 0001-0009.

alter table public.hourly_rates
  add column if not exists administracion_flat numeric not null default 0;

alter table public.attendance
  add column if not exists work_type text not null default 'mesero' check (work_type in ('mesero', 'cocinero', 'administracion'));

-- Backfill: las filas que ya existen se etiquetan según el subrol del usuario
-- (así ningún registro de asistencia real que ya tenías queda huérfano).
update public.attendance a
set work_type = coalesce(u.subrole, 'mesero')
from public.users u
where a.user_id = u.id and u.subrole in ('mesero', 'cocinero');

alter table public.attendance drop constraint if exists attendance_user_id_date_key;
alter table public.attendance drop constraint if exists attendance_user_id_date_work_type_key;
alter table public.attendance add constraint attendance_user_id_date_work_type_key unique (user_id, date, work_type);
