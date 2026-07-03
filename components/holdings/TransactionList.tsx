"use client";
import { useCallback, useEffect, useState } from "react";
import type { ApiTxn } from "@/components/holdings/types";
import { fmtPrice, fmtMoney } from "@/lib/format";

export default function TransactionList({ symbol, onChanged }: { symbol: string; onChanged: () => void }) {
  const [txns, setTxns] = useState<ApiTxn[]>([]);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const res = await fetch(`/api/holdings/transactions?symbol=${encodeURIComponent(symbol)}`);
    if (!res.ok) return;
    const json = await res.json();
    setTxns(json.transactions ?? []);
  }, [symbol]);

  useEffect(() => { load(); }, [load]);

  async function remove(id: string) {
    if (!confirm("確定刪除這筆交易?")) return;
    setError("");
    const res = await fetch(`/api/holdings/transactions/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const json = await res.json().catch(() => null);
      setError(json?.error ?? "刪除失敗");
      return;
    }
    await load();
    onChanged();
  }

  return (
    <div className="mt-2 border-t border-white/10 pt-2 text-sm">
      {error && <p className="mb-1 text-down">{error}</p>}
      {txns.map((t) => (
        <div key={t.id} className="flex items-center justify-between gap-2 py-1">
          <span className={t.side === "BUY" ? "text-up" : "text-down"}>
            {t.side === "BUY" ? "買" : "賣"}
          </span>
          <span className="text-gray-400">{t.date.slice(0, 10)}</span>
          <span>{t.quantity.toLocaleString()} 股</span>
          <span>@{fmtPrice(t.price)}</span>
          <span className="text-gray-400">費 {fmtMoney(t.fee + t.tax)}</span>
          <button onClick={() => remove(t.id)} className="text-gray-500" aria-label="刪除交易">✕</button>
        </div>
      ))}
      {txns.length === 0 && <p className="text-gray-500">無交易紀錄</p>}
    </div>
  );
}
