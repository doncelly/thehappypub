-- ============================================================================
-- URGENTE: mesero/cocinero no podían marcar llegada/salida entre las 7pm y
-- medianoche hora Bogotá (justo el turno de la noche) — bloqueado por RLS.
-- ============================================================================
-- Causa: las policies de attendance comparaban contra `current_date`, que en
-- Postgres es la fecha del SERVIDOR (UTC en Supabase). Bogotá es UTC-5 fijo
-- (sin horario de verano), así que entre las 7pm y medianoche hora Bogotá,
-- current_date en UTC ya es "mañana" — el INSERT/UPDATE de attendance con
-- date=hoy(Bogotá) violaba el `with check` y quedaba bloqueado por RLS.
-- Como el frontend no revisaba el error del upsert (ver abajo), el mesero
-- veía "Llegada registrada" en la UI (optimista) pero nunca se guardaba de
-- verdad — al recargar la página, parecía que "se había borrado".
-- Mismo bug de fondo que ya se corrigió del lado TypeScript hace tiempo (ver
-- todayISO() en src/lib/format.ts, error real #15 del HANDOFF) pero acá
-- vivía sin corregir del lado SQL, en tres sitios:
--   1. RLS de attendance (bloqueaba el check-in/check-out de mesero/cocinero)
--   2. register_order (buscaba el descuento del día equivocado — promos con
--      horario, ej. "antes de 9pm", podían fallar de aplicarse en la noche)
--   3. trigger set_stock_history (fechaba mal los ajustes de stock hechos de
--      noche en la tabla de "Stock semanal" de Panel)
-- ============================================================================

create or replace function public.today_bogota()
returns date
language sql
stable
as $$
  select (now() at time zone 'America/Bogota')::date;
$$;

-- 1. RLS de attendance
drop policy if exists "attendance: marcar propia (hoy) o jefe corrige cualquier fecha" on public.attendance;
create policy "attendance: marcar propia (hoy) o jefe corrige cualquier fecha" on public.attendance for insert to authenticated with check (
  (user_id = public.current_user_id() and date = public.today_bogota()) or public.is_jefe()
);

drop policy if exists "attendance: actualizar propia (hoy) o jefe corrige cualquier fecha" on public.attendance;
create policy "attendance: actualizar propia (hoy) o jefe corrige cualquier fecha" on public.attendance for update to authenticated using (
  (user_id = public.current_user_id() and date = public.today_bogota()) or public.is_jefe()
) with check (
  (user_id = public.current_user_id() and date = public.today_bogota()) or public.is_jefe()
);

-- 2. register_order — solo cambia la línea del descuento del día, el resto
-- queda idéntico a como quedó en el patch 0023.
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
  from public.agenda_days where date = public.today_bogota();

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

-- 3. trigger set_stock_history
create or replace function public.set_stock_history()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.qty is not null then
    insert into public.stock_history (item_id, date, qty)
    values (new.item_id, public.today_bogota(), new.qty)
    on conflict (item_id, date) do update set qty = excluded.qty;
  end if;
  return new;
end;
$$;
