import { describe, it, expect } from "vitest";
import { computeFactorScores, inUniverse, percentileRanks } from "@/lib/strategy/engine";
import type { FactorRow } from "@/lib/strategy/types";

export function makeRow(over: Partial<FactorRow>): FactorRow {
  return {
    symbol: "0000", name: "測試", close: 100, changePct: 0, volumeLots: 1000,
    peRatio: 15, dividendYield: 4, pbRatio: 1.5, biasPct: 0, chipsRatio: 0,
    ...over,
  };
}

describe("percentileRanks", () => {
  it("嚴格小於計數 / (n-1) × 100;null 保持 null 且不入母體", () => {
    expect(percentileRanks([10, 20, null, 30])).toEqual([0, 50, null, 100]);
  });
  it("同值同名次(ties 取相同百分位)", () => {
    const [a, b, c] = percentileRanks([5, 5, 9]);
    expect(a).toBe(b);
    expect(c).toBe(100);
  });
  it("母體 < 2 → 50", () => {
    expect(percentileRanks([7, null])).toEqual([50, null]);
  });
});

describe("inUniverse", () => {
  it("成交 ≥ 200 張且股價 ≥ 5 元", () => {
    expect(inUniverse(makeRow({ volumeLots: 200, close: 5 }))).toBe(true);
    expect(inUniverse(makeRow({ volumeLots: 199 }))).toBe(false);
    expect(inUniverse(makeRow({ close: 4.9 }))).toBe(false);
  });
});

describe("computeFactorScores", () => {
  it("價值取 PE/PB 低者佳均值;收息/籌碼/熱度高者佳;動能為乖離+漲幅均值", () => {
    const rows = [
      makeRow({ peRatio: 10, pbRatio: 1, dividendYield: 6, biasPct: 5, changePct: 3, chipsRatio: 2, volumeLots: 5000 }),
      makeRow({ peRatio: 30, pbRatio: 3, dividendYield: 1, biasPct: -5, changePct: -3, chipsRatio: -2, volumeLots: 300 }),
    ];
    const [good, bad] = computeFactorScores(rows);
    expect(good.value).toBe(100);   // PE、PB 皆最低 → 低者佳 100
    expect(bad.value).toBe(0);
    expect(good.dividend).toBe(100);
    expect(good.momentum).toBe(100);
    expect(good.chips).toBe(100);
    expect(good.heat).toBe(100);
    expect(bad.heat).toBe(0);
  });
  it("因子輸入 null → 該因子 null;單邊 null 的複合因子取另一邊", () => {
    const rows = [
      makeRow({ peRatio: null, pbRatio: null, dividendYield: null, biasPct: null, changePct: 2 }),
      makeRow({ peRatio: 10, pbRatio: 1, dividendYield: 3, biasPct: 1, changePct: 1 }),
    ];
    const [etf] = computeFactorScores(rows);
    expect(etf.value).toBeNull();
    expect(etf.dividend).toBeNull();
    expect(etf.momentum).toBe(100); // 只剩 changePct,2 > 1
  });
});
