"use client";
import type { ApiSummary } from "@/components/holdings/types";
import { changeColorClass, fmtMoney, fmtSignedMoney, fmtSignedPct } from "@/lib/format";

export default function SummaryBar({ summary }: { summary: ApiSummary }) {
  const c = changeColorClass(summary.unrealizedPnl);
  const showDiv = summary.dividendIncome > 0;
  return (
    <div className={`mb-4 grid grid-cols-2 gap-3 rounded-lg bg-[var(--card)] p-4 ${showDiv ? "md:grid-cols-5" : "md:grid-cols-4"}`}>
      <div>
        <div className="text-xs text-gray-400">總市值</div>
        <div className="text-lg font-bold">{fmtMoney(summary.marketValue)}</div>
      </div>
      <div>
        <div className="text-xs text-gray-400">未實現損益</div>
        <div className={`text-lg font-bold ${c}`}>
          {fmtSignedMoney(summary.unrealizedPnl)}
          <span className="ml-1 text-sm">({fmtSignedPct(summary.returnPct)})</span>
        </div>
      </div>
      <div>
        <div className="text-xs text-gray-400">總成本</div>
        <div className="text-lg font-bold">{fmtMoney(summary.totalCost)}</div>
      </div>
      <div>
        <div className="text-xs text-gray-400">已實現損益</div>
        <div className={`text-lg font-bold ${changeColorClass(summary.realizedPnl)}`}>
          {fmtSignedMoney(summary.realizedPnl)}
        </div>
      </div>
      {showDiv && (
        <div>
          <div className="text-xs text-gray-400">股利收入</div>
          <div className="text-lg font-bold text-amber-400">{fmtMoney(summary.dividendIncome)}</div>
        </div>
      )}
    </div>
  );
}
