import type { SectorSummary } from "@/lib/market-overview/types";

type Row = Record<string, string>;

function num(s: string | undefined): number | null {
  if (s == null) return null;
  const cleaned = s.replace(/,/g, "");
  if (cleaned === "" || cleaned === "-") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

// 民國 "1150702" → "2026-07-02"
function rocToIso(d: string | undefined): string | null {
  const m = d?.match(/^(\d{3})(\d{2})(\d{2})$/);
  if (!m) return null;
  return `${Number(m[1]) + 1911}-${m[2]}-${m[3]}`;
}

// OpenAPI exchangeReport/MI_INDEX:只取「⋯類指數」(排除報酬指數),
// 漲跌方向以「漲跌」欄為準(下跌列的「漲跌百分比」可能已帶負號,取絕對值後套方向)
export function parseSectorIndices(json: unknown): SectorSummary | null {
  if (!Array.isArray(json) || json.length === 0) return null;
  const rows = json as Row[];
  const date = rocToIso(rows[0]?.["日期"]);
  if (!date) return null;
  const sectors = [];
  for (const r of rows) {
    const name = r["指數"] ?? "";
    if (!name.endsWith("類指數") || name.includes("報酬")) continue;
    const close = num(r["收盤指數"]);
    const pct = num(r["漲跌百分比"]);
    if (close == null || pct == null) continue;
    const sign = r["漲跌"] === "-" ? -1 : 1;
    sectors.push({
      name: name.slice(0, -"類指數".length),
      close,
      changePct: sign * Math.abs(pct),
    });
  }
  if (sectors.length === 0) return null;
  sectors.sort((a, b) => b.changePct - a.changePct);
  return { date, sectors };
}

export async function fetchSectorIndices(fetchImpl: typeof fetch = fetch): Promise<SectorSummary | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetchImpl("https://openapi.twse.com.tw/v1/exchangeReport/MI_INDEX", {
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`TWSE OpenAPI MI_INDEX failed: ${res.status}`);
    return parseSectorIndices(await res.json());
  } finally {
    clearTimeout(timeout);
  }
}
