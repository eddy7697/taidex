"use client";
import { FACTOR_KEYS, FACTOR_LABELS } from "@/lib/strategy/engine";
import type { Weights } from "@/lib/strategy/types";

export default function WeightPanel({
  weights, onChange,
}: { weights: Weights; onChange: (w: Weights) => void }) {
  return (
    <div className="space-y-2 rounded-lg bg-[var(--card)] p-4">
      {FACTOR_KEYS.map((k) => (
        <label key={k} className="flex items-center gap-3 text-sm">
          <span className="w-10 shrink-0 text-gray-300">{FACTOR_LABELS[k]}</span>
          <input
            type="range" min={0} max={100} step={5}
            value={Math.round(weights[k] * 100)}
            onChange={(e) => onChange({ ...weights, [k]: Number(e.target.value) / 100 })}
            className="flex-1 accent-[var(--up)]"
            aria-label={`${FACTOR_LABELS[k]}權重`}
          />
          <span className="w-8 shrink-0 text-right text-xs text-gray-400">{Math.round(weights[k] * 100)}</span>
        </label>
      ))}
      <p className="text-xs text-gray-500">權重看相對大小,計分時自動按比例正規化</p>
    </div>
  );
}
