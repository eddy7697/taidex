import { auth } from "@/auth";
import { getScreenerSnapshot } from "@/lib/screener/service";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 });
  try {
    const snapshot = await getScreenerSnapshot();
    return Response.json(snapshot);
  } catch {
    return new Response("Upstream unavailable", { status: 502 });
  }
}
