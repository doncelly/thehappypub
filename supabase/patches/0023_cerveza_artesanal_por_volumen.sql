-- Punto 19 del backlog: cerveza artesanal de barril no se podía vender (no
-- había productos de menú para eso, aunque las promos la mencionan). Este
-- patch agrega Vaso/Pinta/Jarra por sabor para los 5 barriles con barril
-- activo hoy (Negra, Roja AAA y De Temporada no tienen barril conectado, no
-- se les crean productos), y hace que la venta descuente el nivel del
-- barril automáticamente por volumen (litros reales por barril, dados por
-- el usuario 13 ago 2026).

alter table public.items add column if not exists gauge_capacity_ml integer;
alter table public.item_status add column if not exists gauge_consumed_ml integer not null default 0;

update public.items set gauge_capacity_ml = 58700 where id = 'barril_amber';
update public.items set gauge_capacity_ml = 29300 where id = 'barril_gulupa';
update public.items set gauge_capacity_ml = 20000 where id = 'barril_mulata';
update public.items set gauge_capacity_ml = 20000 where id = 'barril_brown';
update public.items set gauge_capacity_ml = 30000 where id = 'barril_germania';

insert into public.menu_categories (id, label, sort_order) values
  ('cerveza_artesanal', '🍺 Cerveza Artesanal', 8)
on conflict (id) do nothing;

insert into public.menu_items (id, name, price, category) values
  ('m_amber_vaso',    'Amber Ale (Red IPA) — Vaso 300ml',   15900, 'cerveza_artesanal'),
  ('m_amber_pinta',   'Amber Ale (Red IPA) — Pinta 500ml',  19900, 'cerveza_artesanal'),
  ('m_amber_jarra',   'Amber Ale (Red IPA) — Jarra 1.5L',   52900, 'cerveza_artesanal'),
  ('m_gulupa_vaso',   'Happy Gulupa — Vaso 300ml',          15900, 'cerveza_artesanal'),
  ('m_gulupa_pinta',  'Happy Gulupa — Pinta 500ml',         19900, 'cerveza_artesanal'),
  ('m_gulupa_jarra',  'Happy Gulupa — Jarra 1.5L',          52900, 'cerveza_artesanal'),
  ('m_mulata_vaso',   'Mulata (3 Cordilleras) — Vaso 300ml',  15900, 'cerveza_artesanal'),
  ('m_mulata_pinta',  'Mulata (3 Cordilleras) — Pinta 500ml', 19900, 'cerveza_artesanal'),
  ('m_mulata_jarra',  'Mulata (3 Cordilleras) — Jarra 1.5L',  52900, 'cerveza_artesanal'),
  ('m_brown_vaso',    'Brown (Merak) — Vaso 300ml',          14900, 'cerveza_artesanal'),
  ('m_brown_pinta',   'Brown (Merak) — Pinta 500ml',         18900, 'cerveza_artesanal'),
  ('m_brown_jarra',   'Brown (Merak) — Jarra 1.5L',          49900, 'cerveza_artesanal'),
  ('m_germania_vaso', 'Germania — Vaso 300ml',                14900, 'cerveza_artesanal'),
  ('m_germania_pinta','Germania — Pinta 500ml',               18900, 'cerveza_artesanal'),
  ('m_germania_jarra','Germania — Jarra 1.5L',                49900, 'cerveza_artesanal')
on conflict (id) do nothing;

insert into public.menu_item_ingredients (menu_item_id, item_id, qty) values
  ('m_amber_vaso',     'barril_amber',    300), ('m_amber_pinta',     'barril_amber',    500), ('m_amber_jarra',     'barril_amber',    1500),
  ('m_gulupa_vaso',    'barril_gulupa',   300), ('m_gulupa_pinta',    'barril_gulupa',   500), ('m_gulupa_jarra',    'barril_gulupa',   1500),
  ('m_mulata_vaso',    'barril_mulata',   300), ('m_mulata_pinta',    'barril_mulata',   500), ('m_mulata_jarra',    'barril_mulata',   1500),
  ('m_brown_vaso',     'barril_brown',    300), ('m_brown_pinta',     'barril_brown',    500), ('m_brown_jarra',     'barril_brown',    1500),
  ('m_germania_vaso',  'barril_germania', 300), ('m_germania_pinta',  'barril_germania', 500), ('m_germania_jarra',  'barril_germania', 1500)
