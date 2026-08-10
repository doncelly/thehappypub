-- Patch: función RPC para anular un pedido mal registrado en Vender — restaura
-- el inventario que register_order descontó, registra actividad, y borra el
-- pedido. Ya está incluida en supabase/schema.sql para instalaciones nuevas —
-- esto es solo para aplicarla sobre el proyecto que ya corriste. Correr
-- después de 0001-0010.

create or replace function public.void_order(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text := public.current_user_role();
  v_user_id uuid := public.current_user_id();
  v_order public.orders%rowtype;
  v_actor_name text;
begin
  if v_user_id is null then
    raise exception 'Debes iniciar sesión.';
  end if;

  select * into v_order from public.orders where id = p_order_id;
  if not found then
    raise exception 'Pedido no encontrado.';
  end if;

  if not (public.is_jefe() or (v_role = 'mesero' and v_order.user_id = v_user_id)) then
    raise exception 'No puedes anular este pedido.';
  end if;

  select name into v_actor_name from public.users where id = v_user_id;

  update public.item_status ist
  set qty = coalesce(ist.qty, 0) + deltas.total_qty
  from (
    select mii.item_id, sum(mii.qty * oi.qty) as total_qty
    from public.order_items oi
    join public.menu_item_ingredients mii on mii.menu_item_id = oi.menu_item_id
    where oi.order_id = p_order_id
    group by mii.item_id
  ) deltas
  where ist.item_id = deltas.item_id and ist.qty is not null;

  insert into public.activity_log (message, color)
  values (
    format(
      '%s anuló el pedido de mesa %s — $ %s (inventario restaurado)',
      coalesce(v_actor_name, 'Alguien'),
      v_order.table_label,
      replace(to_char(v_order.total, 'FM999,999,999'), ',', '.')
    ),
    '#D9534F'
  );

  delete from public.orders where id = p_order_id;
end;
$$;
comment on function public.void_order is
  'RPC para Vender: anula un pedido — restaura item_status.qty según la receta, registra actividad, y borra el pedido (order_items en cascada). Jefe anula cualquiera; mesero solo los suyos.';

grant execute on function public.void_order(uuid) to authenticated;
