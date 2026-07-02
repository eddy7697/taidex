import { describe, it, expect } from "vitest";
import { parseMisResponse, fetchIntradayQuotes } from "@/lib/quotes/misSource";

const sample = {
  msgArray: [
    { c: "2330", n: "台積電", z: "1085.0", y: "1070.0", v: "21000", tlong: "1751330400000" },
  ],
};

describe("parseMisResponse", () => {
  it("把 MIS JSON 轉成 Quote", () => {
    const quotes = parseMisResponse(sample);
    expect(quotes[0]).toMatchObject({ symbol: "2330", name: "台積電", price: 1085 });
    expect(quotes[0].change).toBeCloseTo(15, 5);
    expect(quotes[0].changePct).toBeCloseTo(1.4, 1);
    expect(quotes[0].volume).toBe(21000);
  });
  it("成交價為 '-'(無成交)時退回昨收", () => {
    const q = parseMisResponse({ msgArray: [{ c: "2330", n: "台積電", z: "-", y: "1070.0", v: "0" }] });
    expect(q[0].price).toBe(1070);
    expect(q[0].change).toBe(0);
  });
});

describe("fetchIntradayQuotes", () => {
  it("以注入的 fetch 取得並解析報價", async () => {
    const fakeFetch = async () =>
      ({ ok: true, json: async () => sample }) as any;
    const quotes = await fetchIntradayQuotes(["2330"], fakeFetch as any);
    expect(quotes[0].symbol).toBe("2330");
  });
});
