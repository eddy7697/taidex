import { auth } from "@/auth";
import { cachedIndexHistory } from "@/lib/market-overview/indexHistory";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 });
  const sp = new URL(req.url).searchParams;
  const index = sp.get("index") === "tpex" ? "tpex" : "twse";
  const raw = Number(sp.get("months") ?? "3");
  const months = Number.isFinite(raw) ? Math.min(Math.max(Math.trunc(raw), 1), 6) : 3;
  try {
    const data = await cachedIndexHistory(`${index}:${months}`);
    return Response.json({ data });
  } catch {
    return Response.json({ data: [] }); // 上游失敗回空,前端顯示暫無資料
  }
}
