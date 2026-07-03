"use client";
import Link from "next/link";
import type { ApiPosition } from "@/components/holdings/types";
import TransactionList from "@/components/holdings/TransactionList";
import { changeColorClass, fmtPrice, fmtMoney, fmtSignedMoney, fmtSignedPct } from "@/lib/format";

export default function PositionRow({
  position: p, expanded, onToggle, onChanged,
}: {
  position: ApiPosition; expanded: boolean; onToggle: () => void; onChanged: () => void;
}) {
  const unrealized = p.quote ? p.quote.price * p.shares - p.totalCost : null;
  const pct = unrealized !== null && p.totalCost > 0 ? (unrealized / p.totalCost) * 100 : null;
  const c = unrealized !== null ? changeColorClass(unrealized) : "text-gray-400";
  return (
    <>
      <tr onClick={onToggle} className="cursor-pointer border-b border-white/5 hover:bg-white/5">
        <td className="py-2">
          <Link href={`/stock/${p.symbol}`} onClick={(e) => e.stopPropagation()}>
            <span className="font-bold">{p.quote?.name ?? p.symbol}</span>
            <span className="ml-1 text-xs text-gray-400">{p.symbol}</span>
          </Link>
        </td>
        <td className="text-right">{p.shares.toLocaleString()}</td>
        <td className="text-right">{fmtPrice(p.avgCost)}</td>
        <td className="text-right">{p.quote ? fmtPrice(p.quote.price) : "—"}</td>
        <td className="text-right">{p.quote ? fmtMoney(p.quote.price * p.shares) : "—"}</td>
        <td className={`text-right ${c}`}>{unrealized !== null ? fmtSignedMoney(unrealized) : "無報價"}</td>
        <td className={`text-right ${c}`}>{pct !== null ? fmtSignedPct(pct) : "—"}</td>
      </tr>
      {expanded && (
        <tr><td colSpan={7}><TransactionList symbol={p.symbol} onChanged={onChanged} /></td></tr>
      )}
    </>
  );
}
