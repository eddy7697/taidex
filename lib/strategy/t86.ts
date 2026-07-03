type RwdT86 = { stat?: string; date?: string; fields?: string[]; data?: string[][] };
export type T86Row = { symbol: string; totalNetShares: number };

function num(s: string | undefined): number | null {
  if (s == null) return null;
  const cleaned = s.replace(/,/g, "");
  if (cleaned === "-" || cleaned === "") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

export function parseT86(json: unknown): T86Row[] {
  const doc = json as RwdT86 | null;
  if (doc?.stat !== "OK" || !Array.isArray(doc.data)) throw new Error("T86 unavailable");
  const byName = (doc.fields ?? []).indexOf("三大法人買賣超股數");
  const out: T86Row[] = [];
  for (const row of doc.data) {
    const symbol = (row[0] ?? "").trim();
    const col = byName >= 0 ? byName : row.length - 1; // 官方表最後一欄即合計
    const net = num(row[col]);
    if (!symbol || net == null) continue;
    out.push({ symbol, totalNetShares: net });
  }
  return out;
}

export async function fetchT86(fetchImpl: typeof fetch = fetch): Promise<T86Row[]> {
  // 不帶 date 參數 → TWSE 自動回最新交易日;ALLBUT0999 排除權證類
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetchImpl("https://www.twse.com.tw/rwd/zh/fund/T86?selectType=ALLBUT0999&response=json", {
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`TWSE rwd failed: ${res.status}`);
    return parseT86(await res.json());
  } finally {
    clearTimeout(timeout);
  }
}
