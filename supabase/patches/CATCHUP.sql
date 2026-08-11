-- ============================================================================
-- CATCHUP: todos los patches hasta 0016 en un solo archivo, seguro de correr
-- las veces que sea (cada pieza revisa si ya existe antes de crearla). Úsalo
-- en vez de ir patch por patch — corre esto una vez y quedas al día.
--
-- Este archivo SIEMPRE se llama CATCHUP.sql (nombre fijo, no cambia con cada
-- patch nuevo) — así el link/atajo a este archivo nunca se rompe. Si ves un
-- número más alto que 0016 en supabase/patches/, este archivo ya no está al
-- día — pídele a Claude que lo regenere.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0001_public_login_read.sql
-- ---------------------------------------------------------------------------
-- Patch: permite leer nombres de usuarios activos SIN sesión (anon), para el
-- selector de nombre en /login. Ya está incluido en supabase/schema.sql para
-- instalaciones nuevas — esto es solo para aplicarlo sobre el proyecto que ya
-- corriste. Correr una vez en el editor SQL de Supabase.

drop policy if exists "users: lectura publica para login" on public.users;
create policy "users: lectura publica para login" on public.users for select to anon using (active = true);
grant select (id, name, active) on public.users to anon;

-- ---------------------------------------------------------------------------
-- 0002_auth_support.sql
-- ---------------------------------------------------------------------------
-- Patch: soporte para el login por PIN + Supabase Auth (Paso 3).
-- Ya está incluido en supabase/schema.sql para instalaciones nuevas — esto es
-- solo para aplicarlo sobre el proyecto que ya corriste. Correr una vez en el
-- editor SQL de Supabase, DESPUÉS de 0001_public_login_read.sql.

alter table public.users
  add column if not exists failed_pin_attempts integer not null default 0,
  add column if not exists locked_until timestamptz;

create or replace function public.current_app_user()
returns table(id uuid, name text, role text, subrole text, active boolean)
language sql
security definer
stable
set search_path = public
as $$
  select u.id, u.name, u.role, u.subrole, u.active
  from public.users u
  where u.auth_user_id = auth.uid();
$$;
comment on function public.current_app_user is
  'Perfil propio para la app (who-bar, nav por rol). El cliente no tiene GRANT sobre '
  'users.auth_user_id (sección 16 de schema.sql) así que no puede hacer este filtro por '
  'su cuenta — por eso es una función SECURITY DEFINER en vez de una policy + select normal.';

grant execute on function public.current_app_user() to authenticated;

-- ---------------------------------------------------------------------------
-- 0003_item_status_audit_trigger.sql
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- 0004_activity_log.sql
-- ---------------------------------------------------------------------------
-- Patch: feed de "Actividad reciente" del Panel (shared.activity[] del original).
-- Ya está incluido en supabase/schema.sql para instalaciones nuevas — esto es
-- solo para aplicarlo sobre el proyecto que ya corriste. Correr una vez en el
-- editor SQL de Supabase, DESPUÉS de 0001, 0002 y 0003.

create table if not exists public.activity_log (
  id          bigint generated always as identity primary key,
  message     text not null,
  color       text not null default '#E8A33D',
  created_at  timestamptz not null default now()
);
comment on table public.activity_log is 'shared.activity[] del original — solo la escriben triggers, nunca el cliente directamente.';

alter table public.activity_log enable row level security;

drop policy if exists "activity_log: lectura jefe" on public.activity_log;
create policy "activity_log: lectura jefe" on public.activity_log for select to authenticated using (public.is_jefe());

create or replace function public.log_item_status_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  item_name text;
  item_unit text;
  actor_name text;
  level_label text;
begin
  select name, unit into item_name, item_unit from public.items where id = new.item_id;
  select name into actor_name from public.users where id = new.updated_by;
  actor_name := coalesce(actor_name, 'Alguien');

  if new.status_gauge is not null then
    level_label := case new.status_gauge
      when 'completo' then 'Completo'
      when 'tres_cuartos' then '3/4'
      when 'mitad' then 'Mitad'
      when 'un_cuarto' then '1/4'
      when 'agotado' then 'Agotado'
      else new.status_gauge
    end;
    insert into public.activity_log (message, color)
    values (
      format('%s marcó "%s" como %s', actor_name, item_name, level_label),
      case new.status_gauge
        when 'completo' then '#7FA66E'
        when 'tres_cuartos' then '#A3B25A'
        when 'mitad' then '#E0A83F'
        when 'un_cuarto' then '#D9793A'
        when 'agotado' then '#C1462F'
        else '#E8A33D'
      end
    );
  elsif new.qty is not null then
    insert into public.activity_log (message, color)
    values (
      format('%s ajustó "%s" a %s %s', actor_name, item_name, new.qty, coalesce(item_unit, '')),
      '#E8A33D'
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_item_status_activity on public.item_status;
create trigger trg_item_status_activity after insert or update on public.item_status
  for each row execute function public.log_item_status_activity();

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'activity_log'
  ) then
    alter publication supabase_realtime add table public.activity_log;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 0005_register_order.sql
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- 0006_last_jefe_guard.sql
-- ---------------------------------------------------------------------------
-- Patch: nunca permitir desactivar ni eliminar al último jefe activo, a nivel
-- de base de datos (no solo deshabilitando el botón en el cliente como hacía
-- el original). Ya está incluido en supabase/schema.sql para instalaciones
-- nuevas — esto es solo para aplicarlo sobre el proyecto que ya corriste.
-- Correr después de 0001-0005.

