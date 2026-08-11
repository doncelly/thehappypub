-- Punto 13 del backlog: el reporte semanal del jefe (Panel → "Reporte
-- semanal") ahora también se guarda en Storage (weekly-reports/{date}.pdf)
-- para poder verlo después agrupado por año, igual que agenda-schedules ya
-- hace con el horario. Faltaban las policies de storage.objects para ese
-- prefijo — sin esto, el upload fallaba con 400 por RLS.

drop policy if exists "storage: checklist propio sube" on storage.objects;
create policy "storage: checklist propio sube"
on storage.objects for insert to authenticated with check (
  bucket_id = 'happy-pub-photos' and (
    ( (storage.foldername(name))[1] = 'checklist' and (storage.foldername(name))[3] = public.current_user_id()::text ) or
    (storage.foldername(name))[1] = 'deliveries' or
    ( (storage.foldername(name))[1] = 'agenda-schedules' and public.is_jefe() ) or
    ( (storage.foldername(name))[1] = 'weekly-reports' and public.is_jefe() )
  )
);

drop policy if exists "storage: weekly-reports jefe actualiza" on storage.objects;
create policy "storage: weekly-reports jefe actualiza"
on storage.objects for update to authenticated
using (bucket_id = 'happy-pub-photos' and (storage.foldername(name))[1] = 'weekly-reports' and public.is_jefe())
with check (bucket_id = 'happy-pub-photos' and (storage.foldername(name))[1] = 'weekly-reports' and public.is_jefe());
