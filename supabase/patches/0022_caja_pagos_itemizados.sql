-- Punto 20 del backlog: en vez de un solo número escrito a mano para
-- "Pagos en tarjetas del día", el cierre de caja ahora permite agregar cada
-- recibo/transacción por separado (igual que "Compras desde remanente") y
-- la app los suma sola — reduce el margen de error de sumar a mano antes de
-- escribir el total. Se agrega también "Otros medios de pago" (transferencia,
-- Nequi, etc.), que antes no existía como campo.

alter table public.cash_register add column if not exists other_payment_amount numeric;

create table if not exists public.cash_register_card_payments (
  id       bigint generated always as identity primary key,
  date     date not null references public.cash_register(date) on delete cascade,
  concept  text,
  amount   numeric not null check (amount > 0)
);
comment on table public.cash_register_card_payments is
  'Recibos de pago con tarjeta del día, uno por transacción — se suman para cash_register.card_amount al cerrar caja (antes era un solo número escrito a mano).';

create table if not exists public.cash_register_other_payments (
  id       bigint generated always as identity primary key,
  date     date not null references public.cash_register(date) on delete cascade,
  concept  text,
  amount   numeric not null check (amount > 0)
);
comment on table public.cash_register_other_payments is
  'Recibos de otros medios de pago del día (transferencia, Nequi, etc.), uno por transacción — se suman para cash_register.other_payment_amount al cerrar caja.';

alter table public.cash_register_card_payments enable row level security;
alter table public.cash_register_other_payments enable row level security;

drop policy if exists "cash_register_card_payments: crud jefe y mesero" on public.cash_register_card_payments;
create policy "cash_register_card_payments: crud jefe y mesero" on public.cash_register_card_payments for all to authenticated
  using (public.is_jefe() or public.current_user_role() = 'mesero')
  with check (public.is_jefe() or public.current_user_role() = 'mesero');

drop policy if exists "cash_register_other_payments: crud jefe y mesero" on public.cash_register_other_payments;
create policy "cash_register_other_payments: crud jefe y mesero" on public.cash_register_other_payments for all to authenticated
  using (public.is_jefe() or public.current_user_role() = 'mesero')
  with check (public.is_jefe() or public.current_user_role() = 'mesero');
