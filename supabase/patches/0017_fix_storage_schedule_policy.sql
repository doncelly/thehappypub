-- Patch: el patch 0015 no quedó aplicado correctamente (verificado en vivo:
-- subir el PDF de horario sigue rechazado por RLS). Este archivo es corto a
-- propósito — solo la política de Storage, para descartar cualquier problema
-- de copiado del CATCHUP.sql grande. Seguro de correr las veces que sea.

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

-- Falta también permiso de UPDATE para agenda-schedules: subir un PDF de una
-- semana que ya se había generado antes (upsert) hace un UPDATE, no un
-- INSERT, y hasta ahora storage.objects no tenía ninguna policy de update.
drop policy if exists "storage: agenda-schedules jefe actualiza" on storage.objects;
create policy "storage: agenda-schedules jefe actualiza"
on storage.objects for update to authenticated
using (bucket_id = 'happy-pub-photos' and (storage.foldername(name))[1] = 'agenda-schedules' and public.is_jefe())
with check (bucket_id = 'happy-pub-photos' and (storage.foldername(name))[1] = 'agenda-schedules' and public.is_jefe());

-- Verificación rápida — debería mostrar 4 filas (select, insert, update +
-- la de update nueva). Si esto sale vacío después de correr lo de arriba,
-- algo bloqueó las sentencias anteriores y hay que avisarle a Claude.
select policyname, cmd from pg_policies
where schemaname = 'storage' and tablename = 'objects'
  and (policyname ilike '%agenda%' or policyname ilike '%checklist%');
