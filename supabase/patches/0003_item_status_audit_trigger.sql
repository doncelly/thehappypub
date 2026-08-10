-- Patch: item_status.updated_by/updated_at los fija el servidor (trigger), no el
-- cliente. Ya está incluido en supabase/schema.sql para instalaciones nuevas —
-- esto es solo para aplicarlo sobre el proyecto que ya corriste. Correr una vez
-- en el editor SQL de Supabase, DESPUÉS de 0001 y 0002.

create or replace function public.set_item_status_audit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at = now();
  new.updated_by = public.current_user_id();
  return new;
end;
$$;
comment on function public.set_item_status_audit is
  'El cliente solo manda status_gauge o qty — quién y cuándo lo pone siempre el servidor.';

drop trigger if exists trg_item_status_audit on public.item_status;
create trigger trg_item_status_audit before insert or update on public.item_status
  for each row execute function public.set_item_status_audit();

-- El original repetía "guardar en stockHistory" en 4 sitios (setQty,
-- onRegistrarPedido, onAddPerdida, onMarcarLlegoProveedor) — acá basta un solo
-- trigger sobre item_status.qty para cubrir cualquier módulo que la toque.
create or replace function public.set_stock_history()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.qty is not null then
    insert into public.stock_history (item_id, date, qty)
    values (new.item_id, current_date, new.qty)
    on conflict (item_id, date) do update set qty = excluded.qty;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_item_status_stock_history on public.item_status;
create trigger trg_item_status_stock_history after insert or update on public.item_status
  for each row execute function public.set_stock_history();
