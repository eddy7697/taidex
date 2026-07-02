import type { Quote } from "@/lib/quotes/types";

type MisRow = { c: string; n: string; z?: string; y?: string; v?: string; tlong?: string };

function toNum(s: string | undefined): number | null {
  if (s == null || s === "-" || s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export function parseMisResponse(json: unknown): Quote[] {
  const rows = (json as { msgArray?: MisRow[] })?.msgArray ?? [];
  const quotes: Quote[] = [];
  for (const r of rows) {
    const prevClose = toNum(r.y);
    const last = toNum(r.z);
    const price = last ?? prevClose ?? 0;
    const change = prevClose != null ? price - prevClose : 0;
    const changePct = prevClose && prevClose !== 0 ? (change / prevClose) * 100 : 0;
    const asOf = r.tlong ? new Date(Number(r.tlong)).toISOString() : new Date(0).toISOString();
    quotes.push({
      symbol: r.c,
      name: r.n,
      price,
      change,
      changePct,
      volume: toNum(r.v) ?? 0,
      asOf,
    });
  }
  return quotes;
}

// 需判斷上市(tse)或上櫃(otc)。此處預設 tse;實務由 Stock.market 決定,見組裝層。
export function buildExCh(symbols: string[], marketBySymbol?: Map<string, string>): string {
  return symbols
    .map((s) => {
      const m = marketBySymbol?.get(s) === "OTC" ? "otc" : "tse";
      return `${m}_${s}.tw`;
    })
    .join("|");
}

export async function fetchIntradayQuotes(
  symbols: string[],
  fetchImpl: typeof fetch = fetch,
  marketBySymbol?: Map<string, string>,
): Promise<Quote[]> {
  if (symbols.length === 0) return [];
  const exCh = buildExCh(symbols, marketBySymbol);
  const url = `https://mis.twse.com.tw/stock/api/getStockInfo.jsp?ex_ch=${encodeURIComponent(exCh)}&json=1&delay=0`;
  const res = await fetchImpl(url, { headers: { "User-Agent": "Mozilla/5.0" } });
  if (!res.ok) throw new Error(`MIS request failed: ${res.status}`);
  const json = await res.json();
  return parseMisResponse(json);
}
