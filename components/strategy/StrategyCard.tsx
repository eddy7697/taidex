"use client";
import Link from "next/link";
import { changeColorClass, fmtPrice, fmtSignedPct } from "@/lib/format";
import { FACTOR_KEYS, FACTOR_LABELS } from "@/lib/strategy/engine";
import type { Recommendation } from "@/lib/strategy/types";

function FactorBars({ factors }: { factors: Recommendation["factors"] }) {
  return (
    <div className="flex gap-2">
      {FACTOR_KEYS.map((k) => {
        const v = factors[k];
        return (
          <div key={k} className="flex-1">
            <div className="h-1.5 overflow-hidden rounded bg-white/10">
              {v != null && <div className="h-full rounded bg-up" style={{ width: `${v}%` }} />}
            </div>
            <div className="mt-0.5 text-center text-[10px] text-gray-500">
              {FACTOR_LABELS[k]}{v == null ? "—" : ""}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function StrategyCard({
  rank, rec, watched, onAdd,
}: { rank: number; rec: Recommendation; watched: Set<string>; onAdd: (symbol: string) => void }) {
  const { row, score, factors, reasons } = rec;
  const c = changeColorClass(row.changePct ?? 0);
  const added = watched.has(row.symbol);
  return (
    <Link href={`/stock/${row.symbol}`} className="block rounded-lg bg-[var(--card)] p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="w-6 text-center text-sm font-bold text-gray-500">{rank}</span>
          <div>
            <div className="font-bold">{row.name}</div>
            <div className="text-xs text-gray-400">{row.symbol}・{row.volumeLots.toLocaleString()} 張</div>
          </div>
        </div>
        <div className="text-right">
          <div className={`font-bold ${c}`}>{fmtPrice(row.close)}</div>
          <div className={`text-sm ${c}`}>{row.changePct == null ? "—" : fmtSignedPct(row.changePct)}</div>
        </div>
        <div className="ml-3 text-right">
          <div className="text-lg font-bold text-up">{Math.round(score)}</div>
          <div className="text-[10px] text-gray-500">綜合分</div>
        </div>
      </div>
      <div className="mt-3"><FactorBars factors={factors} /></div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {reasons.map((r) => (
          <span key={r} className="rounded bg-white/5 px-2 py-0.5 text-xs text-gray-300">{r}</span>
        ))}
        <button
          disabled={added}
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); onAdd(row.symbol); }}
          className={`ml-auto rounded px-2 py-1 text-xs ${added ? "text-gray-500" : "bg-white/5 text-gray-300"}`}
          aria-label={added ? "已在自選" : "加入自選"}
        >
          {added ? "✓ 已加" : "＋自選"}
        </button>
      </div>
    </Link>
  );
}
