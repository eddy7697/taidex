import { auth } from "@/auth";
import { listTransactions, addTransaction, OversellError } from "@/lib/holdings/service";
import { estimateFee, estimateTax } from "@/lib/holdings/fees";

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
  if (side !== "BUY" && side !== "SELL") return Response.json({ error: "side 需為 BUY 或 SELL" }, { status: 400 });
  if (!Number.isInteger(quantity) || quantity <= 0) return Response.json({ error: "股數需為正整數" }, { status: 400 });
  if (typeof price !== "number" || !Number.isFinite(price) || price <= 0) return Response.json({ error: "價格需大於 0" }, { status: 400 });
  if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))) {
    return Response.json({ error: "日期格式需為 YYYY-MM-DD" }, { status: 400 });
  }
  const feeOk = fee === undefined || (Number.isInteger(fee) && fee >= 0);
  const taxOk = tax === undefined || (Number.isInteger(tax) && tax >= 0);
  if (!feeOk || !taxOk) return Response.json({ error: "費用需為非負整數" }, { status: 400 });

  try {
    await addTransaction(session.user.id, {
      symbol, side, quantity, price,
      fee: fee ?? estimateFee(price, quantity),
      tax: tax ?? (side === "SELL" ? estimateTax(price, quantity) : 0),
      date: new Date(date),
    });
  } catch (e) {
    if (e instanceof OversellError) return Response.json({ error: "持股不足,無法賣出" }, { status: 400 });
    throw e;
  }
  return Response.json({ ok: true });
}
