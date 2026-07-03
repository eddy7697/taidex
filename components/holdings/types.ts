import type { Quote } from "@/lib/quotes/types";

export type ApiPosition = {
  symbol: string;
  shares: number;
  totalCost: number;
  avgCost: number;
  realizedPnl: number;
  quote: Quote | null;
};

export type ApiSummary = {
  marketValue: number;
  totalCost: number;
  unrealizedPnl: number;
  returnPct: number;
  realizedPnl: number;
};

export type ApiTxn = {
  id: string;
  stockSymbol: string;
  side: "BUY" | "SELL";
  quantity: number;
  price: number;
  fee: number;
  tax: number;
  date: string;
  createdAt: string;
};
