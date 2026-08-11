-- ============================================================================
-- THE HAPPY PUB — SCHEMA COMPLETO (Paso 2)
-- ============================================================================
-- Correr una sola vez en el editor SQL de Supabase, sobre un proyecto nuevo.
-- Reemplaza el blob único `window.storage` (SHARED_KEY) del HTML original por
-- tablas relacionales con RLS. Después de correr esto: supabase/seed.sql (Paso 2b)
-- carga el catálogo real (ITEMS/MENU/etc. extraídos del HTML), y recién ahí entra
-- Auth (Paso 3).
--
-- Convenciones:
--   - IDs de catálogo (items, menu_items, categorías, mesas) son texto legible
--     (p.ej. 'barril_gulupa'), igual que en el HTML original — más fácil de leer
--     en el editor SQL y en el seed. Todo lo demás usa uuid.
--   - "jefe" tiene acceso total. "mesero" y "cocinero" son subroles de 'staff' y
--     solo ven/escriben su dominio de inventario (mesas vs. cocina), como en
--     visibleCategories() del original.
-- ============================================================================

create extension if not exists pgcrypto;

-- ============================================================================
-- 1. CATÁLOGO / REFERENCIA (poco cambia, mutaciones solo-jefe)
-- ============================================================================

create table public.categories (
  id          text primary key,
  label       text not null,
  domain      text not null check (domain in ('mesas','cocina')),
  sort_order  integer not null default 0
);
comment on table public.categories is 'CATEGORIES del HTML original. domain decide qué rol la ve (visibleCategories()).';

create table public.menu_categories (
  id          text primary key,
  label       text not null,
  sort_order  integer not null default 0
);
comment on table public.menu_categories is 'MENU_CATS del HTML original.';

create table public.restaurant_tables (
  id          text primary key,
  sort_order  integer not null default 0
);
comment on table public.restaurant_tables is 'TABLES del HTML original: T1-T5, S6-S11, B1-B6.';

create table public.pair_watches (
  id          bigint generated always as identity primary key,
  label       text not null,
  item_a      text not null,
  item_b      text not null,
  sort_order  integer not null default 0
);
comment on table public.pair_watches is 'PAIRS del HTML original ("Pares a vigilar" en el Panel), p.ej. pan vs. carne.';

create table public.default_weekday_tasks (
  weekday       integer not null check (weekday between 0 and 6), -- 0=domingo … 6=sábado
  shift_type    text not null check (shift_type in ('mesa','cocina')),
  task          text not null,
  transport_aid boolean not null default false,
  primary key (weekday, shift_type)
);
comment on table public.default_weekday_tasks is 'DEFAULT_CLEANING_MESAS / DEFAULT_CLEANING_COCINA — tarea de aseo (y si aplica auxilio de transporte) sugeridos al crear un turno.';

create table public.default_weekday_promos (
  weekday     integer primary key check (weekday between 0 and 6),
  promo       text not null
);
comment on table public.default_weekday_promos is 'DEFAULT_PROMOS del HTML original — reemplazado por weekday_templates.promo (ver Plantilla en Agenda); se deja sin usar por compatibilidad.';

-- Plantilla semanal de Agenda: valores por defecto de "Operación del día" por
-- día de la semana, para no tener que llenarlos a mano cada día — el jefe la
-- edita en Agenda → Plantilla, y "Aplicar plantilla" copia estos valores al
-- formulario del día (sigue siendo editable antes de guardar, para los casos
-- de excepción: evento especial, visita de distrito, etc.).
create table public.weekday_templates (
  weekday      integer primary key check (weekday between 0 and 6),
  start_time   time,
  shift_admin  text,
  daily_goal   numeric,
  promo        text,
  event        text
);
comment on table public.weekday_templates is 'Plantilla editable de "Operación del día" por día de semana — ver Agenda → Plantilla.';

-- Horario recurrente por slot de turno (Cocina 1, Mesas 1, Mesas 2, ...) y
-- día de semana. La persona que cubre cada slot rota semana a semana, así
-- que NO se guarda aquí — el jefe la elige al agregar el turno del día,
-- solo el horario y el área quedan precargados desde la plantilla.
create table public.shift_schedule_templates (
  id             uuid primary key default gen_random_uuid(),
  weekday        integer not null check (weekday between 0 and 6),
  shift_type     text not null check (shift_type in ('mesa','cocina')),
  slot_label     text not null,
  schedule_label text,
  sort_order     integer not null default 0
);
comment on table public.shift_schedule_templates is 'Plantilla editable de horarios por slot de turno y día de semana — ver Agenda → Plantilla.';

-- ============================================================================
-- 2. USUARIOS
-- ============================================================================

create table public.users (
  id            uuid primary key default gen_random_uuid(),
  auth_user_id  uuid unique references auth.users(id) on delete set null,
  name          text not null,
  pin_hash      text not null,
  role          text not null check (role in ('jefe','staff')),
  subrole       text check (subrole in ('mesero','cocinero')),
  active        boolean not null default true,
  failed_pin_attempts integer not null default 0,
  locked_until  timestamptz,
  created_at    timestamptz not null default now(),
  constraint users_role_subrole_chk check (
    (role = 'jefe' and subrole is null) or
    (role = 'staff' and subrole in ('mesero','cocinero'))
  )
);
comment on table public.users is
  'pin_hash se genera y verifica SIEMPRE server-side (Paso 3, bcrypt). Nunca comparar en cliente. '
  'auth_user_id vincula a auth.users — se crea vía Admin API con email sintético + password aleatoria, '
  'el usuario solo ve/usa su PIN de 4 dígitos. failed_pin_attempts/locked_until: un PIN de 4 dígitos '
  'es forzable por fuerza bruta en segundos sin límite de intentos — el original no tenía ninguno '
  'porque comparaba en cliente; acá se bloquea temporalmente tras varios intentos fallidos (Paso 3).';

