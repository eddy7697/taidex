"use client";
import { CONDITION_DEFS } from "@/lib/screener/engine";
import type { NumericField } from "@/lib/screener/types";

export default function ConditionPanel({
  enabled, values, onToggle, onValue,
}: {
  enabled: Record<string, boolean>;
  values: Record<string, number>;
  onToggle: (field: NumericField, on: boolean) => void;
  onValue: (field: NumericField, value: number) => void;
}) {
  return (
    <div className="space-y-2 rounded-lg bg-[var(--card)] p-4">
      {CONDITION_DEFS.map((d) => (
        <label key={d.field} className="flex items-center gap-3 text-sm">
          <input
            type="checkbox"
            checked={!!enabled[d.field]}
            onChange={(e) => onToggle(d.field, e.target.checked)}
            className="accent-[var(--up)]"
          />
          <span className={`w-28 ${enabled[d.field] ? "text-gray-200" : "text-gray-500"}`}>{d.label}</span>
          <input
            type="number"
            inputMode="decimal"
            value={values[d.field]}
            disabled={!enabled[d.field]}
            onChange={(e) => onValue(d.field, Number(e.target.value))}
            className="w-24 rounded bg-black/30 px-2 py-1 text-right disabled:opacity-40"
          />
          <span className="text-gray-500">{d.unit}</span>
        </label>
      ))}
    </div>
  );
}
