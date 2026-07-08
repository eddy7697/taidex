import { describe, it, expect } from "vitest";
import { sharesAsOf, buildDividendSuggestions } from "@/lib/holdings/dividendSuggestions";
import type { Txn } from "@/lib/holdings/positions";

const d = (s: string) => new Date(`${s}T00:00:00Z`);
let seq = 0;
const txn = (o: Partial<Txn> & { stockSymbol: string; side: Txn["side"]; quantity: number; date: Date }): Txn => ({
  id: `t${++seq}`, price: 100, fee: 0, tax: 0, createdAt: new Date(2020, 0, 1, 0, 0, seq), ...o,
});

describe("sharesAsOf", () => {
  it("重放買/賣/配股至指定日前一刻(嚴格早於);現金股利不影響", () => {
    const txns = [
      txn({ stockSymbol: "2887", side: "BUY", quantity: 2000, date: d("2026-01-10") }),
      txn({ stockSymbol: "2887", side: "SELL", quantity: 1000, date: d("2026-05-01") }),
      txn({ stockSymbol: "2887", side: "DIV_CASH", quantity: 1000, date: d("2026-06-01") }),
    ];
    expect(sharesAsOf(txns, "2887", d("2026-07-21"))).toBe(1000);
    expect(sharesAsOf(txns, "2887", d("2026-01-10"))).toBe(0); // 除權息日=買進日 → 不含
    expect(sharesAsOf(txns, "9999", d("2026-07-21"))).toBe(0);
  });
});

const events = [
  { stockSymbol: "2887", kind: "CASH" as const, exDate: d("2026-07-01"), perShare: 1.2, paymentDate: d("2026-08-19"), year: "114年" },
  { stockSymbol: "2887", kind: "STOCK" as const, exDate: d("2026-07-01"), perShare: 0.1, paymentDate: null, year: "114年" },
  { stockSymbol: "2887", kind: "CASH" as const, exDate: d("2026-12-01"), perShare: 0.5, paymentDate: null, year: "114年" }, // 未來
];

describe("buildDividendSuggestions", () => {
  const buy = txn({ stockSymbol: "2887", side: "BUY", quantity: 3000, date: d("2026-01-10") });

  it("已除息未記帳 → actionable:現金含匯費/健保費,配股 floor 畸零", () => {
    const { actionable, upcoming } = buildDividendSuggestions([buy], events, d("2026-07-09"));
    expect(actionable).toHaveLength(2);
    const cash = actionable.find((s) => s.kind === "CASH")!;
    expect(cash).toMatchObject({ side: "DIV_CASH", sharesAtEx: 3000, quantity: 3000, price: 1.2, amount: 3600, fee: 10, tax: 0, date: "2026-08-19" });
    const stock = actionable.find((s) => s.kind === "STOCK")!;
    expect(stock).toMatchObject({ side: "DIV_STOCK", quantity: 30, price: 0, fee: 0, tax: 0, date: "2026-07-01" }); // 3000×0.1/10=30
    expect(upcoming).toHaveLength(1);
    expect(upcoming[0].exDate).toBe("2026-12-01");
  });

  it("健保補充費:單筆 ≥ 2 萬課 2.11%", () => {
    const bigBuy = txn({ stockSymbol: "2887", side: "BUY", quantity: 20000, date: d("2026-01-10") });
    const { actionable } = buildDividendSuggestions([bigBuy], events, d("2026-07-09"));
    const cash = actionable.find((s) => s.kind === "CASH")!;
    expect(cash.amount).toBe(24000);
    expect(cash.tax).toBe(Math.round(24000 * 0.0211));
  });

  it("已記帳(同代號同型別,交易日於 exDate−7..+120 內)→ 不出現", () => {
    const recorded = txn({ stockSymbol: "2887", side: "DIV_CASH", quantity: 3000, price: 1.2, date: d("2026-08-19") });
    const { actionable } = buildDividendSuggestions([buy, recorded], events, d("2026-09-01"));
    expect(actionable.find((s) => s.kind === "CASH")).toBeUndefined();
    expect(actionable.find((s) => s.kind === "STOCK")).toBeDefined();
  });

  it("除權息日持股 0 → 不出現;配股換算 0 股 → 不出現", () => {
    const late = txn({ stockSymbol: "2887", side: "BUY", quantity: 50, date: d("2026-07-05") }); // 除權息(7/1)後才買
    const { actionable, upcoming } = buildDividendSuggestions([late], events, d("2026-07-09"));
    expect(actionable).toHaveLength(0);
    expect(upcoming).toHaveLength(1); // 12/1 前有持股 → 預告仍給(以今日持股>0 判斷)
    const tiny = txn({ stockSymbol: "2887", side: "BUY", quantity: 50, date: d("2026-01-10") }); // 50×0.1/10=0.5→floor 0
    const r2 = buildDividendSuggestions([tiny], events, d("2026-07-09"));
    expect(r2.actionable.filter((s) => s.kind === "STOCK")).toHaveLength(0);
    expect(r2.actionable.filter((s) => s.kind === "CASH")).toHaveLength(1); // 現金 60 元照給
  });
});