-- El original solo deshabilitaba el botón "Quitar acceso"/"Eliminar" en el
-- cliente cuando isLastJefe era cierto — nada lo impedía a nivel de datos. Acá
-- se garantiza en la base: ni desactivar ni borrar al último jefe activo,
-- venga la operación de donde venga (UI, API, o el editor SQL).
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

create trigger trg_prevent_last_jefe_deletion before delete on public.users
  for each row execute function public.prevent_last_jefe_deletion();

-- ============================================================================
-- 3. INVENTARIO
-- ============================================================================

create table public.items (
  id          text primary key,
  name        text not null,
  category    text not null references public.categories(id),
  mode        text not null check (mode in ('gauge','qty')),
  unit        text,
  step        numeric,
  min         numeric,
  active      boolean not null default true,
  constraint items_qty_fields_chk check (
    (mode = 'gauge' and unit is null and step is null) or
    (mode = 'qty' and unit is not null and step is not null and min is not null)
  )
);
comment on table public.items is 'ITEMS del HTML original — catálogo real, cargado por supabase/seed.sql.';

create table public.item_status (
  item_id       text primary key references public.items(id),
  status_gauge  text check (status_gauge in ('completo','tres_cuartos','mitad','un_cuarto','agotado')),
  qty           numeric,
  updated_by    uuid references public.users(id),
  updated_at    timestamptz not null default now(),
  constraint item_status_mode_chk check (
    (status_gauge is not null and qty is null) or
    (status_gauge is null and qty is not null)
  )
);
comment on table public.item_status is
  'Estado actual por item (equivalente a shared.items[id] en el original). '
  'Una fila por item; el modo (gauge/qty) lo determina items.mode. STATUS_LEVELS: completo, tres_cuartos, mitad, un_cuarto, agotado.';

create table public.stock_history (
  item_id  text not null references public.items(id),
  date     date not null,
  qty      numeric not null,
  primary key (item_id, date)
);
comment on table public.stock_history is 'shared.stockHistory[date][itemId] original — para el reporte de stock semanal (lunes a domingo).';

-- ============================================================================
-- 4. MENÚ
-- ============================================================================

create table public.menu_items (
  id        text primary key,
  name      text not null,
  price     numeric not null check (price >= 0),
  category  text not null references public.menu_categories(id),
  active    boolean not null default true
);
comment on table public.menu_items is 'MENU del HTML original.';

create table public.menu_item_ingredients (
  menu_item_id  text not null references public.menu_items(id) on delete cascade,
  item_id       text not null references public.items(id),
  qty           numeric not null check (qty > 0),
  primary key (menu_item_id, item_id)
);
comment on table public.menu_item_ingredients is 'm.dec[] del HTML original — receta de descuento de inventario por producto de menú.';

-- ============================================================================
-- 5. MESAS Y PEDIDOS
-- ============================================================================

create table public.table_locks (
  table_label  text primary key references public.restaurant_tables(id),
  user_id      uuid not null references public.users(id),
  locked_at    timestamptz not null default now()
);
comment on table public.table_locks is
  'shared.mesasOcupadas original. Una fila por mesa ocupada (bloqueo real a nivel de DB vía PK, '
  'mejor que la validación solo-en-cliente del original). La app debe tratar locks con locked_at '
  'de más de 20 min (MESA_TIMEOUT_MS) como expirados y liberarlos.';

create table public.orders (
  id              uuid primary key default gen_random_uuid(),
  table_label     text not null,
  user_id         uuid not null references public.users(id),
  total           numeric not null default 0,
  created_at      timestamptz not null default now(),
  kitchen_ack_at  timestamptz,
  kitchen_ack_by  uuid references public.users(id)
);
comment on table public.orders is 'shared.pedidos original.';
comment on column public.orders.kitchen_ack_at is
  'Cuándo cocina marcó el pedido como recibido/en preparación. Null = pendiente — alimenta la pantalla de Pedidos de cocinero.';

create table public.order_items (
  id            bigint generated always as identity primary key,
  order_id      uuid not null references public.orders(id) on delete cascade,
  menu_item_id  text references public.menu_items(id),
  name          text not null,   -- snapshot del nombre al vender (por si el menú cambia después)
  qty           integer not null check (qty > 0),
  unit_price    numeric not null check (unit_price >= 0), -- precio ya con descuento del día aplicado
  note          text
);

-- ============================================================================
-- 6. ASISTENCIA Y GANANCIAS
-- ============================================================================

create table public.attendance (
  id            bigint generated always as identity primary key,
  user_id       uuid not null references public.users(id),
  date          date not null,
  work_type     text not null default 'mesero' check (work_type in ('mesero', 'cocinero', 'administracion')),
  check_in      timestamptz,
  check_out     timestamptz,
  method        text not null default 'auto' check (method in ('auto','manual')),
  corrected_by  uuid references public.users(id),
  unique (user_id, date, work_type)
);
comment on table public.attendance is
  'shared.asistencia[date][userId] original — checkGeofence()/manualAttendance(). '
  'work_type no estaba en el original: un jefe puede cubrir un turno de mesero Y '
  'uno de administración el mismo día, cada uno con su propia tarifa — por eso el '
  'unique es (user_id, date, work_type) en vez de (user_id, date).';

create table public.hourly_rates (
  id                  integer primary key default 1 check (id = 1), -- fila única (singleton)
  mesero_t1           numeric not null, -- antes de 11pm
  mesero_t2           numeric not null, -- 11pm a 1am
  mesero_t3           numeric not null, -- después de 1am
  cocinero_flat       numeric not null, -- tarifa plana
  administracion_flat numeric not null default 0, -- tarifa plana — turnos de administración (no estaba en el original)
  updated_at          timestamptz not null default now(),
  updated_by          uuid references public.users(id)
);
comment on table public.hourly_rates is 'DEFAULT_RATES del HTML original (+ administracion_flat, agregada después) — editable solo por jefe desde Personal.';