create or replace function public.prevent_last_jefe_deactivation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.role = 'jefe' and old.active = true and new.active = false then
    if (select count(*) from public.users where role = 'jefe' and active = true and id <> old.id) = 0 then
      raise exception 'Debe existir al menos un jefe activo.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_prevent_last_jefe_deactivation on public.users;
create trigger trg_prevent_last_jefe_deactivation before update on public.users
  for each row execute function public.prevent_last_jefe_deactivation();

create or replace function public.prevent_last_jefe_deletion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.role = 'jefe' and old.active = true then
    if (select count(*) from public.users where role = 'jefe' and active = true and id <> old.id) = 0 then
      raise exception 'Debe existir al menos un jefe activo.';
    end if;
  end if;
  return old;
end;
$$;

drop trigger if exists trg_prevent_last_jefe_deletion on public.users;
create trigger trg_prevent_last_jefe_deletion before delete on public.users
  for each row execute function public.prevent_last_jefe_deletion();

-- ---------------------------------------------------------------------------
-- 0007_recibidos_functions.sql
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- 0008_register_loss.sql
-- ---------------------------------------------------------------------------
-- Patch: función RPC transaccional para registrar pérdidas (descuenta
-- inventario si hay producto vinculado). Ya está incluida en
-- supabase/schema.sql para instalaciones nuevas — esto es solo para aplicarla
-- sobre el proyecto que ya corriste. Correr después de 0001-0007.

