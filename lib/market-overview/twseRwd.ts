import type { Breadth, InstitutionalFlow } from "@/lib/market-overview/types";

function num(s: string | undefined): number | null {
  if (s == null) return null;
  const cleaned = s.replace(/,/g, "");
  if (cleaned === "" || cleaned === "-") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

// "20260702" → "2026-07-02"
function isoDate(d: string | undefined): string | null {
  if (!d || !/^\d{8}$/.test(d)) return null;
  return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
}

// "649(54)" → { count: 649, limit: 54 };"75" → { count: 75, limit: 0 }
function parseCountWithLimit(s: string | undefined): { count: number; limit: number } | null {
  if (s == null) return null;
  const m = s.replace(/,/g, "").match(/^(\d+)(?:\((\d+)\))?$/);
  if (!m) return null;
  return { count: Number(m[1]), limit: Number(m[2] ?? 0) };
}

type RwdTable = { title?: string; fields?: string[]; data?: string[][] };
type RwdMiIndex = { tables?: RwdTable[]; date?: string; stat?: string };

// rwd afterTrading/MI_INDEX →「漲跌證券數合計」表,取「股票」欄(上市股票)
export function parseBreadth(json: unknown): Breadth | null {
  const doc = json as RwdMiIndex | null;
  const date = isoDate(doc?.date);
  const table = doc?.tables?.find((t) => t.title?.includes("漲跌證券數"));
  if (!date || !table?.data) return null;
  const col = (table.fields ?? []).indexOf("股票");
  if (col < 0) return null;
  const rowByType = new Map(table.data.map((r) => [r[0] ?? "", r[col]]));
  const up = parseCountWithLimit(rowByType.get("上漲(漲停)"));
  const down = parseCountWithLimit(rowByType.get("下跌(跌停)"));
  const unchanged = parseCountWithLimit(rowByType.get("持平"));
  if (!up || !down || !unchanged) return null;
  return {
    date,
    up: up.count, limitUp: up.limit,
    down: down.count, limitDown: down.limit,
    unchanged: unchanged.count,
  };
}

type RwdBfi82u = { stat?: string; date?: string; data?: string[][] };

// rwd fund/BFI82U → 彙總為外資/投信/自營商/合計(買賣差額,元)
export function parseInstitutional(json: unknown): InstitutionalFlow | null {
  const doc = json as RwdBfi82u | null;
  const date = isoDate(doc?.date);
  if (doc?.stat !== "OK" || !date || !doc.data) return null;
  let foreign = 0, trust = 0, dealer = 0, total = 0;
  for (const row of doc.data) {
    const name = row[0] ?? "";
    const diff = num(row[3]);
    if (diff == null) continue;
    if (name.startsWith("外資")) foreign += diff;
    else if (name.startsWith("投信")) trust += diff;
    else if (name.startsWith("自營商")) dealer += diff;
    else if (name === "合計") total = diff;
  }
  return { date, foreign, trust, dealer, total };
}

async function fetchRwdJson(url: string, fetchImpl: typeof fetch): Promise<unknown> {
  // 8s abort,避免上游卡住(同 twseOpenApi 模式);注入的測試假 fetch 會忽略 signal
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetchImpl(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`TWSE rwd failed: ${res.status}`);
    return res.json();
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchBreadth(fetchImpl: typeof fetch = fetch): Promise<Breadth | null> {
  const json = await fetchRwdJson("https://www.twse.com.tw/rwd/zh/afterTrading/MI_INDEX?response=json", fetchImpl);
  return parseBreadth(json);
}

export async function fetchInstitutional(fetchImpl: typeof fetch = fetch): Promise<InstitutionalFlow | null> {
  const json = await fetchRwdJson("https://www.twse.com.tw/rwd/zh/fund/BFI82U?response=json", fetchImpl);
  return parseInstitutional(json);
}