create table public.geofence_settings (
  id              integer primary key default 1 check (id = 1), -- fila única (singleton)
  venue_lat       double precision not null,
  venue_lng       double precision not null,
  arrive_radius_m integer not null,
  leave_radius_m  integer not null,
  updated_at      timestamptz not null default now(),
  updated_by      uuid references public.users(id)
);
comment on table public.geofence_settings is 'VENUE + ARRIVE_RADIUS_M/LEAVE_RADIUS_M del HTML original.';

-- ============================================================================
-- 7. AGENDA, TURNOS, BONIFICACIONES
-- ============================================================================

create table public.agenda_days (
  date              date primary key,
  start_time        time,
  shift_admin       text,
  daily_goal        numeric,
  promo             text,
  discount_pct      numeric check (discount_pct between 0 and 100),
  discount_category text, -- 'todas' o el id de una menu_categories
  event             text,
  updated_at        timestamptz not null default now()
);
comment on table public.agenda_days is 'shared.agenda[date] (sin turnos/caja, que van en sus propias tablas) del original.';

create table public.weekly_goals (
  week_monday  date primary key,
  goal         numeric not null
);
comment on table public.weekly_goals is 'shared.metasSemanales[mondayISO] del original.';

create table public.shifts (
  id              uuid primary key default gen_random_uuid(),
  date            date not null,
  person_name     text not null, -- texto libre, igual que turno.person en el original
  user_id         uuid references public.users(id), -- resuelto por nombre cuando existe match
  area            text,
  schedule_label  text, -- horario, ej: "15:00 A CIERRE"
  shift_type      text not null default 'mesa' check (shift_type in ('mesa','cocina')),
  cleaning_task   text,
  done            boolean not null default false,
  created_at      timestamptz not null default now()
);
comment on table public.shifts is 'day.turnos[] del original.';

create table public.bonuses (
  date                date not null,
  user_id             uuid not null references public.users(id),
  service             boolean, -- null = pendiente, true = cumplió, false = no cumplió (tri-estado del original)
  task_alistamiento   boolean,
  task_inventario     boolean,
  task_apertura       boolean,
  task_cierre         boolean,
  rated_by            uuid references public.users(id),
  updated_at          timestamptz not null default now(),
  primary key (date, user_id)
);
comment on table public.bonuses is
  'shared.bonos[date][userId] (calificación manual) del original. '
  'ventas y puntualidad NO se guardan aquí — se calculan (computeAutoBonos): '
  'ventas = ventasDia.total >= agenda_days.daily_goal; puntualidad = hora de check_in vs. shifts.schedule_label.';

-- ============================================================================
-- 8. CHECKLIST DIARIO (con evidencia fotográfica)
-- ============================================================================

create table public.checklist_entries (
  date          date not null,
  user_id       uuid not null references public.users(id),
  section       text not null check (section in ('alistamiento','inventario','apertura','cierre')),
  done          boolean not null default false, -- usado por alistamiento/inventario
  areas         jsonb not null default '{}'::jsonb, -- usado por apertura/cierre: {"Barra": true, ...}
  has_photo     boolean not null default false,
  completed_at  timestamptz,
  primary key (date, user_id, section)
);
comment on table public.checklist_entries is 'shared.checklist[date][userId] del original.';

create table public.checklist_photos (
  id            bigint generated always as identity primary key,
  date          date not null,
  user_id       uuid not null references public.users(id),
  section       text not null check (section in ('alistamiento','inventario','apertura','cierre')),
  storage_path  text not null, -- objeto en el bucket 'happy-pub-photos', ver storage policies abajo
  uploaded_at   timestamptz not null default now(),
  unique (date, user_id, section)
);
comment on table public.checklist_photos is 'checklistPhotos[] del original — ahora en Supabase Storage en vez de base64 en la tabla.';

-- ============================================================================
-- 9. RECIBIDOS (de proveedor) Y PEDIDOS A PROVEEDOR
-- ============================================================================

create table public.deliveries (
  id                  uuid primary key default gen_random_uuid(),
  item_id             text not null references public.items(id),
  qty                 numeric not null check (qty > 0),
  photo_producto_path text, -- Storage, bucket 'happy-pub-photos'
  photo_factura_path  text,
  user_id             uuid not null references public.users(id),
  created_at          timestamptz not null default now()
);
comment on table public.deliveries is 'deliveries[] del original ("Recibidos") — visible a los 3 roles.';

create table public.purchase_orders (
  id             uuid primary key default gen_random_uuid(),
  item_id        text not null references public.items(id),
  supplier       text,
  qty            numeric not null check (qty > 0),
  expected_date  date,
  status         text not null default 'pendiente' check (status in ('pendiente','recibido')),
  ordered_by     uuid not null references public.users(id),
  ordered_at     timestamptz not null default now(),
  received_by    uuid references public.users(id),
  received_at    timestamptz
);
comment on table public.purchase_orders is 'shared.pedidosProveedor[] del original — creación solo-jefe, marcar "llegó" cualquier rol.';

-- ============================================================================
-- 10. PÉRDIDAS
-- ============================================================================

create table public.losses (
  id            uuid primary key default gen_random_uuid(),
  category      text not null check (category in ('Cristalería','Producto','Elementos')),
  description   text not null,
  qty           numeric not null check (qty > 0),
  item_id       text references public.items(id),
  reason        text,
  user_id       uuid not null references public.users(id),
  created_at    timestamptz not null default now()
);
comment on table public.losses is 'shared.perdidas[] del original.';

