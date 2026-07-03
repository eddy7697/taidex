import { describe, it, expect, vi } from "vitest";
import {
  parseTaiexHist,
  parseTpexInx,
  fetchIndexHistory,
} from "@/lib/market-overview/indexHistory";

// TWSE rwd/zh/TAIEX/MI_5MINS_HIST:民國日期、千分位
const taiexOk = {
  stat: "OK",
  fields: ["日期", "開盤指數", "最高指數", "最低指數", "收盤指數"],
  data: [
    ["115/06/01", "44,872.82", "45,931.10", "44,872.82", "45,337.91"],
    ["115/06/02", "45,388.93", "45,915.92", "44,869.38", "45,557.31"],
    ["115/06/03", "--", "--", "--", "--"],
  ],
};

// TPEX www/zh-tw/indexInfo/inx:西元日期、tables 包一層
const tpexOk = {
  date: "20260601",
  tables: [
    {
      title: "櫃買指數(月查詢)",
      fields: ["日期", "開市", "最高", "最低", "收市", "漲/跌"],
      data: [
        ["2026/06/01", "443.97", "451.09", "443.97", "446.02", "2.38"],
        ["2026/06/02", "446.83", "449.47", "433.71", "440.64", "-5.38"],
      ],
    },
  ],
};

describe("parseTaiexHist", () => {
  it("民國日期轉 ISO、千分位轉數字", () => {
    const bars = parseTaiexHist(taiexOk);
    expect(bars[0]).toEqual({
      time: "2026-06-01", open: 44872.82, high: 45931.10, low: 44872.82, close: 45337.91,
    });
    expect(bars).toHaveLength(2); // "--" 列跳過
  });

  it("stat 非 OK 或格式不對回空陣列", () => {
    expect(parseTaiexHist({ stat: "很抱歉,沒有符合條件的資料!" })).toEqual([]);
    expect(parseTaiexHist(null)).toEqual([]);
    expect(parseTaiexHist({ stat: "OK" })).toEqual([]);
  });
});

describe("parseTpexInx", () => {
  it("西元斜線日期轉 ISO,取櫃買指數表", () => {
    const bars = parseTpexInx(tpexOk);
    expect(bars[0]).toEqual({
      time: "2026-06-01", open: 443.97, high: 451.09, low: 443.97, close: 446.02,
    });
    expect(bars).toHaveLength(2);
  });

  it("缺 tables 或找不到櫃買指數表回空陣列", () => {
    expect(parseTpexInx(null)).toEqual([]);
    expect(parseTpexInx({})).toEqual([]);
    expect(parseTpexInx({ tables: [{ title: "別的表", data: [] }] })).toEqual([]);
  });
});

describe("fetchIndexHistory", () => {
  const now = new Date("2026-07-03T04:00:00Z"); // 台北 2026-07-03 12:00

  it("twse:按月組 URL(YYYYMM01)、合併排序", async () => {
    const fetchImpl = vi.fn(async (url: unknown) => {
      const u = String(url);
      const month = u.includes("date=202606") ? taiexOk : {
        stat: "OK",
        data: [["115/07/02", "45,700.00", "45,900.00", "45,600.00", "45,800.00"]],
      };
      return { ok: true, json: async () => month } as unknown as Response;
    });
    const bars = await fetchIndexHistory("twse", 2, fetchImpl as unknown as typeof fetch, now);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const urls = fetchImpl.mock.calls.map((c) => String(c[0]));
    expect(urls[0]).toContain("TAIEX/MI_5MINS_HIST");
    expect(urls[0]).toContain("date=20260601");
    expect(urls[1]).toContain("date=20260701");
    expect(bars.map((b) => b.time)).toEqual(["2026-06-01", "2026-06-02", "2026-07-02"]);
  });

  it("tpex:URL 用民國年月(115/06)", async () => {
    const fetchImpl = vi.fn(async (_url: unknown) => ({ ok: true, json: async () => tpexOk }) as unknown as Response);
    await fetchIndexHistory("tpex", 1, fetchImpl as unknown as typeof fetch, now);
    expect(String(fetchImpl.mock.calls[0][0])).toContain("indexInfo/inx?date=115/07");
  });

  it("跨年月份枚舉正確", async () => {
    const jan = new Date("2026-01-15T04:00:00Z");
    const fetchImpl = vi.fn(async (_url: unknown) => ({ ok: true, json: async () => ({ stat: "OK", data: [] }) }) as unknown as Response);
    await fetchIndexHistory("twse", 3, fetchImpl as unknown as typeof fetch, jan);
    const urls = fetchImpl.mock.calls.map((c) => String(c[0]));
    expect(urls[0]).toContain("date=20251101");
    expect(urls[1]).toContain("date=20251201");
    expect(urls[2]).toContain("date=20260101");
  });

  it("單月上游失敗即拋錯(由 route 層容錯)", async () => {
    const fetchImpl = vi.fn(async () => ({ ok: false, status: 500 }) as unknown as Response);
    await expect(fetchIndexHistory("twse", 1, fetchImpl as unknown as typeof fetch, now)).rejects.toThrow();
  });

  it("twse 限流回應(stat 非 OK)拋錯而非靜默缺月", async () => {
    const fetchImpl = vi.fn(async (url: unknown) => ({
      ok: true,
      json: async () => (String(url).includes("date=202606") ? { stat: "限流" } : taiexOk),
    }) as unknown as Response);
    await expect(fetchIndexHistory("twse", 2, fetchImpl as unknown as typeof fetch, now)).rejects.toThrow(/stat/);
  });

  it("tpex 回應缺 tables 拋錯而非靜默缺月", async () => {
    const fetchImpl = vi.fn(async (_url: unknown) => ({ ok: true, json: async () => ({}) }) as unknown as Response);
    await expect(fetchIndexHistory("tpex", 1, fetchImpl as unknown as typeof fetch, now)).rejects.toThrow(/tables/);
  });
});
