import { auth } from "@/auth";
import { getPositions } from "@/lib/holdings/service";
import { computeSummary } from "@/lib/holdings/positions";
import { getQuotes } from "@/lib/quotes/quoteService";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 });
  const all = await getPositions(session.user.id);
  const open = all.filter((p) => p.shares > 0);
  const quotes = await getQuotes(open.map((p) => p.symbol));
  const bySymbol = new Map(quotes.map((q) => [q.symbol, q]));
  // summary 用全部部位:已出清者只貢獻已實現損益
  const summary = computeSummary(all, bySymbol);
  const positions = open.map((p) => ({ ...p, quote: bySymbol.get(p.symbol) ?? null }));
  return Response.json({ positions, summary });
}