-- ============================================================================
-- 11. CAJA (apertura/cierre completo)
-- ============================================================================

create table public.cash_register (
  date                  date primary key,
  open_by               text,
  open_by_user          uuid references public.users(id),
  open_time             time,
  base_amount           numeric,
  remnant_received      numeric,
  observations          text,
  close_by              text,
  close_by_user         uuid references public.users(id),
  close_time            time,
  cash_amount           numeric,
  card_amount           numeric,
  remnant_accumulated   numeric,
  next_base             numeric,
  last_table            text,
  reviewed_by           text,
  updated_at            timestamptz not null default now()
);
comment on table public.cash_register is 'day.caja del original — solo-jefe, en Agenda.';

create table public.cash_register_purchases (
  id       bigint generated always as identity primary key,
  date     date not null references public.cash_register(date) on delete cascade,
  concept  text not null,
  amount   numeric not null check (amount > 0)
);
comment on table public.cash_register_purchases is 'day.caja.compras[] del original — compras desde remanente.';

create table public.cash_register_transport_aid (
  id            bigint generated always as identity primary key,
  date          date not null references public.cash_register(date) on delete cascade,
  collaborator  text not null,
  amount        numeric not null check (amount > 0)
);
comment on table public.cash_register_transport_aid is 'day.caja.auxilios[] del original — auxilios de transporte.';

-- ============================================================================
-- 12. CALIFICACIÓN DE SERVICIO (QR público) Y VENCIMIENTOS
-- ============================================================================

create table public.service_ratings (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references public.users(id),
  rating      text not null check (rating in ('bien','regular','mal')),
  created_at  timestamptz not null default now()
);
comment on table public.service_ratings is
  'shared.ratings[] del original. ÚNICA tabla con escritura pública (sin login) vía RLS — QR en la mesa.';

create table public.utility_bills (
  service_id  text primary key check (service_id in ('internet','agua','luz','gas','arriendo')),
  label       text not null,
  due_day     integer check (due_day between 1 and 31),
  updated_at  timestamptz not null default now()
);
comment on table public.utility_bills is 'SERVICIOS + shared.vencimientos del original — solo-jefe.';

-- ============================================================================
-- 12b. ACTIVIDAD RECIENTE (Panel del jefe)
-- ============================================================================
-- shared.activity[] del original (pushActivity, hasta 40 entradas mostradas).
-- No hay INSERT vía RLS a propósito: solo la llenan triggers SECURITY DEFINER
-- (ver trg_item_status_activity más abajo, y los que se agreguen a medida que se
-- migran más módulos) — así nadie puede escribir un mensaje falso en el feed.

create table public.activity_log (
  id          bigint generated always as identity primary key,
  message     text not null,
  color       text not null default '#E8A33D',
  created_at  timestamptz not null default now()
);
comment on table public.activity_log is 'shared.activity[] del original — solo la escriben triggers, nunca el cliente directamente.';

-- ============================================================================
-- 13. TRIGGER genérico para updated_at
-- ============================================================================

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_agenda_days_updated_at before update on public.agenda_days
  for each row execute function public.set_updated_at();
create trigger trg_cash_register_updated_at before update on public.cash_register
  for each row execute function public.set_updated_at();
create trigger trg_utility_bills_updated_at before update on public.utility_bills
  for each row execute function public.set_updated_at();
create trigger trg_hourly_rates_updated_at before update on public.hourly_rates
  for each row execute function public.set_updated_at();
create trigger trg_geofence_settings_updated_at before update on public.geofence_settings
  for each row execute function public.set_updated_at();
create trigger trg_bonuses_updated_at before update on public.bonuses
  for each row execute function public.set_updated_at();

-- item_status es el más escrito de toda la app (cada toque de gauge/qty). Que el
-- propio trigger fije updated_by/updated_at en vez de confiar en lo que mande el
-- cliente evita que alguien falsee "quién reportó" — necesita current_user_id(),
-- así que se define después de la sección 14 de funciones de autorización.

-- ============================================================================
-- 14. FUNCIONES DE AUTORIZACIÓN (usadas por las políticas RLS de abajo)
-- ============================================================================
-- SECURITY DEFINER + search_path fijo: corren con los privilegios de quien las
-- creó (bypassean RLS de public.users adentro), así evitamos recursión infinita
-- al consultar la tabla users desde sus propias políticas.

create or replace function public.current_user_id()
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select id from public.users where auth_user_id = auth.uid() and active = true;
$$;

create or replace function public.current_user_role()
returns text
language sql
security definer
stable
set search_path = public
as $$
  select case
    when role = 'jefe' then 'jefe'
    else subrole
  end
  from public.users
  where auth_user_id = auth.uid() and active = true;
$$;
comment on function public.current_user_role is 'Devuelve ''jefe'' | ''mesero'' | ''cocinero'' | null — mapea role+subrole a los 3 roles de negocio.';

create or replace function public.is_jefe()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(public.current_user_role() = 'jefe', false);
$$;

create or replace function public.user_domain()
returns text
language sql
security definer
stable
set search_path = public
as $$
  select case public.current_user_role()
    when 'mesero' then 'mesas'
    when 'cocinero' then 'cocina'
    else null -- jefe (sin restricción) o sin sesión
  end;
$$;
comment on function public.user_domain is 'null para jefe (sin restricción) o sin sesión — las políticas siempre combinan esto con is_jefe().';

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
  'users.auth_user_id (sección 16) así que no puede hacer este filtro por su cuenta — '
  'por eso es una función SECURITY DEFINER en vez de una policy + select normal.';

grant execute on function public.current_user_id() to anon, authenticated;
grant execute on function public.current_user_role() to anon, authenticated;
grant execute on function public.is_jefe() to anon, authenticated;
grant execute on function public.user_domain() to anon, authenticated;
grant execute on function public.current_app_user() to authenticated;

