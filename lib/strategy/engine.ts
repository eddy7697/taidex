import type { FactorKey, FactorRow, FactorScores } from "@/lib/strategy/types";

export const UNIVERSE_MIN_LOTS = 200; // 排除殭屍股
export const UNIVERSE_MIN_CLOSE = 5;  // 排除雞蛋水餃股

export const FACTOR_KEYS: FactorKey[] = ["value", "dividend", "momentum", "chips", "heat"];
export const FACTOR_LABELS: Record<FactorKey, string> = {
  value: "價值", dividend: "收息", momentum: "動能", chips: "籌碼", heat: "熱度",
};

export function inUniverse(r: FactorRow): boolean {
  return r.volumeLots >= UNIVERSE_MIN_LOTS && r.close >= UNIVERSE_MIN_CLOSE;
}

// 百分位(高者佳):嚴格小於該值的檔數/(母體-1)×100;null 不入母體;母體<2 → 50
export function percentileRanks(values: (number | null)[]): (number | null)[] {
  const sorted = values.filter((v): v is number => v != null).sort((a, b) => a - b);
  const n = sorted.length;
  return values.map((v) => {
    if (v == null) return null;
    if (n < 2) return 50;
    let lo = 0, hi = n; // lower bound 二分:嚴格小於 v 的個數
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (sorted[mid] < v) lo = mid + 1;
      else hi = mid;
    }
    return (lo / (n - 1)) * 100;
  });
}

const invert = (p: number | null): number | null => (p == null ? null : 100 - p);
const mean2 = (a: number | null, b: number | null): number | null =>
  a == null && b == null ? null : a == null ? b : b == null ? a : (a + b) / 2;

// rows 應已通過 inUniverse 門檻;回傳與 rows 逐列對齊的五因子分數(0–100 或 null)
export function computeFactorScores(rows: FactorRow[]): FactorScores[] {
  const peLow = percentileRanks(rows.map((r) => r.peRatio)).map(invert);
  const pbLow = percentileRanks(rows.map((r) => r.pbRatio)).map(invert);
  const yieldHigh = percentileRanks(rows.map((r) => r.dividendYield));
  const biasHigh = percentileRanks(rows.map((r) => r.biasPct));
  const chgHigh = percentileRanks(rows.map((r) => r.changePct));
  const chipsHigh = percentileRanks(rows.map((r) => r.chipsRatio));
  const heatHigh = percentileRanks(rows.map((r) => r.volumeLots));
  return rows.map((_, i) => ({
    value: mean2(peLow[i], pbLow[i]),
    dividend: yieldHigh[i],
    momentum: mean2(biasHigh[i], chgHigh[i]),
    chips: chipsHigh[i],
    heat: heatHigh[i],
  }));
}
