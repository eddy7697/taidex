import type { Txn } from "@/lib/holdings/positions";
import { DIV_TRANSFER_FEE, estimateNhi } from "@/lib/holdings/fees";

export type DividendEventLike = {
  stockSymbol: string; kind: "CASH" | "STOCK";
  exDate: Date; perShare: number; paymentDate: Date | null; year: string;
};

export type DividendSuggestion = {
  symbol: string; kind: "CASH" | "STOCK"; side: "DIV_CASH" | "DIV_STOCK";
  exDate: string; year: string;
  sharesAtEx: number; quantity: number; price: number; amount: number;
  fee: number; tax: number; date: string;
};

// 除權息日前一日的持股:重放嚴格早於 date 的交易(現金股利不影響股數)
export function sharesAsOf(txns: Txn[], symbol: string, date: Date): number {
  let shares = 0;
  for (const t of txns) {
    if (t.stockSymbol !== symbol || t.side === "DIV_CASH") continue;
    if (t.date.getTime() >= date.getTime()) continue;
    shares += t.side === "SELL" ? -t.quantity : t.quantity;
  }
  return shares;
}

const RECORD_WINDOW_BEFORE = 7 * 86_400_000;
const RECORD_WINDOW_AFTER = 120 * 86_400_000; // 現金發放常在除息後 1 個月+,使用者可能以入帳日記帳

function isRecorded(txns: Txn[], e: DividendEventLike): boolean {
  const side = e.kind === "CASH" ? "DIV_CASH" : "DIV_STOCK";
  return txns.some(
    (t) => t.stockSymbol === e.stockSymbol && t.side === side &&
      t.date.getTime() >= e.exDate.getTime() - RECORD_WINDOW_BEFORE &&
      t.date.getTime() <= e.exDate.getTime() + RECORD_WINDOW_AFTER,
  );
}

const iso = (dt: Date) => dt.toISOString().slice(0, 10);

function toSuggestion(e: DividendEventLike, sharesAtEx: number): DividendSuggestion | null {
  if (e.kind === "CASH") {
    const amount = Math.round(sharesAtEx * e.perShare);
    if (amount <= 0) return null;
    return {
      symbol: e.stockSymbol, kind: "CASH", side: "DIV_CASH", exDate: iso(e.exDate), year: e.year,
      sharesAtEx, quantity: sharesAtEx, price: e.perShare, amount,
      fee: DIV_TRANSFER_FEE, tax: estimateNhi(amount),
      date: iso(e.paymentDate ?? e.exDate),
    };
  }
  const shares = Math.floor((sharesAtEx * e.perShare) / 10); // 面額 10 元:股票股利 X 元 = 每股配 X/10 股;畸零捨去
  if (shares <= 0) return null;
  return {
    symbol: e.stockSymbol, kind: "STOCK", side: "DIV_STOCK", exDate: iso(e.exDate), year: e.year,
    sharesAtEx, quantity: shares, price: 0, amount: 0, fee: 0, tax: 0, date: iso(e.exDate),
  };
}

export function buildDividendSuggestions(
  txns: Txn[], events: DividendEventLike[], today: Date,
): { actionable: DividendSuggestion[]; upcoming: DividendSuggestion[] } {
  const actionable: DividendSuggestion[] = [];
  const upcoming: DividendSuggestion[] = [];
  for (const e of [...events].sort((a, b) => a.exDate.getTime() - b.exDate.getTime())) {
    if (e.exDate.getTime() <= today.getTime()) {
      if (isRecorded(txns, e)) continue;
      const s = toSuggestion(e, sharesAsOf(txns, e.stockSymbol, e.exDate));
      if (s) actionable.push(s);
    } else {
      // 未來事件:以今日持股估算預告(僅展示,不可帶入)
      const s = toSuggestion(e, sharesAsOf(txns, e.stockSymbol, today));
      if (s) upcoming.push(s);
    }
  }
  return { actionable, upcoming };
}
