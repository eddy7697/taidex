"use client";
import Link from "next/link";
import type { ApiPosition } from "@/components/holdings/types";
import TransactionList from "@/components/holdings/TransactionList";
import { changeColorClass, fmtPrice, fmtMoney, fmtSignedMoney, fmtSignedPct } from "@/lib/format";

export default function PositionCard({
  position: p, expanded, onToggle, onChanged,
}: {
  position: ApiPosition; expanded: boolean; onToggle: () => void; onChanged: () => void;
}) {
  const unrealized = p.quote ? p.quote.price * p.shares - p.totalCost : null;
  const pct = unrealized !== null && p.totalCost > 0 ? (unrealized / p.totalCost) * 100 : null;
  const c = unrealized !== null ? changeColorClass(unrealized) : "text-gray-400";
  return (
    <div className="rounded-lg bg-[var(--card)] p-4">
      <button onClick={onToggle} className="w-full text-left">
        <div className="flex items-center justify-between">
          <div>
            <div className="font-bold">{p.quote?.name ?? p.symbol}</div>
            <div className="text-xs text-gray-400">
              {p.symbol}・{p.shares.toLocaleString()} 股・均價 {fmtPrice(p.avgCost)}
            </div>
          </div>
          <div className="text-right">
            <div className={`text-xl font-bold ${c}`}>
              {unrealized !== null ? fmtSignedMoney(unrealized) : "—"}
            </div>
            <div className={`text-sm ${c}`}>
              {pct !== null ? fmtSignedPct(pct) : "無報價"}
            </div>
          </div>
        </div>
      </button>
      {expanded && (
        <>
          <div className="mt-1 text-xs text-gray-400">
            現價 {p.quote ? fmtPrice(p.quote.price) : "—"}・
            <Link href={`/stock/${p.symbol}`} className="underline">看走勢</Link>
          </div>
          {p.dividendIncome > 0 && (
            <div className="mt-1 text-xs text-gray-400">累計股利 {fmtMoney(p.dividendIncome)}</div>
          )}
          <TransactionList symbol={p.symbol} onChanged={onChanged} />
        </>
      )}
    </div>
  );
}