-- ============================================================================
-- 14b. REGISTRAR PEDIDO (Vender) — transacción atómica
-- ============================================================================
-- onRegistrarPedido() del original hacía esto con múltiples escrituras
-- secuenciales sobre un solo blob JSON (efectivamente atómico porque era un
-- único save). Acá son varias tablas de verdad, así que se necesita una función
-- para que "crear pedido + descontar inventario + liberar mesa" pase completo o
-- nada — nunca un pedido a medias si algo falla a mitad de camino.
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

-- ============================================================================
-- 14b2. ANULAR PEDIDO (Vender) — corrige un pedido mal registrado
-- ============================================================================
-- Reverso de register_order: si alguien se equivoca al registrar (mesa
-- incorrecta, producto de más, etc.), esto devuelve al inventario exactamente
-- lo que register_order descontó, registra actividad, y borra el pedido
-- (order_items se va en cascada por FK). Jefe anula cualquier pedido; mesero
-- solo los que él mismo registró — sin límite de tiempo.
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

-- Cocina marca un pedido como recibido/en preparación desde la pantalla de
-- Pedidos — reemplaza la comanda de papel. SECURITY DEFINER porque cocinero
-- no tiene permiso de UPDATE por RLS sobre orders (solo jefe lo tiene); esta
-- función es la única puerta de escritura para ese rol sobre esta tabla.
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

-- ============================================================================
-- 14c. RECIBIDOS — registrar entrega de proveedor / marcar pedido como llegado
-- ============================================================================
-- Mismo motivo que register_order: insertar + sumar a item_status.qty debe
-- pasar completo o nada. El id lo genera el cliente (crypto.randomUUID) para
-- poder subir las fotos a Storage ANTES de llamar esta función, con la ruta ya
-- lista (deliveries/{id}/producto.jpg, deliveries/{id}/factura.jpg).
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

-- Cualquier rol puede marcar un pedido a proveedor como recibido (igual que el
-- original) — eso también debe sumar al inventario en la misma transacción.
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

-- ============================================================================
-- 14d. PÉRDIDAS — registrar, descontando inventario si hay producto vinculado
-- ============================================================================
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

create trigger trg_item_status_stock_history after insert or update on public.item_status
  for each row execute function public.set_stock_history();

-- pushActivity() del original, para el feed de "Actividad reciente" del Panel.
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

create trigger trg_item_status_activity after insert or update on public.item_status
  for each row execute function public.log_item_status_activity();

-- ============================================================================
-- 15. ROW LEVEL SECURITY
-- ============================================================================

alter table public.categories enable row level security;
alter table public.menu_categories enable row level security;
alter table public.restaurant_tables enable row level security;
alter table public.pair_watches enable row level security;
alter table public.default_weekday_tasks enable row level security;
alter table public.default_weekday_promos enable row level security;
alter table public.weekday_templates enable row level security;
alter table public.shift_schedule_templates enable row level security;
alter table public.users enable row level security;
alter table public.items enable row level security;
alter table public.item_status enable row level security;
alter table public.stock_history enable row level security;
alter table public.menu_items enable row level security;
alter table public.menu_item_ingredients enable row level security;
alter table public.table_locks enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.attendance enable row level security;
alter table public.hourly_rates enable row level security;
alter table public.geofence_settings enable row level security;
alter table public.agenda_days enable row level security;
alter table public.weekly_goals enable row level security;
alter table public.shifts enable row level security;
alter table public.bonuses enable row level security;
alter table public.checklist_entries enable row level security;
alter table public.checklist_photos enable row level security;
alter table public.deliveries enable row level security;
alter table public.purchase_orders enable row level security;
alter table public.losses enable row level security;
alter table public.cash_register enable row level security;
alter table public.cash_register_purchases enable row level security;
alter table public.cash_register_transport_aid enable row level security;
alter table public.service_ratings enable row level security;
alter table public.utility_bills enable row level security;
alter table public.activity_log enable row level security;

-- ---- catálogo de solo-lectura para cualquier autenticado, mutación solo-jefe ----

create policy "catalogo: lectura autenticados" on public.categories for select to authenticated using (true);
create policy "catalogo: mutacion jefe" on public.categories for all to authenticated using (public.is_jefe()) with check (public.is_jefe());

create policy "catalogo: lectura autenticados" on public.menu_categories for select to authenticated using (true);
create policy "catalogo: mutacion jefe" on public.menu_categories for all to authenticated using (public.is_jefe()) with check (public.is_jefe());

create policy "catalogo: lectura autenticados" on public.restaurant_tables for select to authenticated using (true);
create policy "catalogo: mutacion jefe" on public.restaurant_tables for all to authenticated using (public.is_jefe()) with check (public.is_jefe());

create policy "catalogo: lectura autenticados" on public.pair_watches for select to authenticated using (true);
create policy "catalogo: mutacion jefe" on public.pair_watches for all to authenticated using (public.is_jefe()) with check (public.is_jefe());

create policy "catalogo: lectura autenticados" on public.default_weekday_tasks for select to authenticated using (true);
create policy "catalogo: mutacion jefe" on public.default_weekday_tasks for all to authenticated using (public.is_jefe()) with check (public.is_jefe());

create policy "catalogo: lectura autenticados" on public.default_weekday_promos for select to authenticated using (true);
create policy "catalogo: mutacion jefe" on public.default_weekday_promos for all to authenticated using (public.is_jefe()) with check (public.is_jefe());

create policy "catalogo: lectura autenticados" on public.weekday_templates for select to authenticated using (true);
create policy "catalogo: mutacion jefe" on public.weekday_templates for all to authenticated using (public.is_jefe()) with check (public.is_jefe());

