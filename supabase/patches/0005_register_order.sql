-- Patch: función RPC transaccional para registrar pedidos (Vender). Ya está
-- incluida en supabase/schema.sql para instalaciones nuevas — esto es solo para
-- aplicarla sobre el proyecto que ya corriste. Correr después de 0001-0004.

create or replace function public.register_order(p_table_label text, p_items jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text := public.current_user_role();
  v_user_id uuid := public.current_user_id();
  v_order_id uuid;
  v_total numeric := 0;
  v_item jsonb;
  v_mi_id text;
  v_mi_name text;
  v_mi_price numeric;
  v_mi_category text;
  v_qty int;
  v_price numeric;
  v_discount_pct numeric;
  v_discount_cat text;
  v_actor_name text;
begin
  if v_user_id is null or v_role not in ('jefe', 'mesero') then
    raise exception 'Solo jefe o mesero pueden registrar pedidos.';
  end if;
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'El pedido no tiene productos.';
  end if;

  select discount_pct, discount_category into v_discount_pct, v_discount_cat
  from public.agenda_days where date = current_date;

  select name into v_actor_name from public.users where id = v_user_id;

  insert into public.orders (table_label, user_id, total)
  values (p_table_label, v_user_id, 0)
  returning id into v_order_id;

  for v_item in select * from jsonb_array_elements(p_items) loop
    select id, name, price, category into v_mi_id, v_mi_name, v_mi_price, v_mi_category
    from public.menu_items where id = (v_item ->> 'menu_item_id');

    if not found then
      raise exception 'Producto de menú no encontrado: %', (v_item ->> 'menu_item_id');
    end if;

    v_qty := (v_item ->> 'qty')::int;
    if v_qty is null or v_qty <= 0 then
      raise exception 'Cantidad inválida para %', v_mi_name;
    end if;

    v_price := v_mi_price;
    if v_discount_pct is not null and v_discount_pct > 0
       and (v_discount_cat = 'todas' or v_discount_cat = v_mi_category) then
      v_price := round(v_mi_price * (1 - v_discount_pct / 100.0));
    end if;

    insert into public.order_items (order_id, menu_item_id, name, qty, unit_price, note)
    values (v_order_id, v_mi_id, v_mi_name, v_qty, v_price, nullif(v_item ->> 'note', ''));

    v_total := v_total + v_price * v_qty;
  end loop;

  update public.orders set total = v_total where id = v_order_id;

  update public.item_status ist
  set qty = greatest(0, ist.qty - deltas.total_qty)
  from (
    select mii.item_id, sum(mii.qty * oi.qty) as total_qty
    from public.order_items oi
    join public.menu_item_ingredients mii on mii.menu_item_id = oi.menu_item_id
    where oi.order_id = v_order_id
    group by mii.item_id
  ) deltas
  where ist.item_id = deltas.item_id and ist.qty is not null;

  delete from public.table_locks where table_label = p_table_label and user_id = v_user_id;

  insert into public.activity_log (message, color)
  values (
    format(
      '%s registró pedido en mesa %s — $ %s',
      coalesce(v_actor_name, 'Alguien'),
      p_table_label,
      replace(to_char(v_total, 'FM999,999,999'), ',', '.')
    ),
    '#C1642A'
  );

  return v_order_id;
end;
$$;
comment on function public.register_order is
  'RPC para Vender: crea orders+order_items, descuenta item_status.qty según la receta, libera la mesa y registra actividad — todo en una transacción.';

grant execute on function public.register_order(text, jsonb) to authenticated;
