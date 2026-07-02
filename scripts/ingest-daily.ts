import { prisma } from "@/lib/prisma";
import { fetchTwseDaily } from "@/lib/ingest/twseOpenApi";

async function main() {
  const rows = await fetchTwseDaily();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  console.log(`fetched ${rows.length} rows`);

  for (const r of rows) {
    await prisma.stock.upsert({
      where: { symbol: r.symbol },
      create: { symbol: r.symbol, name: r.name, market: "TSE" },
      update: { name: r.name },
    });
    await prisma.dailyQuote.upsert({
      where: { stockSymbol_date: { stockSymbol: r.symbol, date: today } },
      create: {
        stockSymbol: r.symbol, date: today,
        open: r.open, high: r.high, low: r.low, close: r.close, volume: BigInt(r.volume),
      },
      update: {
        open: r.open, high: r.high, low: r.low, close: r.close, volume: BigInt(r.volume),
      },
    });
  }
  console.log("ingest done");
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
