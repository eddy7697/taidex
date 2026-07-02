import { isMarketOpen } from "@/lib/market/hours";
import { fetchIntradayQuotes } from "@/lib/quotes/misSource";
import { getDailyQuotesFromDb } from "@/lib/quotes/dbSource";
import { memoize } from "@/lib/quotes/cache";
import { prisma } from "@/lib/prisma";
import type { Quote } from "@/lib/quotes/types";

export type QuoteDeps = {
  isOpen?: (now: Date) => boolean;
  intraday?: (symbols: string[]) => Promise<Quote[]>;
  db?: (symbols: string[]) => Promise<Quote[]>;
  now?: () => Date;
  marketLoader?: (symbols: string[]) => Promise<Map<string, string>>;
};

async function defaultMarketLoader(symbols: string[]): Promise<Map<string, string>> {
  const stocks = await prisma.stock.findMany({
    where: { symbol: { in: symbols } },
    select: { symbol: true, market: true },
  });
  return new Map(stocks.map((s: { symbol: string; market: string }) => [s.symbol, s.market]));
}

// Shared module-scope cache for the default MIS intraday path: MIS is a single upstream
// endpoint that many concurrent users' polling (e.g. every ~60s) would otherwise hammer
// per-request. A 30s TTL keeps quotes fresh enough for a live view while collapsing
// duplicate requests for the same symbol set into one upstream call.
const memoizedDefaultIntraday = memoize(
  async (key: string): Promise<Quote[]> => {
    const symbols = key.split(",").filter((s) => s.length > 0);
    const marketBySymbol = await defaultMarketLoader(symbols);
    return fetchIntradayQuotes(symbols, fetch, marketBySymbol);
  },
  30_000,
);

export async function getQuotes(symbols: string[], deps: QuoteDeps = {}): Promise<Quote[]> {
  if (symbols.length === 0) return [];
  const isOpen = deps.isOpen ?? isMarketOpen;
  // Only the fully-default intraday path (no injected intraday, no injected marketLoader)
  // goes through the shared module-scope cache. An injected deps.intraday (tests) is used
  // as-is so call-count assertions stay valid. If only marketLoader is overridden (e.g. to
  // test the market-prefix wiring without a real DB), we still build the real MIS call but
  // skip the cache, since memoize's `(key) => Promise<T>` shape can't thread a per-call
  // marketLoader through the module-scope singleton.
  const marketLoader = deps.marketLoader;
  const intraday = deps.intraday
    ? deps.intraday
    : marketLoader
      ? async (s: string[]) => fetchIntradayQuotes(s, fetch, await marketLoader(s))
      : (s: string[]) => memoizedDefaultIntraday([...s].sort().join(","));
  const db = deps.db ?? ((s: string[]) => getDailyQuotesFromDb(s));
  const now = (deps.now ?? (() => new Date()))();

  if (isOpen(now)) {
    try {
      const live = await intraday(symbols);
      const liveSymbols = new Set(live.map((q) => q.symbol));
      const missing = symbols.filter((s) => !liveSymbols.has(s));
      const backfill = missing.length ? await db(missing) : [];
      const bySymbol = new Map([...live, ...backfill].map((q) => [q.symbol, q]));
      const ordered = symbols.map((s) => bySymbol.get(s)).filter((q): q is Quote => q != null);
      if (ordered.length) return ordered;
    } catch {
      // 回退 DB
    }
  }
  return db(symbols);
}
