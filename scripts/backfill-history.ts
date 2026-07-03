import { prisma } from "@/lib/prisma";
import { fetchStockDayMonth } from "@/lib/ingest/twseStockDay";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// 近 months 個月的月初日期參數(YYYYMM01),由當月往回。
function monthParams(months: number, now = new Date()): string[] {
  const out: string[] = [];
  for (let i = 0; i < months; i++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    out.push(`${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}01`);
  }
  return out;
}

async function main() {
  const arg = process.argv.find((a) => a.startsWith("--months="));
  const months = Math.max(1, Number(arg?.split("=")[1]) || 2);

  // 只回填會顯示走勢線的股票:自選 ∪ 持股。
  const [watch, held] = await Promise.all([
    prisma.watchlistItem.findMany({ distinct: ["stockSymbol"], select: { stockSymbol: true } }),
    prisma.holdingTransaction.findMany({ distinct: ["stockSymbol"], select: { stockSymbol: true } }),
  ]);
  const symbols = [...new Set([...watch, ...held].map((r) => r.stockSymbol))].sort();
  console.log(`backfill ${symbols.length} symbols x ${months} months`);

  const failures: string[] = [];
  let rowsDone = 0;
  for (const symbol of symbols) {
    for (const month of monthParams(months)) {
      try {
        const rows = await fetchStockDayMonth(symbol, month);
        for (const r of rows) {
          const date = new Date(`${r.date}T00:00:00Z`); // UTC 午夜,與每日 ingest(pod UTC)一致
          await prisma.dailyQuote.upsert({
            where: { stockSymbol_date: { stockSymbol: symbol, date } },
            create: {
              stockSymbol: symbol, date,
              open: r.open, high: r.high, low: r.low, close: r.close, volume: BigInt(r.volume),
            },
            update: {}, // 既有資料(每日 ingest)不覆蓋
          });
          rowsDone++;
        }
        console.log(`${symbol} ${month}: ${rows.length} rows`);
      } catch (e) {
        failures.push(`${symbol} ${month}: ${(e as Error).message}`);
      }
      await sleep(1500); // TWSE 節流,避免高頻被封
    }
  }
  console.log(`done, ${rowsDone} rows processed`);
  if (failures.length) {
    console.error(`failures (${failures.length}):\n${failures.join("\n")}`);
    process.exitCode = 1;
  }
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
