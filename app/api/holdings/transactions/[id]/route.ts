import { auth } from "@/auth";
import { deleteTransaction, OversellError } from "@/lib/holdings/service";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 });
  const { id } = await params;
  try {
    const result = await deleteTransaction(session.user.id, id);
    if (result === "not_found") return Response.json({ error: "找不到交易" }, { status: 404 });
  } catch (e) {
    if (e instanceof OversellError) {
      return Response.json({ error: "刪除後會導致賣超,請先刪除較晚的賣出紀錄" }, { status: 400 });
    }
    throw e;
  }
  return Response.json({ ok: true });
}
