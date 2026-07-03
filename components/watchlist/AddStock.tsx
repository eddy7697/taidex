"use client";
import { useEffect, useRef, useState } from "react";

export default function AddStock({ onAdded }: { onAdded: () => void }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<{ symbol: string; name: string }[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seq = useRef(0); // 丟棄過期回應,避免慢的舊查詢蓋掉新結果

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  function search(v: string) {
    setQ(v);
    if (timer.current) clearTimeout(timer.current);
    if (!v.trim()) { setResults([]); return; }
    timer.current = setTimeout(async () => {
      const mySeq = ++seq.current;
      const res = await fetch(`/api/stocks/search?q=${encodeURIComponent(v)}`);
      const json = await res.json();
      if (mySeq === seq.current) setResults(json.results ?? []);
    }, 300);
  }
  async function add(symbol: string) {
    await fetch("/api/watchlist", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ symbol }),
    });
    setQ(""); setResults([]); onAdded();
  }
  return (
    <div className="relative mb-4">
      <input value={q} onChange={(e) => search(e.target.value)}
        placeholder="搜尋股票代號或名稱(如 2330 / 台積電)"
        className="w-full rounded bg-[var(--card)] px-4 py-2 outline-none" />
      {results.length > 0 && (
        <ul className="absolute z-20 mt-1 w-full rounded bg-[var(--card)] shadow-lg">
          {results.map((r) => (
            <li key={r.symbol}>
              <button onClick={() => add(r.symbol)} className="flex w-full justify-between px-4 py-2 hover:bg-white/5">
                <span>{r.name}</span><span className="text-gray-400">{r.symbol}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
