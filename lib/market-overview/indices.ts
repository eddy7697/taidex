import { fetchIntradayQuotes } from "@/lib/quotes/misSource";
import type { Quote } from "@/lib/quotes/types";

// MIS 指數代號:t00=發行量加權股價指數(tse)、o00=櫃買指數(otc)。
// 盤後 MIS 仍回最後一盤資料,指數不入 DB,故不需 DB 回退。
const INDEX_SYMBOLS = ["t00", "o00"];
const DISPLAY_NAMES: Record<string, string> = { t00: "加權指數", o00: "櫃買指數" };
const MARKET_BY_SYMBOL = new Map([["o00", "OTC"]]);

export async function getIndexQuotes(fetchImpl: typeof fetch = fetch): Promise<Quote[]> {
  const quotes = await fetchIntradayQuotes(INDEX_SYMBOLS, fetchImpl, MARKET_BY_SYMBOL);
  return quotes.map((q) => ({ ...q, name: DISPLAY_NAMES[q.symbol] ?? q.name }));
}
