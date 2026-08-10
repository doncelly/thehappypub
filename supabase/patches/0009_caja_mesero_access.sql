-- Patch: la Caja pasa a ser una pestaña propia (antes vivía dentro de Agenda,
-- solo-jefe) y ahora también la usa mesero. Reemplaza las 3 policies
-- "crud jefe" por "crud jefe y mesero". Ya está reflejado en supabase/schema.sql
-- para instalaciones nuevas — esto es solo para aplicarlo sobre el proyecto que
-- ya corriste. Correr después de 0001-0008.

drop policy if exists "cash_register: crud jefe" on public.cash_register;
drop policy if exists "cash_register: crud jefe y mesero" on public.cash_register;
create policy "cash_register: crud jefe y mesero" on public.cash_register for all to authenticated
  using (public.is_jefe() or public.current_user_role() = 'mesero')
  with check (public.is_jefe() or public.current_user_role() = 'mesero');

drop policy if exists "cash_register_purchases: crud jefe" on public.cash_register_purchases;
drop policy if exists "cash_register_purchases: crud jefe y mesero" on public.cash_register_purchases;
create policy "cash_register_purchases: crud jefe y mesero" on public.cash_register_purchases for all to authenticated
  using (public.is_jefe() or public.current_user_role() = 'mesero')
  with check (public.is_jefe() or public.current_user_role() = 'mesero');

drop policy if exists "cash_register_transport_aid: crud jefe" on public.cash_register_transport_aid;
drop policy if exists "cash_register_transport_aid: crud jefe y mesero" on public.cash_register_transport_aid;
create policy "cash_register_transport_aid: crud jefe y mesero" on public.cash_register_transport_aid for all to authenticated
  using (public.is_jefe() or public.current_user_role() = 'mesero')
  with check (public.is_jefe() or public.current_user_role() = 'mesero');
