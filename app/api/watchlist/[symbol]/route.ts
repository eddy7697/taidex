import { auth } from "@/auth";
import { removeFromWatchlist } from "@/lib/watchlist/service";

export async function DELETE(_req: Request, { params }: { params: Promise<{ symbol: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 });
  const { symbol } = await params;
  await removeFromWatchlist(session.user.id, symbol);
  return Response.json({ ok: true });
}
