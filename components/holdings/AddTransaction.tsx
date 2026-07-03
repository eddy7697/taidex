"use client";
import { useState } from "react";
import { estimateFee, estimateTax } from "@/lib/holdings/fees";

type Side = "BUY" | "SELL";

export default function AddTransaction({ onAdded }: { onAdded: () => void }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<{ symbol: string; name: string }[]>([]);
  const [picked, setPicked] = useState<{ symbol: string; name: string } | null>(null);
  const [side, setSide] = useState<Side>("BUY");
  const [quantity, setQuantity] = useState("1000");
  const [price, setPrice] = useState("");
  const [fee, setFee] = useState("");
  const [tax, setTax] = useState("");
  const [feeTouched, setFeeTouched] = useState(false);
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function search(v: string) {
    setQ(v); setPicked(null);
    if (!v.trim()) { setResults([]); return; }
    const res = await fetch(`/api/stocks/search?q=${encodeURIComponent(v)}`);
    const json = await res.json();
    setResults(json.results ?? []);
  }

  // 使用者沒手動改過費用欄時,隨股數/價格/方向自動重估
  function refreshEstimates(nextSide: Side, nextQty: string, nextPrice: string) {
    if (feeTouched) return;
    const qty = parseInt(nextQty, 10);
    const p = parseFloat(nextPrice);
    if (!Number.isFinite(qty) || qty <= 0 || !Number.isFinite(p) || p <= 0) { setFee(""); setTax(""); return; }
    setFee(String(estimateFee(p, qty)));
    setTax(nextSide === "SELL" ? String(estimateTax(p, qty)) : "0");
  }

  async function submit() {
    setError("");
    if (!picked) { setError("請先選擇股票"); return; }
    const qty = parseInt(quantity, 10);
    const prc = parseFloat(price);
    if (!Number.isInteger(qty) || qty <= 0) { setError("股數需為正整數"); return; }
    if (!Number.isFinite(prc) || prc <= 0) { setError("價格需大於 0"); return; }
    setBusy(true);
    const res = await fetch("/api/holdings/transactions", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        symbol: picked.symbol, side, quantity: qty, price: prc, date,
        ...(fee !== "" ? { fee: parseInt(fee, 10) || 0 } : {}),
        ...(tax !== "" ? { tax: parseInt(tax, 10) || 0 } : {}),
      }),
    });
    setBusy(false);
    if (!res.ok) {
      const json = await res.json().catch(() => null);
      setError(json?.error ?? "新增失敗");
      return;
    }
    setPrice(""); setFee(""); setTax(""); setFeeTouched(false); setError("");
    setOpen(false); onAdded();
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)}
        className="mb-4 w-full rounded bg-[var(--card)] px-4 py-2 text-left text-gray-300">
        ＋ 記一筆買賣
      </button>
    );
  }

  return (
    <div className="mb-4 space-y-3 rounded-lg bg-[var(--card)] p-4">
      <div className="relative">
        <input value={picked ? `${picked.name} ${picked.symbol}` : q}
          onChange={(e) => search(e.target.value)}
          placeholder="搜尋股票代號或名稱(如 2330 / 台積電)"
          className="w-full rounded bg-black/20 px-3 py-2 outline-none" />
        {!picked && results.length > 0 && (
          <ul className="absolute z-20 mt-1 w-full rounded bg-[var(--card)] shadow-lg">
            {results.map((r) => (
              <li key={r.symbol}>
                <button onClick={() => { setPicked(r); setResults([]); }}
                  className="flex w-full justify-between px-4 py-2 hover:bg-white/5">
                  <span>{r.name}</span><span className="text-gray-400">{r.symbol}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex gap-2">
        {(["BUY", "SELL"] as const).map((s) => (
          <button key={s}
            onClick={() => { setSide(s); refreshEstimates(s, quantity, price); }}
            className={`flex-1 rounded py-2 ${side === s
              ? `bg-white/10 font-bold ${s === "BUY" ? "text-up" : "text-down"}`
              : "bg-black/20 text-gray-400"}`}>
            {s === "BUY" ? "買進" : "賣出"}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <label className="text-sm text-gray-400">
          股數
          <div className="mt-1 flex gap-1">
            <input inputMode="numeric" value={quantity}
              onChange={(e) => { setQuantity(e.target.value); refreshEstimates(side, e.target.value, price); }}
              className="w-full rounded bg-black/20 px-3 py-2 text-white outline-none" />
            <button onClick={() => { setQuantity("1000"); refreshEstimates(side, "1000", price); }}
              className="whitespace-nowrap rounded bg-black/20 px-2 text-xs text-gray-400">1張</button>
          </div>
        </label>
        <label className="text-sm text-gray-400">
          每股價格
          <input inputMode="decimal" value={price}
            onChange={(e) => { setPrice(e.target.value); refreshEstimates(side, quantity, e.target.value); }}
            className="mt-1 w-full rounded bg-black/20 px-3 py-2 text-white outline-none" />
        </label>
        <label className="text-sm text-gray-400">
          日期
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
            className="mt-1 w-full rounded bg-black/20 px-3 py-2 text-white outline-none" />
        </label>
        <label className="text-sm text-gray-400">
          手續費{side === "SELL" ? "+稅" : ""}(自動估算,可改)
          <div className="mt-1 flex gap-1">
            <input inputMode="numeric" value={fee}
              onChange={(e) => { setFee(e.target.value); setFeeTouched(true); }}
              placeholder="手續費"
              className="w-full rounded bg-black/20 px-3 py-2 text-white outline-none" />
            {side === "SELL" && (
              <input inputMode="numeric" value={tax}
                onChange={(e) => { setTax(e.target.value); setFeeTouched(true); }}
                placeholder="證交稅"
                className="w-full rounded bg-black/20 px-3 py-2 text-white outline-none" />
            )}
          </div>
        </label>
      </div>

      {error && <p className="text-sm text-down">{error}</p>}

      <div className="flex gap-2">
        <button onClick={submit} disabled={busy}
          className="flex-1 rounded bg-white/10 py-2 font-bold disabled:opacity-50">
          {busy ? "送出中…" : "送出"}
        </button>
        <button onClick={() => { setOpen(false); setError(""); }}
          className="rounded bg-black/20 px-4 text-gray-400">取消</button>
      </div>
    </div>
  );
}
