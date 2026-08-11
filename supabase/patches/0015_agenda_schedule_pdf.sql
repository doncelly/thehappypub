-- Patch: guarda el PDF de horario semanal en Storage (agenda-schedules/) y
-- deja que cualquier autenticado (jefe, mesero, cocinero) lo lea; solo jefe
-- puede generarlo/subirlo. Ya está reflejado en supabase/schema.sql para
-- instalaciones nuevas — esto es solo para aplicarlo sobre el proyecto que ya
-- corriste. Correr después de 0001-0014.

drop policy if exists "storage: checklist propio o jefe lee" on storage.objects;
create policy "storage: checklist propio o jefe lee"
on storage.objects for select to authenticated using (
  bucket_id = 'happy-pub-photos' and (
    public.is_jefe() or
    ( (storage.foldername(name))[1] = 'checklist' and (storage.foldername(name))[3] = public.current_user_id()::text ) or
    (storage.foldername(name))[1] = 'deliveries' or
    (storage.foldername(name))[1] = 'agenda-schedules'
  )
);

drop policy if exists "storage: checklist propio sube" on storage.objects;
create policy "storage: checklist propio sube"
on storage.objects for insert to authenticated with check (
  bucket_id = 'happy-pub-photos' and (
    ( (storage.foldername(name))[1] = 'checklist' and (storage.foldername(name))[3] = public.current_user_id()::text ) or
    (storage.foldername(name))[1] = 'deliveries' or
    ( (storage.foldername(name))[1] = 'agenda-schedules' and public.is_jefe() )
  )
);
