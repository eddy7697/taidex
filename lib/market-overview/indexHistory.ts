import { memoize } from "@/lib/quotes/cache";

// lightweight-charts 蠟燭圖直接可用的形狀
export type IndexBar = { time: string; open: number; high: number; low: number; close: number };
export type MarketIndexKey = "twse" | "tpex";

function num(s: string | undefined): number | null {
  if (s == null) return null;
  const cleaned = s.replace(/,/g, "").trim();
  if (cleaned === "" || cleaned === "-" || cleaned === "--") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

// 民國 "115/06/01" → "2026-06-01"
function rocSlashToIso(d: string | undefined): string | null {
  const m = d?.match(/^(\d{2,3})\/(\d{2})\/(\d{2})$/);
  if (!m) return null;
  return `${Number(m[1]) + 1911}-${m[2]}-${m[3]}`;
}

// 西元 "2026/06/01" → "2026-06-01"
function adSlashToIso(d: string | undefined): string | null {
  const m = d?.match(/^(\d{4})\/(\d{2})\/(\d{2})$/);
  if (!m) return null;
  return `${m[1]}-${m[2]}-${m[3]}`;
}

function toBar(time: string | null, o: string | undefined, h: string | undefined, l: string | undefined, c: string | undefined): IndexBar | null {
  const close = num(c);
  if (!time || close == null) return null;
  return { time, open: num(o) ?? close, high: num(h) ?? close, low: num(l) ?? close, close };
}

// TWSE rwd/zh/TAIEX/MI_5MINS_HIST 列:[日期, 開盤指數, 最高指數, 最低指數, 收盤指數]
export function parseTaiexHist(json: unknown): IndexBar[] {
  const j = json as { stat?: string; data?: unknown } | null;
  if (j?.stat !== "OK" || !Array.isArray(j.data)) return [];
  const out: IndexBar[] = [];
  for (const row of j.data as string[][]) {
    const bar = toBar(rocSlashToIso(row[0]), row[1], row[2], row[3], row[4]);
    if (bar) out.push(bar);
  }
  return out;
}

// TPEX www/zh-tw/indexInfo/inx →「櫃買指數(月查詢)」表,列:[日期, 開市, 最高, 最低, 收市, 漲/跌]
export function parseTpexInx(json: unknown): IndexBar[] {
  const j = json as { tables?: { title?: string; data?: unknown }[] } | null;
  const table = j?.tables?.find((t) => t.title?.includes("櫃買指數"));
  if (!table || !Array.isArray(table.data)) return [];
  const out: IndexBar[] = [];
  for (const row of table.data as string[][]) {
    const bar = toBar(adSlashToIso(row[0]), row[1], row[2], row[3], row[4]);
    if (bar) out.push(bar);
  }
  return out;
}

// 以台北時區取年月,避免伺服器時區在月初/月底跨日出錯
function taipeiYearMonth(now: Date): { year: number; month: number } {
  const ym = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei", year: "numeric", month: "2-digit",
  }).format(now); // "2026-07"
  const [y, m] = ym.split("-");
  return { year: Number(y), month: Number(m) };
}

// 近 count 個月(含當月),由舊到新
function recentMonths(now: Date, count: number): { year: number; month: number }[] {
  const { year, month } = taipeiYearMonth(now);
  const out: { year: number; month: number }[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const idx = year * 12 + (month - 1) - i;
    out.push({ year: Math.floor(idx / 12), month: (idx % 12) + 1 });
  }
  return out;
}

async function fetchMonth(
  index: MarketIndexKey,
  year: number,
  month: number,
  fetchImpl: typeof fetch,
): Promise<IndexBar[]> {
  const mm = String(month).padStart(2, "0");
  const url = index === "twse"
    ? `https://www.twse.com.tw/rwd/zh/TAIEX/MI_5MINS_HIST?date=${year}${mm}01&response=json`
    : `https://www.tpex.org.tw/www/zh-tw/indexInfo/inx?date=${year - 1911}/${mm}&response=json`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetchImpl(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`index history failed: ${res.status} (${index} ${year}-${mm})`);
    const json = await res.json();
    // 限流/錯誤回應不可當「空月」吞掉——拋錯讓 memoize 不快取、route 回空給前端
    if (index === "twse") {
      const stat = (json as { stat?: string } | null)?.stat;
      if (stat !== "OK") throw new Error(`TAIEX hist bad stat: ${stat} (${year}-${mm})`);
      return parseTaiexHist(json);
    }
    const tables = (json as { tables?: unknown[] } | null)?.tables;
    if (!Array.isArray(tables) || tables.length === 0) throw new Error(`TPEX inx missing tables (${year}-${mm})`);
    return parseTpexInx(json);
  } finally {
    clearTimeout(timeout);
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// 逐月抓取(對上游溫和)後合併排序;單月失敗直接拋錯,容錯交給呼叫端
export async function fetchIndexHistory(
  index: MarketIndexKey,
  months: number,
  fetchImpl: typeof fetch = fetch,
  now: Date = new Date(),
): Promise<IndexBar[]> {
  const bars: IndexBar[] = [];
  const list = recentMonths(now, months);
  for (let i = 0; i < list.length; i++) {
    if (i > 0) await sleep(300); // 逐月節流,避免觸發 TWSE 限流(限流會回 stat 非 OK)
    bars.push(...await fetchMonth(index, list[i].year, list[i].month, fetchImpl));
  }
  const byDate = new Map(bars.map((b) => [b.time, b]));
  return [...byDate.values()].sort((a, b) => a.time.localeCompare(b.time));
}

// 10min 快取(同其他每日資料),key 形如 "twse:3"
export const cachedIndexHistory = memoize((key: string) => {
  const [index, months] = key.split(":");
  return fetchIndexHistory(index as MarketIndexKey, Number(months));
}, 600_000);