create or replace function public.register_loss(
  p_category text,
  p_description text,
  p_qty numeric,
  p_item_id text,
  p_reason text
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
  v_loss_id uuid;
begin
  if v_user_id is null then
    raise exception 'Debes iniciar sesión.';
  end if;
  if p_description is null or length(trim(p_description)) = 0 then
    raise exception 'Escribe una descripción.';
  end if;
  if p_qty is null or p_qty <= 0 then
    raise exception 'Cantidad inválida.';
  end if;
  if p_category not in ('Cristalería', 'Producto', 'Elementos') then
    raise exception 'Categoría inválida.';
  end if;

  if p_item_id is not null then
    select c.domain into v_item_domain
    from public.items i join public.categories c on c.id = i.category
    where i.id = p_item_id;
    if v_item_domain is null then
      raise exception 'Producto no encontrado.';
    end if;
    v_allowed_domain := case v_role when 'mesero' then 'mesas' when 'cocinero' then 'cocina' else null end;
    if v_role <> 'jefe' and v_allowed_domain <> v_item_domain then
      raise exception 'No puedes vincular un producto de esta categoría.';
    end if;
  end if;

  insert into public.losses (category, description, qty, item_id, reason, user_id)
  values (p_category, p_description, p_qty, p_item_id, p_reason, v_user_id)
  returning id into v_loss_id;

  if p_item_id is not null then
    update public.item_status set qty = greatest(0, coalesce(qty, 0) - p_qty)
    where item_id = p_item_id and qty is not null;
  end if;

  return v_loss_id;
end;
$$;

grant execute on function public.register_loss(text, text, numeric, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 0009_caja_mesero_access.sql
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- 0010_admin_shift_pay.sql
-- ---------------------------------------------------------------------------
-- Patch: turnos de administración pagados por hora (nuevo respecto al
-- original — ahí "Admin de turno" era solo un campo de texto, sin tarifa). El
-- mismo jefe puede cubrir un turno de mesero Y uno de administración el mismo
-- día; cada uno se paga con su propia tarifa, así que attendance necesita
-- distinguir bajo qué tipo de turno se marcó cada entrada/salida.
-- Ya está reflejado en supabase/schema.sql para instalaciones nuevas — esto es
-- solo para aplicarlo sobre el proyecto que ya corriste. Correr después de
-- 0001-0009.

alter table public.hourly_rates
  add column if not exists administracion_flat numeric not null default 0;

alter table public.attendance
  add column if not exists work_type text not null default 'mesero' check (work_type in ('mesero', 'cocinero', 'administracion'));

-- Backfill: las filas que ya existen se etiquetan según el subrol del usuario
-- (así ningún registro de asistencia real que ya tenías queda huérfano).
update public.attendance a
set work_type = coalesce(u.subrole, 'mesero')
from public.users u
where a.user_id = u.id and u.subrole in ('mesero', 'cocinero');

alter table public.attendance drop constraint if exists attendance_user_id_date_key;
alter table public.attendance drop constraint if exists attendance_user_id_date_work_type_key;
alter table public.attendance add constraint attendance_user_id_date_work_type_key unique (user_id, date, work_type);

-- ---------------------------------------------------------------------------
-- 0011_void_order.sql
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- 0012_pedidos_cocina.sql
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- 0013_agenda_plantilla.sql
-- ---------------------------------------------------------------------------
-- Patch: Plantilla semanal de Agenda — valores por defecto de "Operación del
-- día" y horario de turnos por día de semana, editable en Agenda → Plantilla,
-- para no llenar los mismos datos a mano cada día. Ya está reflejado en
-- supabase/schema.sql y supabase/seed.sql (con los datos reales de
-- Horarios.csv) para instalaciones nuevas — esto es solo para aplicarlo sobre
-- el proyecto que ya corriste. Correr después de 0001-0012.

alter table public.default_weekday_tasks add column if not exists transport_aid boolean not null default false;

update public.default_weekday_tasks set transport_aid = true where shift_type = 'mesa' and weekday in (2,3,4,5,6);
update public.default_weekday_tasks set transport_aid = false where shift_type = 'mesa' and weekday in (0,1);
update public.default_weekday_tasks set transport_aid = true where shift_type = 'cocina' and weekday in (2,3,4,5,6);
update public.default_weekday_tasks set transport_aid = false where shift_type = 'cocina' and weekday in (0,1);

create table if not exists public.weekday_templates (
  weekday      integer primary key check (weekday between 0 and 6),
  start_time   time,
  shift_admin  text,
  daily_goal   numeric,
  promo        text,
  event        text
);
comment on table public.weekday_templates is 'Plantilla editable de "Operación del día" por día de semana — ver Agenda → Plantilla.';

create table if not exists public.shift_schedule_templates (
  id             uuid primary key default gen_random_uuid(),
  weekday        integer not null check (weekday between 0 and 6),
  shift_type     text not null check (shift_type in ('mesa','cocina')),
  slot_label     text not null,
  schedule_label text,
  sort_order     integer not null default 0
);
comment on table public.shift_schedule_templates is 'Plantilla editable de horarios por slot de turno y día de semana — ver Agenda → Plantilla.';

alter table public.weekday_templates enable row level security;
alter table public.shift_schedule_templates enable row level security;

drop policy if exists "catalogo: lectura autenticados" on public.weekday_templates;
create policy "catalogo: lectura autenticados" on public.weekday_templates for select to authenticated using (true);
drop policy if exists "catalogo: mutacion jefe" on public.weekday_templates;
create policy "catalogo: mutacion jefe" on public.weekday_templates for all to authenticated using (public.is_jefe()) with check (public.is_jefe());

drop policy if exists "catalogo: lectura autenticados" on public.shift_schedule_templates;
create policy "catalogo: lectura autenticados" on public.shift_schedule_templates for select to authenticated using (true);
drop policy if exists "catalogo: mutacion jefe" on public.shift_schedule_templates;
create policy "catalogo: mutacion jefe" on public.shift_schedule_templates for all to authenticated using (public.is_jefe()) with check (public.is_jefe());

insert into public.weekday_templates (weekday, start_time, shift_admin, daily_goal, promo, event) values
  (1, '17:00', '1', 950000,  'Hamburguesa + cerveza artesanal (gratis) antes de 9pm', 'NA'),
  (2, '17:00', '2', 950000,  'Alitas con descuento del 15% todo el día', 'NA'),
  (3, '17:00', '1', 950000,  'Cerveza artesanal de barril con 15% descuento antes de 9pm', 'NA'),
  (4, '16:00', '2', 1710000, 'Cócteles 2x1 antes de 7pm', 'NA'),
  (5, '15:00', '1', 1330000, 'Cerveza artesanal de barril con 15% descuento antes de 9pm', 'NA'),
  (6, '15:00', '2', 1710000, 'Hamburguesa + cerveza artesanal (gratis) antes de 7pm', 'NA'),
  (0, '14:00', null, 950000, 'Alitas con descuento del 15% todo el día', 'NA')
on conflict (weekday) do nothing;

insert into public.shift_schedule_templates (weekday, shift_type, slot_label, schedule_label, sort_order) values
  (1, 'cocina', 'Cocina 1', '15:30 A CIERRE', 1),
  (1, 'mesa',   'Mesas 1',  '15:30 A CIERRE', 1),
  (2, 'cocina', 'Cocina 1', '16:00 A CIERRE', 1),
  (2, 'mesa',   'Mesas 2',  '16:00 A CIERRE', 2),
  (3, 'cocina', 'Cocina 1', '16:00 A CIERRE', 1),
  (3, 'mesa',   'Mesas 1',  '16:00 A CIERRE', 1),
  (4, 'cocina', 'Cocina 1', '15:00 A CIERRE', 1),
  (4, 'mesa',   'Mesas 1',  '15:00 A CIERRE', 1),
  (4, 'mesa',   'Mesas 2',  '19:00 A CIERRE', 2),
  (5, 'cocina', 'Cocina 1', '14:00 A CIERRE', 1),
  (5, 'mesa',   'Mesas 1',  '19:00 A CIERRE', 1),
  (5, 'mesa',   'Mesas 2',  '14:00 A CIERRE', 2),
  (6, 'cocina', 'Cocina 1', '14:00 A CIERRE', 1),
  (6, 'mesa',   'Mesas 1',  '14:00 A CIERRE', 1),
  (6, 'mesa',   'Mesas 2',  '19:00 A CIERRE', 2),
  (0, 'cocina', 'Cocina 1', '13:00 A CIERRE', 1),
  (0, 'mesa',   'Mesas 1',  '13:00 A CIERRE', 1);

-- ---------------------------------------------------------------------------
-- 0014_shift_default_person.sql
-- ---------------------------------------------------------------------------
-- Patch: sugerir quién cubre cada slot de turno (Sol → Mesas 1, Javier →
-- Mesas 2) al elegirlo en Turnos — sigue siendo editable, Cocina 1 no tiene
-- persona fija porque rota. Ya está reflejado en supabase/schema.sql y
-- supabase/seed.sql para instalaciones nuevas — esto es solo para aplicarlo
-- sobre el proyecto que ya corriste. Correr después de 0001-0013.

alter table public.shift_schedule_templates add column if not exists default_person text;

update public.shift_schedule_templates set default_person = 'Sol' where slot_label = 'Mesas 1';
update public.shift_schedule_templates set default_person = 'Javier' where slot_label = 'Mesas 2';

-- ---------------------------------------------------------------------------
-- 0015_agenda_schedule_pdf.sql
-- ---------------------------------------------------------------------------
-- Patch: guarda el PDF de horario semanal en Storage (agenda-schedules/) y
-- deja que cualquier autenticado (jefe, mesero, cocinero) lo lea; solo jefe
-- puede generarlo/subirlo. Ya está reflejado en supabase/schema.sql para
-- instalaciones nuevas — esto es solo para aplicarlo sobre el proyecto que ya
-- corriste. Correr después de 0001-0014.

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

-- ---------------------------------------------------------------------------
-- 0016_dedupe_shift_slots.sql
-- ---------------------------------------------------------------------------
-- Patch: el patch 0013 insertaba los slots de turno (Cocina 1, Mesas 1, Mesas
-- 2...) sin protección contra duplicados — si el CATCHUP se corrió más de una
-- vez, quedaron duplicados (cada slot x2). Este patch los limpia y agrega una
-- restricción única para que no vuelva a pasar. Ya está reflejado en
-- supabase/schema.sql y supabase/seed.sql para instalaciones nuevas. Correr
-- después de 0001-0015 (seguro de correr más de una vez).

-- Se queda con la fila más antigua de cada (weekday, shift_type, slot_label)
-- y borra el resto — todas las duplicadas tienen el mismo contenido porque
-- vienen de repetir el mismo insert, así que no importa cuál se conserva.
delete from public.shift_schedule_templates a
using public.shift_schedule_templates b
where a.weekday = b.weekday
  and a.shift_type = b.shift_type
  and a.slot_label = b.slot_label
  and a.id > b.id;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'shift_schedule_templates_slot_unique'
  ) then
    alter table public.shift_schedule_templates
      add constraint shift_schedule_templates_slot_unique unique (weekday, shift_type, slot_label);
  end if;
end $$;