create policy "catalogo: lectura autenticados" on public.shift_schedule_templates for select to authenticated using (true);
create policy "catalogo: mutacion jefe" on public.shift_schedule_templates for all to authenticated using (public.is_jefe()) with check (public.is_jefe());

-- ---- users ----
-- pin_hash NUNCA se expone vía RLS+grants de columnas (ver sección 16). Creación,
-- borrado y reseteo de PIN pasan siempre por Route Handler con service role (Paso 3).

create policy "users: lectura autenticados" on public.users for select to authenticated using (true);
create policy "users: jefe activa/desactiva" on public.users for update to authenticated
  using (public.is_jefe()) with check (public.is_jefe());
-- La pantalla de login (sin sesión todavía) necesita mostrar el selector de nombre,
-- igual que el original. Sin esto, anon no puede leer nada de esta tabla.
create policy "users: lectura publica para login" on public.users for select to anon using (active = true);

-- ---- items / item_status / stock_history: filtrado por dominio de rol ----

create policy "items: lectura por dominio" on public.items for select to authenticated using (
  public.is_jefe() or exists (
    select 1 from public.categories c where c.id = items.category and c.domain = public.user_domain()
  )
);
create policy "items: mutacion jefe" on public.items for insert to authenticated with check (public.is_jefe());
create policy "items: mutacion jefe update" on public.items for update to authenticated using (public.is_jefe()) with check (public.is_jefe());
create policy "items: mutacion jefe delete" on public.items for delete to authenticated using (public.is_jefe());

create policy "item_status: lectura por dominio" on public.item_status for select to authenticated using (
  public.is_jefe() or exists (
    select 1 from public.items i join public.categories c on c.id = i.category
    where i.id = item_status.item_id and c.domain = public.user_domain()
  )
);
create policy "item_status: escritura por dominio" on public.item_status for all to authenticated using (
  public.is_jefe() or exists (
    select 1 from public.items i join public.categories c on c.id = i.category
    where i.id = item_status.item_id and c.domain = public.user_domain()
  )
) with check (
  public.is_jefe() or exists (
    select 1 from public.items i join public.categories c on c.id = i.category
    where i.id = item_status.item_id and c.domain = public.user_domain()
  )
);

create policy "stock_history: lectura por dominio" on public.stock_history for select to authenticated using (
  public.is_jefe() or exists (
    select 1 from public.items i join public.categories c on c.id = i.category
    where i.id = stock_history.item_id and c.domain = public.user_domain()
  )
);
create policy "stock_history: escritura por dominio" on public.stock_history for insert to authenticated with check (
  public.is_jefe() or exists (
    select 1 from public.items i join public.categories c on c.id = i.category
    where i.id = stock_history.item_id and c.domain = public.user_domain()
  )
);
create policy "stock_history: update por dominio" on public.stock_history for update to authenticated using (
  public.is_jefe() or exists (
    select 1 from public.items i join public.categories c on c.id = i.category
    where i.id = stock_history.item_id and c.domain = public.user_domain()
  )
);

-- ---- menú: lectura abierta a autenticados, mutación solo-jefe ----

create policy "menu_items: lectura autenticados" on public.menu_items for select to authenticated using (true);
create policy "menu_items: mutacion jefe" on public.menu_items for all to authenticated using (public.is_jefe()) with check (public.is_jefe());

create policy "menu_item_ingredients: lectura autenticados" on public.menu_item_ingredients for select to authenticated using (true);
create policy "menu_item_ingredients: mutacion jefe" on public.menu_item_ingredients for all to authenticated using (public.is_jefe()) with check (public.is_jefe());

-- ---- mesas: lectura abierta, lock/unlock propio (o jefe) ----

create policy "table_locks: lectura autenticados" on public.table_locks for select to authenticated using (true);
create policy "table_locks: tomar mesa" on public.table_locks for insert to authenticated
  with check (user_id = public.current_user_id());
create policy "table_locks: liberar mesa propia o jefe" on public.table_locks for delete to authenticated
  using (user_id = public.current_user_id() or public.is_jefe());

-- ---- pedidos: jefe ve todo, mesero crea y ve, cocinero solo lee (pantalla Pedidos) ----

create policy "orders: lectura jefe mesero y cocinero" on public.orders for select to authenticated using (
  public.is_jefe() or public.current_user_role() in ('mesero', 'cocinero')
);
create policy "orders: crear jefe y mesero" on public.orders for insert to authenticated with check (
  (public.is_jefe() or public.current_user_role() = 'mesero') and user_id = public.current_user_id()
);
create policy "orders: editar jefe" on public.orders for update to authenticated using (public.is_jefe()) with check (public.is_jefe());
create policy "orders: borrar jefe" on public.orders for delete to authenticated using (public.is_jefe());

create policy "order_items: lectura jefe mesero y cocinero" on public.order_items for select to authenticated using (
  public.is_jefe() or public.current_user_role() in ('mesero', 'cocinero')
);
create policy "order_items: crear jefe y mesero" on public.order_items for insert to authenticated with check (
  exists (
    select 1 from public.orders o where o.id = order_items.order_id and o.user_id = public.current_user_id()
  ) or public.is_jefe()
);

-- ---- asistencia: propia + jefe ve/corrige todo ----

create policy "attendance: lectura propia o jefe" on public.attendance for select to authenticated using (
  user_id = public.current_user_id() or public.is_jefe()
);
create policy "attendance: marcar propia (hoy) o jefe corrige cualquier fecha" on public.attendance for insert to authenticated with check (
  (user_id = public.current_user_id() and date = current_date) or public.is_jefe()
);
create policy "attendance: actualizar propia (hoy) o jefe corrige cualquier fecha" on public.attendance for update to authenticated using (
  (user_id = public.current_user_id() and date = current_date) or public.is_jefe()
) with check (
  (user_id = public.current_user_id() and date = current_date) or public.is_jefe()
);

