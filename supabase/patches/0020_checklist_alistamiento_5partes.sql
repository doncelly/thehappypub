-- Patch: "Alistamiento" del checklist pasa de un solo Listo/foto a 5 partes
-- reales (1.1 Apertura de caja, 1.2 Inventarios y documentos de sanidad,
-- 1.3 Organización de los espacios, 1.4 Limpieza de cristalería, 1.5
-- Actividad del día), cada una con su propio Listo/foto. Ya está reflejado
-- en supabase/schema.sql para instalaciones nuevas — esto es solo para
-- aplicarlo sobre el proyecto que ya corriste. Correr después de 0001-0019.

alter table public.checklist_entries drop constraint if exists checklist_entries_section_check;
alter table public.checklist_entries add constraint checklist_entries_section_check check (section in (
  'alistamiento', -- legado, ya no se escribe — reemplazado por los 5 de abajo
  'inventario','apertura','cierre',
  'alistamiento_apertura_caja','alistamiento_inventarios_sanidad',
  'alistamiento_organizacion','alistamiento_cristaleria','alistamiento_actividad_dia'
));

alter table public.checklist_photos drop constraint if exists checklist_photos_section_check;
alter table public.checklist_photos add constraint checklist_photos_section_check check (section in (
  'alistamiento',
  'inventario','apertura','cierre',
  'alistamiento_apertura_caja','alistamiento_inventarios_sanidad',
  'alistamiento_organizacion','alistamiento_cristaleria','alistamiento_actividad_dia'
));
