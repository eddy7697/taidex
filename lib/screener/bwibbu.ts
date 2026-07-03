type Raw = Record<string, string>;
export type ValuationRow = {
  symbol: string;
  peRatio: number | null;
  dividendYield: number | null;
  pbRatio: number | null;
};

function num(s: string | undefined): number | null {
  if (s == null) return null;
  const cleaned = s.replace(/,/g, "");
  if (cleaned === "" || cleaned === "-") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

// OpenAPI exchangeReport/BWIBBU_ALL:上市個股估值(虧損股 PEratio 為空字串 → null)
export function parseBwibbu(json: unknown): ValuationRow[] {
  const arr = Array.isArray(json) ? (json as Raw[]) : [];
  const out: ValuationRow[] = [];
  for (const r of arr) {
    const symbol = (r.Code ?? "").trim();
    if (!symbol) continue;
    out.push({
      symbol,
      peRatio: num(r.PEratio),
      dividendYield: num(r.DividendYield),
      pbRatio: num(r.PBratio),
    });
  }
  return out;
}

export async function fetchBwibbu(fetchImpl: typeof fetch = fetch): Promise<ValuationRow[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetchImpl("https://openapi.twse.com.tw/v1/exchangeReport/BWIBBU_ALL", {
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`TWSE OpenAPI BWIBBU_ALL failed: ${res.status}`);
    return parseBwibbu(await res.json());
  } finally {
    clearTimeout(timeout);
  }
}
