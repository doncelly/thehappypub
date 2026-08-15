import { requireRole } from "@/lib/auth/current-user";
import { createClient } from "@/lib/supabase/server";
import { todayISO, bogotaDayRangeUTC } from "@/lib/format";
import { logSupabaseError } from "@/lib/log-supabase-error";
import { CajaClient } from "./CajaClient";

function isValidISODate(s: string | undefined): s is string {
  return !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

// Antes vivía dentro de Agenda (solo-jefe). Ahora es su propia pestaña,
// también accesible a mesero — en la práctica, quien está en el turno abre y
// cierra la caja, no solo el jefe.
export default async function CajaPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  await requireRole("jefe", "mesero");
  const { date: dateParam } = await searchParams;
  const date = isValidISODate(dateParam) ? dateParam : todayISO();
  const yesterdayDate = new Date(`${date}T12:00:00`);
  yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  const yesterday = yesterdayDate.toISOString().slice(0, 10);

  const supabase = await createClient();
  const dayRange = bogotaDayRangeUTC(date);

  const [
    { data: cashRegister, error: cashError },
    { data: cashPurchases, error: cashPurchasesError },
    { data: cashTransportAid, error: cashAidError },
    { data: users, error: usersError },
    { data: ordersToday, error: ordersError },
    { data: cashRegisterYesterday, error: cashYesterdayError },
    { data: cashCardPayments, error: cashCardPaymentsError },
    { data: cashOtherPayments, error: cashOtherPaymentsError },
    { data: cashCashPayments, error: cashCashPaymentsError },
  ] = await Promise.all([
    supabase.from("cash_register").select("*").eq("date", date).maybeSingle(),
    supabase.from("cash_register_purchases").select("*").eq("date", date),
    supabase.from("cash_register_transport_aid").select("*").eq("date", date),
    supabase.from("users").select("id, name"),
    supabase.from("orders").select("total").gte("created_at", dayRange.start).lte("created_at", dayRange.end),
    supabase.from("cash_register").select("*").eq("date", yesterday).maybeSingle(),
    supabase.from("cash_register_card_payments").select("*").eq("date", date),
    supabase.from("cash_register_other_payments").select("*").eq("date", date),
    supabase.from("cash_register_cash_payments").select("*").eq("date", date),
  ]);

  for (const [label, error] of Object.entries({
    cashError,
    cashPurchasesError,
    cashAidError,
    usersError,
    ordersError,
    cashYesterdayError,
    cashCardPaymentsError,
    cashOtherPaymentsError,
    cashCashPaymentsError,
  })) {
    logSupabaseError(`CajaPage ${label}`, error);
  }

  return (
    <CajaClient
      date={date}
      cashRegister={cashRegister}
      cashPurchases={cashPurchases ?? []}
      cashTransportAid={cashTransportAid ?? []}
      users={users ?? []}
      ventasHoy={(ordersToday ?? []).reduce((s, o) => s + o.total, 0)}
      cashRegisterYesterday={cashRegisterYesterday}
      cashCardPayments={cashCardPayments ?? []}
      cashOtherPayments={cashOtherPayments ?? []}
      cashCashPayments={cashCashPayments ?? []}
    />
  );
}
