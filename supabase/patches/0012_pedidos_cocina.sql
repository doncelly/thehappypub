-- Patch: pantalla "Pedidos" para cocinero — reemplaza la comanda de papel.
-- Agrega columnas de ack en orders, da lectura de orders/order_items a
-- cocinero, y una función RPC para que cocina marque un pedido como
-- recibido/en preparación. Ya está reflejado en supabase/schema.sql para
-- instalaciones nuevas — esto es solo para aplicarlo sobre el proyecto que ya
-- corriste. Correr después de 0001-0011.

alter table public.orders add column if not exists kitchen_ack_at timestamptz;
alter table public.orders add column if not exists kitchen_ack_by uuid references public.users(id);
comment on column public.orders.kitchen_ack_at is
  'Cuándo cocina marcó el pedido como recibido/en preparación. Null = pendiente — alimenta la pantalla de Pedidos de cocinero.';

drop policy if exists "orders: lectura jefe y mesero" on public.orders;
drop policy if exists "orders: lectura jefe mesero y cocinero" on public.orders;
create policy "orders: lectura jefe mesero y cocinero" on public.orders for select to authenticated using (
  public.is_jefe() or public.current_user_role() in ('mesero', 'cocinero')
);

drop policy if exists "order_items: lectura jefe y mesero" on public.order_items;
drop policy if exists "order_items: lectura jefe mesero y cocinero" on public.order_items;
create policy "order_items: lectura jefe mesero y cocinero" on public.order_items for select to authenticated using (
  public.is_jefe() or public.current_user_role() in ('mesero', 'cocinero')
);

create or replace function public.ack_order_kitchen(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text := public.current_user_role();
  v_user_id uuid := public.current_user_id();
begin
  if v_user_id is null or v_role not in ('jefe', 'cocinero') then
    raise exception 'Solo cocina puede marcar un pedido como recibido.';
  end if;

  update public.orders
  set kitchen_ack_at = now(), kitchen_ack_by = v_user_id
  where id = p_order_id;
end;
$$;
comment on function public.ack_order_kitchen is
  'RPC para Pedidos (cocinero): marca un pedido como recibido/en preparación. Bypasea RLS a propósito — cocinero no tiene UPDATE directo sobre orders.';

grant execute on function public.ack_order_kitchen(uuid) to authenticated;