on conflict (menu_item_id, item_id) do nothing;

-- register_order: agrega el descuento por volumen para items gauge con
-- capacidad conocida (el descuento qty-mode de siempre queda intacto).
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
  v_gauge_item record;
  v_gauge_capacity int;
  v_gauge_consumed int;
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

  -- Descuenta inventario según menu_item_ingredients (m.dec[] del original),
  -- sumando todas las líneas del pedido que afecten al mismo item.
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
  -- (el trigger trg_item_status_audit/stock_history/activity ya vigente sobre
  -- item_status se dispara solo con este UPDATE — no hay que repetir esa lógica)

  -- Descuenta barriles (mode='gauge' con capacidad conocida) por volumen
  -- vendido (ver cerveza artesanal — menu_item_ingredients.qty guarda ml en
  -- vez de unidades para estos). El nivel del gauge se deriva siempre del
  -- total de ml acumulado, nunca se resta paso a paso — así queda consistente
  -- con lo que haga la persona manualmente en Inventario (ver InventarioClient,
  -- que también escribe gauge_consumed_ml al cambiar el nivel a mano).
  for v_gauge_item in
    select mii.item_id, sum(mii.qty * oi.qty)::int as total_ml
    from public.order_items oi
    join public.menu_item_ingredients mii on mii.menu_item_id = oi.menu_item_id
    join public.items i on i.id = mii.item_id
    where oi.order_id = v_order_id and i.gauge_capacity_ml is not null
    group by mii.item_id
  loop
    select i.gauge_capacity_ml, coalesce(ist.gauge_consumed_ml, 0)
      into v_gauge_capacity, v_gauge_consumed
      from public.items i
      join public.item_status ist on ist.item_id = i.id
      where i.id = v_gauge_item.item_id;

    v_gauge_consumed := v_gauge_consumed + v_gauge_item.total_ml;

    update public.item_status
    set gauge_consumed_ml = v_gauge_consumed,
        status_gauge = case least(4, v_gauge_consumed / greatest(1, v_gauge_capacity / 4))
          when 0 then 'completo'
          when 1 then 'tres_cuartos'
          when 2 then 'mitad'
          when 3 then 'un_cuarto'
          else 'agotado'
        end
    where item_id = v_gauge_item.item_id;
  end loop;

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
  'RPC para Vender: crea orders+order_items, descuenta item_status.qty (o gauge por volumen si items.gauge_capacity_ml está seteado — ver cerveza artesanal) según la receta, libera la mesa y registra actividad — todo en una transacción.';

-- void_order: reverso simétrico del descuento por volumen.
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
  v_gauge_item record;
  v_gauge_capacity int;
  v_gauge_consumed int;
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

  -- Reverso simétrico del descuento por volumen de register_order (ver ahí
  -- el porqué de derivar el nivel siempre del total acumulado en vez de
  -- restar paso a paso).
  for v_gauge_item in
    select mii.item_id, sum(mii.qty * oi.qty)::int as total_ml
    from public.order_items oi
    join public.menu_item_ingredients mii on mii.menu_item_id = oi.menu_item_id
    join public.items i on i.id = mii.item_id
    where oi.order_id = p_order_id and i.gauge_capacity_ml is not null
    group by mii.item_id
  loop
    select i.gauge_capacity_ml, coalesce(ist.gauge_consumed_ml, 0)
      into v_gauge_capacity, v_gauge_consumed
      from public.items i
      join public.item_status ist on ist.item_id = i.id
      where i.id = v_gauge_item.item_id;

    v_gauge_consumed := greatest(0, v_gauge_consumed - v_gauge_item.total_ml);

    update public.item_status
    set gauge_consumed_ml = v_gauge_consumed,
        status_gauge = case least(4, v_gauge_consumed / greatest(1, v_gauge_capacity / 4))
          when 0 then 'completo'
          when 1 then 'tres_cuartos'
          when 2 then 'mitad'
          when 3 then 'un_cuarto'
          else 'agotado'
        end
    where item_id = v_gauge_item.item_id;
  end loop;

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
  'RPC para Vender: anula un pedido — restaura item_status.qty (o gauge por volumen) según la receta, registra actividad, y borra el pedido (order_items en cascada). Jefe anula cualquiera; mesero solo los suyos.';
