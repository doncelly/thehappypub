"use client";

import { useRouter } from "next/navigation";
import { CajaSection } from "./CajaSection";
import type { CashRegister, CashPurchase, CashTransportAid, CashCardPayment, CashOtherPayment, CashCashPayment, UserRow } from "./types";

type Props = {
  date: string;
  cashRegister: CashRegister;
  cashPurchases: CashPurchase[];
  cashTransportAid: CashTransportAid[];
  users: UserRow[];
  ventasHoy: number;
  cashRegisterYesterday: CashRegister;
  cashCardPayments: CashCardPayment[];
  cashOtherPayments: CashOtherPayment[];
  cashCashPayments: CashCashPayment[];
};

function shiftDate(iso: string, delta: number): string {
  const d = new Date(iso + "T12:00:00");
  d.setDate(d.getDate() + delta);
  return d.toISOString().slice(0, 10);
}

export function CajaClient(props: Props) {
  const { date, users } = props;
  const router = useRouter();

  function goTo(newDate: string) {
    router.push(`/caja?date=${newDate}`);
  }

  return (
    <div>
      <div className="mb-3.5 flex items-center gap-2">
        <button onClick={() => goTo(shiftDate(date, -1))} className="h-8 w-8 flex-none rounded-lg border border-border bg-surface text-text-dim">
          ‹
        </button>
        <input
          type="date"
          value={date}
          onChange={(e) => e.target.value && goTo(e.target.value)}
          className="min-w-0 flex-1 appearance-none rounded-lg border border-border bg-surface px-2.5 py-2 text-[12px] font-semibold text-text"
        />
        <button onClick={() => goTo(shiftDate(date, 1))} className="h-8 w-8 flex-none rounded-lg border border-border bg-surface text-text-dim">
          ›
        </button>
      </div>

      <datalist id="cajaUserNames">
        {users.map((u) => (
          <option key={u.id} value={u.name} />
        ))}
      </datalist>

      <CajaSection
        date={date}
        cashRegister={props.cashRegister}
        purchases={props.cashPurchases}
        transportAid={props.cashTransportAid}
        ventasHoy={props.ventasHoy}
        cashRegisterYesterday={props.cashRegisterYesterday}
        cardPayments={props.cashCardPayments}
        otherPayments={props.cashOtherPayments}
        cashPayments={props.cashCashPayments}
        onChanged={() => router.refresh()}
      />
    </div>
  );
}
