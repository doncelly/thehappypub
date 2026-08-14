export type CashRegister = {
  date: string;
  open_by: string | null;
  open_by_user: string | null;
  open_time: string | null;
  base_amount: number | null;
  remnant_received: number | null;
  observations: string | null;
  close_by: string | null;
  close_by_user: string | null;
  close_time: string | null;
  cash_amount: number | null;
  card_amount: number | null;
  other_payment_amount: number | null;
  remnant_accumulated: number | null;
  next_base: number | null;
  last_table: string | null;
  reviewed_by: string | null;
  updated_at: string;
} | null;

export type CashPurchase = { id: number; date: string; concept: string; amount: number };
export type CashTransportAid = { id: number; date: string; collaborator: string; amount: number };
export type CashCardPayment = { id: number; date: string; concept: string | null; amount: number };
export type CashOtherPayment = { id: number; date: string; concept: string | null; amount: number };
export type UserRow = { id: string; name: string };
