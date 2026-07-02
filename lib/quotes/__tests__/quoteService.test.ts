import { describe, it, expect, vi } from "vitest";
import { getQuotes } from "@/lib/quotes/quoteService";
import type { Quote } from "@/lib/quotes/types";

const q = (symbol: string, src: string): Quote => ({
  symbol, name: src, price: 1, change: 0, changePct: 0, volume: 0, asOf: "x",
});

describe("getQuotes", () => {
  it("盤中優先用即時來源", async () => {
    const intraday = vi.fn(async () => [q("2330", "intraday")]);
    const db = vi.fn(async () => [q("2330", "db")]);
    const out = await getQuotes(["2330"], { isOpen: () => true, intraday, db });
    expect(out[0].name).toBe("intraday");
    expect(db).not.toHaveBeenCalled();
  });
  it("盤中即時來源失敗時回退 DB", async () => {
    const intraday = vi.fn(async () => { throw new Error("boom"); });
    const db = vi.fn(async () => [q("2330", "db")]);
    const out = await getQuotes(["2330"], { isOpen: () => true, intraday, db });
    expect(out[0].name).toBe("db");
    expect(db).toHaveBeenCalled();
  });
  it("盤後直接用 DB", async () => {
    const intraday = vi.fn(async () => [q("2330", "intraday")]);
    const db = vi.fn(async () => [q("2330", "db")]);
    const out = await getQuotes(["2330"], { isOpen: () => false, intraday, db });
    expect(out[0].name).toBe("db");
    expect(intraday).not.toHaveBeenCalled();
  });
  it("空 symbols 直接回空陣列,不呼叫任何來源", async () => {
    const intraday = vi.fn(async () => [q("2330", "intraday")]);
    const db = vi.fn(async () => [q("2330", "db")]);
    const out = await getQuotes([], { isOpen: () => true, intraday, db });
    expect(out).toEqual([]);
    expect(intraday).not.toHaveBeenCalled();
    expect(db).not.toHaveBeenCalled();
  });
  it("盤中即時來源回空陣列時回退 DB", async () => {
    const intraday = vi.fn(async () => []);
    const db = vi.fn(async () => [q("2330", "db")]);
    const out = await getQuotes(["2330"], { isOpen: () => true, intraday, db });
    expect(out[0].name).toBe("db");
    expect(db).toHaveBeenCalled();
  });
  it("部分即時來源缺漏時,缺漏的symbol由DB補齊", async () => {
    const intraday = vi.fn(async () => [q("2330", "intraday")]);
    const db = vi.fn(async (symbols: string[]) => symbols.map((s) => q(s, "db")));
    const out = await getQuotes(["2330", "2454"], { isOpen: () => true, intraday, db });
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ symbol: "2330", name: "intraday" });
    expect(out[1]).toMatchObject({ symbol: "2454", name: "db" });
    expect(db).toHaveBeenCalledWith(["2454"]);
  });
  it("合併結果依請求順序排列,不受來源回傳順序影響", async () => {
    const intraday = vi.fn(async () => [q("2454", "intraday")]);
    const db = vi.fn(async (symbols: string[]) => symbols.map((s) => q(s, "db")));
    const out = await getQuotes(["2330", "2454"], { isOpen: () => true, intraday, db });
    expect(out.map((o) => o.symbol)).toEqual(["2330", "2454"]);
    expect(out[0].name).toBe("db");
    expect(out[1].name).toBe("intraday");
  });
});
