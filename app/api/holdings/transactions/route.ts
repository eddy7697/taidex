import { auth } from "@/auth";
import { listTransactions, addTransaction, OversellError } from "@/lib/holdings/service";
import { resolveFees } from "@/lib/holdings/fees";
import type { Side } from "@/lib/holdings/positions";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 });
  const symbol = new URL(req.url).searchParams.get("symbol") ?? undefined;
  const transactions = await listTransactions(session.user.id, symbol);
  return Response.json({ transactions });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 });
  const body = await req.json().catch(() => null);
  if (!body) return Response.json({ error: "格式錯誤" }, { status: 400 });

  const { symbol, side, quantity, price, fee, tax, date } = body;
  if (typeof symbol !== "string" || !symbol) return Response.json({ error: "缺少股票代號" }, { status: 400 });
  const SIDES: Side[] = ["BUY", "SELL", "DIV_CASH", "DIV_STOCK"];
  if (!SIDES.includes(side)) return Response.json({ error: "side 不合法" }, { status: 400 });
  if (!Number.isInteger(quantity) || quantity <= 0) return Response.json({ error: "股數需為正整數" }, { status: 400 });
  // DIV_STOCK 無現金流,不要求 price;其餘(含每股股利)需 > 0
  if (side !== "DIV_STOCK" && (typeof price !== "number" || !Number.isFinite(price) || price <= 0)) {
    return Response.json({ error: "價格需大於 0" }, { status: 400 });
  }
  if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))) {
    return Response.json({ error: "日期格式需為 YYYY-MM-DD" }, { status: 400 });
  }
  const feeOk = fee === undefined || (Number.isInteger(fee) && fee >= 0);
  const taxOk = tax === undefined || (Number.isInteger(tax) && tax >= 0);
  if (!feeOk || !taxOk) return Response.json({ error: "費用需為非負整數" }, { status: 400 });

  const finalPrice = side === "DIV_STOCK" ? 0 : price;
  try {
    await addTransaction(session.user.id, {
      symbol, side, quantity, price: finalPrice,
      ...resolveFees(side, quantity, finalPrice, fee, tax),
      date: new Date(date),
    });
  } catch (e) {
    if (e instanceof OversellError) return Response.json({ error: "持股不足,無法賣出" }, { status: 400 });
    throw e;
  }
  return Response.json({ ok: true });
}
