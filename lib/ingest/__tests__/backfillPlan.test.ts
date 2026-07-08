import { describe, it, expect } from "vitest";
import { shouldSkipSymbol, chunk } from "@/lib/ingest/backfillPlan";

const target = new Date("2021-07-01T00:00:00Z");

describe("shouldSkipSymbol", () => {
  it("DB 無資料 → 不跳過", () => {
    expect(shouldSkipSymbol(null, target)).toBe(false);
  });
  it("既有最早日早於目標起日 → 跳過(已回填過)", () => {
    expect(shouldSkipSymbol(new Date("2021-06-01T00:00:00Z"), target)).toBe(true);
  });
  it("既有最早日在目標起日 30 天容忍內 → 跳過(如上市未滿 5 年的股票)", () => {
    expect(shouldSkipSymbol(new Date("2021-07-20T00:00:00Z"), target)).toBe(true);
  });
  it("既有最早日太晚(只有每日 ingest 的淺歷史)→ 不跳過", () => {
    expect(shouldSkipSymbol(new Date("2026-07-01T00:00:00Z"), target)).toBe(false);
  });
});

describe("chunk", () => {
  it("分批與餘數", () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunk([], 2)).toEqual([]);
  });
});
