-- Patch: funciones RPC transaccionales para Recibidos (pedidos de proveedor
-- recibidos + marcar pedido a proveedor como llegado). Ya están incluidas en
-- supabase/schema.sql para instalaciones nuevas — esto es solo para aplicarlas
-- sobre el proyecto que ya corriste. Correr después de 0001-0006.

create or replace function public.register_delivery(
  p_id uuid,
  p_item_id text,
  p_qty numeric,
  p_photo_producto_path text,
  p_photo_factura_path text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := public.current_user_id();
  v_role text := public.current_user_role();
  v_item_domain text;
  v_allowed_domain text;
begin
  if v_user_id is null then
    raise exception 'Debes iniciar sesión.';
  end if;
  if p_qty is null or p_qty <= 0 then
    raise exception 'Cantidad inválida.';
  end if;

  select c.domain into v_item_domain
  from public.items i join public.categories c on c.id = i.category
  where i.id = p_item_id;
  if v_item_domain is null then
    raise exception 'Producto no encontrado.';
  end if;

  v_allowed_domain := case v_role when 'mesero' then 'mesas' when 'cocinero' then 'cocina' else null end;
  if v_role <> 'jefe' and v_allowed_domain <> v_item_domain then
    raise exception 'No puedes registrar un pedido recibido de esta categoría.';
  end if;

  insert into public.deliveries (id, item_id, qty, photo_producto_path, photo_factura_path, user_id)
  values (p_id, p_item_id, p_qty, p_photo_producto_path, p_photo_factura_path, v_user_id);

  update public.item_status set qty = coalesce(qty, 0) + p_qty where item_id = p_item_id;

  return p_id;
end;
$$;

grant execute on function public.register_delivery(uuid, text, numeric, text, text) to authenticated;

create or replace function public.mark_purchase_order_received(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := public.current_user_id();
  v_item_id text;
  v_qty numeric;
  v_status text;
begin
  if v_user_id is null then
    raise exception 'Debes iniciar sesión.';
  end if;

  select item_id, qty, status into v_item_id, v_qty, v_status
  from public.purchase_orders where id = p_id;
  if not found then
    raise exception 'Pedido a proveedor no encontrado.';
  end if;
  if v_status = 'recibido' then
    raise exception 'Este pedido ya fue marcado como recibido.';
  end if;

  update public.purchase_orders
  set status = 'recibido', received_by = v_user_id, received_at = now()
  where id = p_id;

  update public.item_status set qty = coalesce(qty, 0) + v_qty where item_id = v_item_id;
end;
$$;

grant execute on function public.mark_purchase_order_received(uuid) to authenticated;
