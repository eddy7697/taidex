import type { Quote } from "@/lib/quotes/types";

// 上市股票漲跌家數(每日盤後)
export type Breadth = {
  date: string;      // ISO yyyy-mm-dd(資料日,盤中為前一交易日)
  up: number;
  limitUp: number;
  down: number;
  limitDown: number;
  unchanged: number;
};

// 三大法人買賣差額(元,每日盤後)
export type InstitutionalFlow = {
  date: string;
  foreign: number;   // 外資及陸資 + 外資自營商
  trust: number;     // 投信
  dealer: number;    // 自營商(自行買賣 + 避險)
  total: number;     // 合計
};

export type SectorChange = { name: string; close: number; changePct: number };
export type SectorSummary = { date: string; sectors: SectorChange[] }; // 依漲跌幅由高到低

export type MarketOverview = {
  indices: Quote[];                       // 加權指數 t00 / 櫃買指數 o00
  breadth: Breadth | null;
  institutional: InstitutionalFlow | null;
  sectors: SectorSummary | null;
};
