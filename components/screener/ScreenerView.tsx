"use client";
import { useEffect, useMemo, useState } from "react";
import { applyConditions, sortRows, CONDITION_DEFS, PRESETS } from "@/lib/screener/engine";
import type { Condition, NumericField, ScreenerSnapshot } from "@/lib/screener/types";
import ConditionPanel from "@/components/screener/ConditionPanel";
import ResultList from "@/components/screener/ResultList";

const DEFAULT_PRESET = PRESETS[0];

function fromPreset(conditions: Condition[]) {
  const enabled: Record<string, boolean> = {};
  const values: Record<string, number> = {};
  for (const d of CONDITION_DEFS) {
    const c = conditions.find((x) => x.field === d.field);
    enabled[d.field] = !!c;
    values[d.field] = c?.value ?? d.defaultValue;
  }
  return { enabled, values };
}

export default function ScreenerView() {
  const [snapshot, setSnapshot] = useState<ScreenerSnapshot | null>(null);
  const [failed, setFailed] = useState(false);
  const [activeKey, setActiveKey] = useState<string>(DEFAULT_PRESET.key);
  const [enabled, setEnabled] = useState<Record<string, boolean>>(() => fromPreset(DEFAULT_PRESET.conditions).enabled);
  const [values, setValues] = useState<Record<string, number>>(() => fromPreset(DEFAULT_PRESET.conditions).values);
  const [sort, setSort] = useState(DEFAULT_PRESET.sort);
  const [panelOpen, setPanelOpen] = useState(false);

  useEffect(() => {
    fetch("/api/screener")
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then(setSnapshot)
      .catch(() => setFailed(true));
  }, []);

  const conditions: Condition[] = useMemo(
    () => CONDITION_DEFS.filter((d) => enabled[d.field]).map((d) => ({ field: d.field, op: d.op, value: values[d.field] })),
    [enabled, values],
  );
  const results = useMemo(() => {
    if (!snapshot) return [];
    return sortRows(applyConditions(snapshot.rows, conditions), sort.field, sort.dir);
  }, [snapshot, conditions, sort]);

  function applyPreset(key: string) {
    const p = PRESETS.find((x) => x.key === key)!;
    const next = fromPreset(p.conditions);
    setActiveKey(key);
    setEnabled(next.enabled);
    setValues(next.values);
    setSort(p.sort);
  }

  if (failed) return <p className="text-gray-400">暫無資料,稍後再試</p>;
  if (!snapshot) return <p className="text-gray-400">載入中⋯</p>;

  const chip = (active: boolean) =>
    `rounded-full px-3 py-1 text-sm ${active ? "bg-white/10 text-up font-bold" : "bg-[var(--card)] text-gray-300"}`;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <button key={p.key} onClick={() => applyPreset(p.key)} className={chip(activeKey === p.key)}>
              {p.label}
            </button>
          ))}
          <button onClick={() => { setActiveKey("custom"); setPanelOpen(true); }} className={chip(activeKey === "custom")}>
            自訂
          </button>
        </div>
        {snapshot.date && <span className="text-xs text-gray-500">{snapshot.date}</span>}
      </div>

      <button onClick={() => setPanelOpen((o) => !o)} className="text-sm text-gray-400">
        {panelOpen ? "▾ 收合條件" : "▸ 調整條件"}
      </button>
      {panelOpen && (
        <ConditionPanel
          enabled={enabled}
          values={values}
          onToggle={(f: NumericField, on: boolean) => { setEnabled((e) => ({ ...e, [f]: on })); setActiveKey("custom"); }}
          onValue={(f: NumericField, v: number) => { setValues((s) => ({ ...s, [f]: v })); setActiveKey("custom"); }}
        />
      )}

      <ResultList rows={results} sort={sort} onSort={setSort} />
    </div>
  );
}
