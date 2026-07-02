import { auth } from "@/auth";
import { listWatchlist, addToWatchlist } from "@/lib/watchlist/service";
import { getQuotes } from "@/lib/quotes/quoteService";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 });
  const items = await listWatchlist(session.user.id);
  const quotes = await getQuotes(items.map((i) => i.stockSymbol));
  const bySymbol = new Map(quotes.map((q) => [q.symbol, q]));
  const merged = items.map((i) => ({ ...i, quote: bySymbol.get(i.stockSymbol) ?? null }));
  return Response.json({ items: merged });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 });
  const { symbol } = await req.json();
  if (typeof symbol !== "string" || !symbol) return new Response("Bad Request", { status: 400 });
  await addToWatchlist(session.user.id, symbol);
  return Response.json({ ok: true });
}
