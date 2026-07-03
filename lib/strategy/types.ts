import type { ScreenerRow } from "@/lib/screener/types";

export type FactorRow = ScreenerRow & {
  biasPct: number | null;    // 月線乖離%
  chipsRatio: number | null; // 三大法人買賣超佔成交量%(可負)
};
export type StrategySnapshot = { date: string | null; rows: FactorRow[] };
export type FactorKey = "value" | "dividend" | "momentum" | "chips" | "heat";
export type Weights = Record<FactorKey, number>;
export type FactorScores = Record<FactorKey, number | null>;
export type StrategyDef = { key: string; label: string; blurb: string; weights: Weights };
export type Recommendation = { row: FactorRow; score: number; factors: FactorScores; reasons: string[] };
