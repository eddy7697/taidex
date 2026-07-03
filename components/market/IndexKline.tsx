"use client";
import { useEffect, useRef, useState } from "react";
import { createChart, CandlestickSeries } from "lightweight-charts";
import type { IndexBar, MarketIndexKey } from "@/lib/market-overview/indexHistory";

const INDEXES: { key: MarketIndexKey; label: string }[] = [
  { key: "twse", label: "加權指數" },
  { key: "tpex", label: "櫃買指數" },
];
const RANGES = [
  { months: 1, label: "近1月" },
  { months: 3, label: "近3月" },
  { months: 6, label: "近6月" },
];

export default function IndexKline() {
  const ref = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState<MarketIndexKey>("twse");
  const [months, setMonths] = useState(3);
  const [empty, setEmpty] = useState(false);

  useEffect(() => {
    if (!ref.current) return;
    const chart = createChart(ref.current, {
      height: 280,
      layout: { background: { color: "transparent" }, textColor: "#9aa4b2" },
      grid: { horzLines: { color: "#ffffff10" }, vertLines: { color: "#ffffff10" } },
    });
    const series = chart.addSeries(CandlestickSeries, {
      upColor: "#d92d20", downColor: "#12b76a",      // 紅漲綠跌
      borderUpColor: "#d92d20", borderDownColor: "#12b76a",
      wickUpColor: "#d92d20", wickDownColor: "#12b76a",
    });
    let alive = true;
    fetch(`/api/market/history?index=${index}&months=${months}`)
      .then((r) => r.json())
      .then((json) => {
        if (!alive) return;
        const bars = (json.data ?? []) as IndexBar[];
        setEmpty(bars.length === 0);
        series.setData(bars);
        chart.timeScale().fitContent();
      });
    const onResize = () => chart.applyOptions({ width: ref.current?.clientWidth });
    onResize();
    window.addEventListener("resize", onResize);
    return () => { alive = false; window.removeEventListener("resize", onResize); chart.remove(); };
  }, [index, months]);

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <div className="flex gap-2">
          {INDEXES.map((i) => (
            <button key={i.key} onClick={() => setIndex(i.key)}
              className={`rounded px-3 py-1 text-sm ${index === i.key ? "bg-white/10 font-bold" : "text-gray-400"}`}>
              {i.label}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          {RANGES.map((r) => (
            <button key={r.months} onClick={() => setMonths(r.months)}
              className={`rounded px-2 py-1 text-xs ${months === r.months ? "bg-white/10 font-bold" : "text-gray-400"}`}>
              {r.label}
            </button>
          ))}
        </div>
      </div>
      {empty && <p className="text-sm text-gray-500">暫無資料</p>}
      <div ref={ref} className={empty ? "hidden" : ""} />
    </div>
  );
}
