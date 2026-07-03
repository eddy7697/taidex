export type StockDayRow = {
  date: string;   // ISO YYYY-MM-DD
  open: number; high: number; low: number; close: number;
  volume: number; // 股(與每日 ingest 相同單位,顯示層才換算張)
};

// 民國 "115/06/02" → "2026-06-02"
function rocSlashToIso(d: string | undefined): string | null {
  const m = d?.match(/^(\d{2,3})\/(\d{2})\/(\d{2})$/);
  if (!m) return null;
  return `${Number(m[1]) + 1911}-${m[2]}-${m[3]}`;
}

function num(s: string | undefined): number | null {
  if (s == null) return null;
  const cleaned = s.replace(/,/g, "").trim();
  if (cleaned === "" || cleaned === "-" || cleaned === "--") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

// STOCK_DAY data 列:[日期, 成交股數, 成交金額, 開盤, 最高, 最低, 收盤, 漲跌價差, 成交筆數]
export function parseStockDay(json: unknown): StockDayRow[] {
  const j = json as { stat?: string; data?: unknown } | null;
  if (j?.stat !== "OK" || !Array.isArray(j.data)) return [];
  const out: StockDayRow[] = [];
  for (const row of j.data as string[][]) {
    const date = rocSlashToIso(row[0]);
    const close = num(row[6]);
    if (!date || close == null) continue; // 停牌/無效列跳過
    out.push({
      date,
      open: num(row[3]) ?? close,
      high: num(row[4]) ?? close,
      low: num(row[5]) ?? close,
      close,
      volume: num(row[1]) ?? 0,
    });
  }
  return out;
}

// 單股單月日線。yyyymm01 形如 "20260601"(TWSE 以任一當月日期代表整月)。
export async function fetchStockDayMonth(
  symbol: string,
  yyyymm01: string,
  fetchImpl: typeof fetch = fetch,
): Promise<StockDayRow[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const url = `https://www.twse.com.tw/rwd/zh/afterTrading/STOCK_DAY?date=${yyyymm01}&stockNo=${symbol}&response=json`;
    const res = await fetchImpl(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`TWSE STOCK_DAY failed: ${res.status} (${symbol} ${yyyymm01})`);
    return parseStockDay(await res.json());
  } finally {
    clearTimeout(timeout);
  }
}
