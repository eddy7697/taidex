type Raw = Record<string, string>;
export type DailyRow = {
  symbol: string; name: string;
  open: number; high: number; low: number; close: number; volume: number;
};

function num(s: string | undefined): number | null {
  if (s == null) return null;
  const cleaned = s.replace(/,/g, "");
  if (cleaned === "-" || cleaned === "") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

export function parseTwseDaily(json: unknown): DailyRow[] {
  const arr = Array.isArray(json) ? (json as Raw[]) : [];
  const out: DailyRow[] = [];
  for (const r of arr) {
    const symbol = (r.Code ?? "").trim();
    const close = num(r.ClosingPrice);
    if (!symbol || close == null) continue;
    out.push({
      symbol,
      name: (r.Name ?? "").trim(),
      open: num(r.OpeningPrice) ?? close,
      high: num(r.HighestPrice) ?? close,
      low: num(r.LowestPrice) ?? close,
      close,
      volume: num(r.TradeVolume) ?? 0,
    });
  }
  return out;
}

export async function fetchTwseDaily(fetchImpl: typeof fetch = fetch): Promise<DailyRow[]> {
  const res = await fetchImpl("https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL");
  if (!res.ok) throw new Error(`TWSE OpenAPI failed: ${res.status}`);
  return parseTwseDaily(await res.json());
}
