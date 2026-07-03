import { memoize } from "@/lib/quotes/cache";
import { fetchTwseDaily, type DailyRow } from "@/lib/ingest/twseOpenApi";
import { fetchBwibbu, type ValuationRow } from "@/lib/screener/bwibbu";
import type { ScreenerSnapshot } from "@/lib/screener/types";

export type SnapshotDeps = {
  daily?: () => Promise<DailyRow[]>;
  valuation?: () => Promise<ValuationRow[]>;
};

export function buildSnapshot(daily: DailyRow[], valuation: ValuationRow[]): ScreenerSnapshot {
  const bySymbol = new Map(valuation.map((v) => [v.symbol, v]));
  const rows = daily.map((d) => {
    const v = bySymbol.get(d.symbol);
    const prevClose = d.change == null ? null : d.close - d.change;
    return {
      symbol: d.symbol,
      name: d.name,
      close: d.close,
      changePct: prevClose != null && prevClose > 0 && d.change != null ? (d.change / prevClose) * 100 : null,
      volumeLots: Math.floor(d.volume / 1000),
      peRatio: v?.peRatio ?? null,
      dividendYield: v?.dividendYield ?? null,
      pbRatio: v?.pbRatio ?? null,
    };
  });
  return { date: daily[0]?.date ?? null, rows };
}

async function fetchSnapshot(deps: SnapshotDeps): Promise<ScreenerSnapshot> {
  const dailyRows = await (deps.daily ?? fetchTwseDaily)();
  let valuationRows: ValuationRow[] = [];
  try {
    valuationRows = await (deps.valuation ?? fetchBwibbu)();
  } catch {
    // 估值源失敗只影響估值欄(全 null),價量照常可篩
  }
  return buildSnapshot(dailyRows, valuationRows);
}

// 每日盤後資料,10min 快取(同 market-overview 模式)
const cachedSnapshot = memoize(() => fetchSnapshot({}), 600_000);

export async function getScreenerSnapshot(deps: SnapshotDeps = {}): Promise<ScreenerSnapshot> {
  if (deps.daily || deps.valuation) return fetchSnapshot(deps);
  return cachedSnapshot("snapshot");
}