-- ---- tarifas y geocerca: lectura abierta (se necesita para "Mi día"), edición jefe ----

create policy "hourly_rates: lectura autenticados" on public.hourly_rates for select to authenticated using (true);
create policy "hourly_rates: edicion jefe" on public.hourly_rates for update to authenticated using (public.is_jefe()) with check (public.is_jefe());

create policy "geofence_settings: lectura autenticados" on public.geofence_settings for select to authenticated using (true);
create policy "geofence_settings: edicion jefe" on public.geofence_settings for update to authenticated using (public.is_jefe()) with check (public.is_jefe());

-- ---- agenda / metas / turnos: lectura abierta (Mi día las necesita), edición jefe ----
-- Excepción: cualquiera puede marcar `done` en su propio turno (aseo) desde Mi día,
-- por eso hay una policy de update adicional para shifts limitada por dueño; qué
-- columna puede tocar cada rol lo impone trg_shifts_guard_columns (sección 15b).

create policy "agenda_days: lectura autenticados" on public.agenda_days for select to authenticated using (true);
create policy "agenda_days: mutacion jefe" on public.agenda_days for all to authenticated using (public.is_jefe()) with check (public.is_jefe());

create policy "weekly_goals: lectura autenticados" on public.weekly_goals for select to authenticated using (true);
create policy "weekly_goals: mutacion jefe" on public.weekly_goals for all to authenticated using (public.is_jefe()) with check (public.is_jefe());

create policy "shifts: lectura autenticados" on public.shifts for select to authenticated using (true);
create policy "shifts: crud jefe" on public.shifts for all to authenticated using (public.is_jefe()) with check (public.is_jefe());
-- Un mesero/cocinero puede marcar `done` en SU turno (checkbox de aseo en "Mi día"),
-- pero no tocar el resto de columnas — eso lo impone trg_shifts_guard_columns abajo,
-- por la misma razón que en purchase_orders (GRANT de columna no distingue jefe de staff).
create policy "shifts: marcar aseo propio" on public.shifts for update to authenticated using (
  user_id = public.current_user_id() or public.is_jefe()
) with check (
  user_id = public.current_user_id() or public.is_jefe()
);

create policy "bonuses: lectura autenticados" on public.bonuses for select to authenticated using (true);
create policy "bonuses: mutacion jefe" on public.bonuses for all to authenticated using (public.is_jefe()) with check (public.is_jefe());

-- ---- checklist: propio, jefe puede ver todo (no editar el de otros) ----

create policy "checklist_entries: lectura propia o jefe" on public.checklist_entries for select to authenticated using (
  user_id = public.current_user_id() or public.is_jefe()
);
create policy "checklist_entries: escritura propia" on public.checklist_entries for insert to authenticated with check (
  user_id = public.current_user_id()
);
create policy "checklist_entries: actualizar propia" on public.checklist_entries for update to authenticated using (
  user_id = public.current_user_id()
) with check (
  user_id = public.current_user_id()
);

create policy "checklist_photos: lectura propia o jefe" on public.checklist_photos for select to authenticated using (
  user_id = public.current_user_id() or public.is_jefe()
);
create policy "checklist_photos: escritura propia" on public.checklist_photos for insert to authenticated with check (
  user_id = public.current_user_id()
);

-- ---- recibidos / pedidos a proveedor: visibles a todos, alta restringida ----

create policy "deliveries: lectura autenticados" on public.deliveries for select to authenticated using (true);
create policy "deliveries: alta por dominio" on public.deliveries for insert to authenticated with check (
  user_id = public.current_user_id() and (
    public.is_jefe() or exists (
      select 1 from public.items i join public.categories c on c.id = i.category
      where i.id = deliveries.item_id and c.domain = public.user_domain()
    )
  )
);

create policy "purchase_orders: lectura autenticados" on public.purchase_orders for select to authenticated using (true);
create policy "purchase_orders: alta jefe" on public.purchase_orders for insert to authenticated with check (
  public.is_jefe() and ordered_by = public.current_user_id()
);
-- Cualquier rol puede marcar "llegó" (igual que onMarcarLlegoProveedor en el original,
-- sin chequeo de dominio). La restricción de que NO-jefe solo pueda tocar
-- status/received_by/received_at (y no item_id, qty, supplier, etc.) la impone el
-- trigger trg_purchase_orders_guard_columns más abajo — GRANT de columna no sirve
-- acá porque 'authenticated' es un único rol de Postgres compartido por jefe y staff.
create policy "purchase_orders: marcar recibido cualquiera" on public.purchase_orders for update to authenticated using (true)
  with check (true);

-- ---- pérdidas: visibles y creables por todos (producto limitado a su dominio si aplica) ----

create policy "losses: lectura autenticados" on public.losses for select to authenticated using (true);
create policy "losses: alta por dominio" on public.losses for insert to authenticated with check (
  user_id = public.current_user_id() and (
    item_id is null or public.is_jefe() or exists (
      select 1 from public.items i join public.categories c on c.id = i.category
      where i.id = losses.item_id and c.domain = public.user_domain()
    )
  )
);

-- ---- caja: jefe y mesero (pestaña propia, no cocinero — igual que Vender) ----

create policy "cash_register: crud jefe y mesero" on public.cash_register for all to authenticated
  using (public.is_jefe() or public.current_user_role() = 'mesero')
  with check (public.is_jefe() or public.current_user_role() = 'mesero');
create policy "cash_register_purchases: crud jefe y mesero" on public.cash_register_purchases for all to authenticated
  using (public.is_jefe() or public.current_user_role() = 'mesero')
  with check (public.is_jefe() or public.current_user_role() = 'mesero');
