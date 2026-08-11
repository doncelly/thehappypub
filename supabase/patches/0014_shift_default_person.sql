-- Patch: sugerir quién cubre cada slot de turno (Sol → Mesas 1, Javier →
-- Mesas 2) al elegirlo en Turnos — sigue siendo editable, Cocina 1 no tiene
-- persona fija porque rota. Ya está reflejado en supabase/schema.sql y
-- supabase/seed.sql para instalaciones nuevas — esto es solo para aplicarlo
-- sobre el proyecto que ya corriste. Correr después de 0001-0013.

alter table public.shift_schedule_templates add column if not exists default_person text;

update public.shift_schedule_templates set default_person = 'Sol' where slot_label = 'Mesas 1';
update public.shift_schedule_templates set default_person = 'Javier' where slot_label = 'Mesas 2';
