import { auth } from "@/auth";
import { reorderWatchlist } from "@/lib/watchlist/service";

export async function PATCH(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 });
  const { symbols } = await req.json();
  if (!Array.isArray(symbols)) return new Response("Bad Request", { status: 400 });
  await reorderWatchlist(session.user.id, symbols);
  return Response.json({ ok: true });
}
