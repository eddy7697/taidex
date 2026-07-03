import { describe, it, expect } from "vitest";
import { buildSnapshot, getScreenerSnapshot } from "@/lib/screener/service";
import type { DailyRow } from "@/lib/ingest/twseOpenApi";
import type { ValuationRow } from "@/lib/screener/bwibbu";

const daily: DailyRow[] = [
  { symbol: "2330", name: "台積電", open: 1080, high: 1090, low: 1075, close: 1085, volume: 21_000_000, change: 5, date: "2026-07-02" },
  { symbol: "0050", name: "元大台灣50", open: 200, high: 202, low: 199, close: 201, volume: 5_500_000, change: null, date: "2026-07-02" },
];
const valuation: ValuationRow[] = [
  { symbol: "2330", peRatio: 25.51, dividendYield: 1.55, pbRatio: 7.53 },
];

describe("buildSnapshot", () => {
  it("以 symbol join,換算漲跌%與張數,無估值者為 null", () => {
    const snap = buildSnapshot(daily, valuation);
    expect(snap.date).toBe("2026-07-02");
    expect(snap.rows).toHaveLength(2);
    const tsmc = snap.rows.find((r) => r.symbol === "2330")!;
    expect(tsmc.volumeLots).toBe(21000);
    expect(tsmc.changePct).toBeCloseTo((5 / 1080) * 100, 5); // 前收 = 1085 - 5
    expect(tsmc.peRatio).toBe(25.51);
    const etf = snap.rows.find((r) => r.symbol === "0050")!;
    expect(etf.changePct).toBeNull(); // 無 Change 欄
    expect(etf.peRatio).toBeNull();
  });
  it("前收 ≤ 0 時 changePct 為 null(除零保護)", () => {
    const weird: DailyRow[] = [{ ...daily[0], close: 5, change: 5 }];
    expect(buildSnapshot(weird, []).rows[0].changePct).toBeNull();
  });
});

describe("getScreenerSnapshot", () => {
  it("估值源失敗 → 估值欄全 null 仍回價量", async () => {
    const snap = await getScreenerSnapshot({
      daily: async () => daily,
      valuation: async () => { throw new Error("boom"); },
    });
    expect(snap.rows).toHaveLength(2);
    expect(snap.rows.every((r) => r.peRatio === null)).toBe(true);
  });
  it("價量源失敗 → throw", async () => {
    await expect(
      getScreenerSnapshot({ daily: async () => { throw new Error("down"); }, valuation: async () => valuation }),
    ).rejects.toThrow("down");
  });
});