create policy "cash_register_transport_aid: crud jefe y mesero" on public.cash_register_transport_aid for all to authenticated
  using (public.is_jefe() or public.current_user_role() = 'mesero')
  with check (public.is_jefe() or public.current_user_role() = 'mesero');

-- ---- calificación de servicio: ÚNICA tabla con escritura pública sin login ----

create policy "service_ratings: insercion publica" on public.service_ratings for insert to anon, authenticated with check (true);
create policy "service_ratings: lectura jefe" on public.service_ratings for select to authenticated using (public.is_jefe());

-- ---- vencimientos: solo-jefe ----

create policy "utility_bills: lectura jefe" on public.utility_bills for select to authenticated using (public.is_jefe());
create policy "utility_bills: mutacion jefe" on public.utility_bills for all to authenticated using (public.is_jefe()) with check (public.is_jefe());

-- ---- actividad reciente: solo-jefe lee, nadie inserta directo (solo triggers) ----

create policy "activity_log: lectura jefe" on public.activity_log for select to authenticated using (public.is_jefe());

-- ============================================================================
-- 15b. TRIGGERS de restricción por columna (donde RLS por fila no alcanza)
-- ============================================================================
-- Postgres no tiene "column-level RLS": los GRANT de columna aplican al rol
-- 'authenticated' completo (jefe y staff comparten ese único rol de Postgres en
-- Supabase), así que no sirven para decir "jefe edita todo, staff solo un campo"
-- en la misma tabla. Estos triggers hacen esa validación fila por fila.

create or replace function public.trg_shifts_guard_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.is_jefe() then
    return new;
  end if;
  if new.date is distinct from old.date
     or new.person_name is distinct from old.person_name
     or new.user_id is distinct from old.user_id
     or new.area is distinct from old.area
     or new.schedule_label is distinct from old.schedule_label
     or new.shift_type is distinct from old.shift_type
     or new.cleaning_task is distinct from old.cleaning_task then
    raise exception 'Solo un jefe puede editar los datos del turno — tu rol únicamente puede marcar la tarea de aseo (done).';
  end if;
  return new;
end;
$$;

create trigger trg_shifts_guard_columns before update on public.shifts
  for each row execute function public.trg_shifts_guard_columns();

create or replace function public.trg_purchase_orders_guard_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.is_jefe() then
    return new;
  end if;
  if new.item_id is distinct from old.item_id
     or new.supplier is distinct from old.supplier
     or new.qty is distinct from old.qty
     or new.expected_date is distinct from old.expected_date
     or new.ordered_by is distinct from old.ordered_by
     or new.ordered_at is distinct from old.ordered_at then
    raise exception 'Tu rol solo puede marcar el pedido como recibido, no editar sus datos.';
  end if;
  return new;
end;
$$;

create trigger trg_purchase_orders_guard_columns before update on public.purchase_orders
  for each row execute function public.trg_purchase_orders_guard_columns();

-- ============================================================================
-- 16. GRANTS de columna — blindaje extra para users.pin_hash
-- ============================================================================
-- RLS controla FILAS, no columnas. pin_hash jamás debe viajar al cliente aunque
-- una policy de SELECT diga "true" — por eso se revoca todo y se listan las
-- columnas permitidas explícitamente.

revoke all on public.users from anon, authenticated;
grant select (id, name, role, subrole, active, created_at) on public.users to authenticated;
grant update (active) on public.users to authenticated;
grant select (id, name, active) on public.users to anon; -- solo lo mínimo para el selector de nombre en /login
-- INSERT, DELETE y cualquier cambio a pin_hash / auth_user_id: solo service_role,
-- desde Route Handlers (Paso 3) — así el hash del PIN nunca pasa por el cliente.

-- ============================================================================
-- 17. STORAGE — fotos de checklist y de pedidos recibidos
-- ============================================================================
-- Bucket privado. Convención de rutas:
--   checklist/{YYYY-MM-DD}/{user_id}/{section}.jpg
--   deliveries/{delivery_id}/{producto|factura}.jpg

insert into storage.buckets (id, name, public)
values ('happy-pub-photos', 'happy-pub-photos', false)
on conflict (id) do nothing;

create policy "storage: checklist propio o jefe lee"
on storage.objects for select to authenticated using (
  bucket_id = 'happy-pub-photos' and (
    public.is_jefe() or
    ( (storage.foldername(name))[1] = 'checklist' and (storage.foldername(name))[3] = public.current_user_id()::text ) or
    (storage.foldername(name))[1] = 'deliveries'
  )
);

create policy "storage: checklist propio sube"
on storage.objects for insert to authenticated with check (
  bucket_id = 'happy-pub-photos' and (
    ( (storage.foldername(name))[1] = 'checklist' and (storage.foldername(name))[3] = public.current_user_id()::text ) or
    (storage.foldername(name))[1] = 'deliveries'
  )
);

-- ============================================================================
-- 18. REALTIME (Paso 3) — se deja activado de una vez, no hace daño antes de tiempo
-- ============================================================================
-- Reemplaza el POLL_MS=3000 del original. Suscribirse desde el cliente con
-- supabase.channel(...).on('postgres_changes', {event:'*', schema:'public', table:'...'}, cb).
-- Tablas: inventario (item_status), pedidos del día (orders/order_items),
-- asistencia (attendance), mesas ocupadas (table_locks).

alter publication supabase_realtime add table public.item_status;
alter publication supabase_realtime add table public.orders;
alter publication supabase_realtime add table public.order_items;
alter publication supabase_realtime add table public.attendance;
alter publication supabase_realtime add table public.table_locks;
alter publication supabase_realtime add table public.activity_log;

-- ============================================================================
-- Fin del schema. Siguiente: supabase/seed.sql con el catálogo real.
-- ============================================================================
