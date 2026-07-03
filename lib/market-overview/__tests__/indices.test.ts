import { describe, it, expect, vi } from "vitest";
import { getIndexQuotes } from "@/lib/market-overview/indices";

// 取自 MIS ex_ch=tse_t00.tw|otc_o00.tw 實際回應(節錄)
const misIndexResponse = {
  msgArray: [
    { c: "t00", n: "發行量加權股價指數", z: "46438.62", y: "46744.16", tlong: "1783047935000", ex: "tse" },
    { c: "o00", n: "櫃買指數", z: "442.48", y: "439.51", tlong: "1783047940000", ex: "otc" },
  ],
  rtcode: "0000",
};

describe("getIndexQuotes", () => {
  it("以 tse_t00|otc_o00 查 MIS,改用白話名稱", async () => {
    const fetchImpl = vi.fn(async (url: string) => ({
      ok: true,
      json: async () => misIndexResponse,
    })) as unknown as typeof fetch;
    const out = await getIndexQuotes(fetchImpl);
    const url = (fetchImpl as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(decodeURIComponent(url)).toContain("tse_t00.tw|otc_o00.tw");
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ symbol: "t00", name: "加權指數", price: 46438.62 });
    expect(out[0].change).toBeCloseTo(46438.62 - 46744.16, 5);
    expect(out[1]).toMatchObject({ symbol: "o00", name: "櫃買指數" });
  });
});
