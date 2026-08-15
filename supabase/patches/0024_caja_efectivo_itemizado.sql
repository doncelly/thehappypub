-- Punto 20 del backlog (parte 2): "Pagos en efectivo del día" pasa de un
-- solo número escrito a mano a una lista de conteos/entregas (igual que
-- tarjetas y otros medios de pago, patch 0022) que la app suma sola.

create table if not exists public.cash_register_cash_payments (
  id       bigint generated always as identity primary key,
  date     date not null references public.cash_register(date) on delete cascade,
  concept  text,
  amount   numeric not null check (amount > 0)
);
comment on table public.cash_register_cash_payments is
  'Conteos de efectivo del día, uno por conteo/entrega — se suman para cash_register.cash_amount al cerrar caja (antes era un solo número escrito a mano).';

alter table public.cash_register_cash_payments enable row level security;

drop policy if exists "cash_register_cash_payments: crud jefe y mesero" on public.cash_register_cash_payments;
create policy "cash_register_cash_payments: crud jefe y mesero" on public.cash_register_cash_payments for all to authenticated
  using (public.is_jefe() or public.current_user_role() = 'mesero')
  with check (public.is_jefe() or public.current_user_role() = 'mesero');
