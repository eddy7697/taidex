import { describe, it, expect, vi } from "vitest";
import { createFinMindClient } from "@/lib/finmind/client";
import { FinMindAuthError, FinMindLevelError, FinMindRateLimitError } from "@/lib/finmind/types";

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

function okBody(data: unknown[] = [{ x: 1 }]) {
  return { msg: "success", status: 200, data };
}

describe("createFinMindClient", () => {
  it("組出正確 URL:dataset/data_id/日期/token,且 strip Bearer 前綴", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(okBody()));
    const client = createFinMindClient({
      fetchImpl: fetchImpl as unknown as typeof fetch,
      token: "Bearer  eyJabc",
      sleep: async () => {},
      now: () => 0,
    });
    await client.fetchDataset({ dataset: "TaiwanStockPrice", data_id: "2330", start_date: "2021-07-01", end_date: "2026-07-08" });
    const url = String((fetchImpl.mock.calls as unknown[][])[0][0]);
    expect(url).toContain("dataset=TaiwanStockPrice");
    expect(url).toContain("data_id=2330");
    expect(url).toContain("token=eyJabc");
    expect(url).not.toContain("Bearer");
  });

  it("成功回 data 陣列;data 非陣列回 []", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(okBody([{ a: 1 }, { a: 2 }])))
      .mockResolvedValueOnce(jsonResponse({ msg: "success", status: 200, data: null }));
    const client = createFinMindClient({ fetchImpl: fetchImpl as unknown as typeof fetch, sleep: async () => {}, now: () => 0 });
    expect(await client.fetchDataset({ dataset: "d" })).toHaveLength(2);
    expect(await client.fetchDataset({ dataset: "d" })).toEqual([]);
  });

  it("節流:兩次呼叫間 sleep 至少 minInterval(600/hr → 6000ms)", async () => {
    const sleeps: number[] = [];
    let t = 0;
    const fetchImpl = vi.fn(async () => jsonResponse(okBody()));
    const client = createFinMindClient({
      fetchImpl: fetchImpl as unknown as typeof fetch,
      sleep: async (ms) => { sleeps.push(ms); },
      now: () => t, // 時間凍結:第二次呼叫時 now 未前進,應 sleep 整個間隔
    });
    await client.fetchDataset({ dataset: "d" });
    await client.fetchDataset({ dataset: "d" });
    expect(sleeps.some((ms) => ms >= 6000)).toBe(true);
  });

  it("HTTP 402 限流:退避重試 3 次後拋 FinMindRateLimitError", async () => {
    const sleeps: number[] = [];
    const fetchImpl = vi.fn(async () => jsonResponse({ msg: "limit" }, 402));
    const client = createFinMindClient({
      fetchImpl: fetchImpl as unknown as typeof fetch,
      sleep: async (ms) => { sleeps.push(ms); },
      now: () => 0,
    });
    await expect(client.fetchDataset({ dataset: "d" })).rejects.toBeInstanceOf(FinMindRateLimitError);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(sleeps.filter((ms) => ms === 60_000)).toHaveLength(2);
  });

  it("Token is illegal → FinMindAuthError(訊息含 Bearer 提示)", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ msg: "Token is illegal.", status: 400 }, 400));
    const client = createFinMindClient({ fetchImpl: fetchImpl as unknown as typeof fetch, sleep: async () => {}, now: () => 0 });
    await expect(client.fetchDataset({ dataset: "d" })).rejects.toBeInstanceOf(FinMindAuthError);
    await expect(client.fetchDataset({ dataset: "d" })).rejects.toThrow(/Bearer/);
  });

  it("Your level is register → FinMindLevelError", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ msg: "Your level is register. Please update your user level.", status: 400 }, 400));
    const client = createFinMindClient({ fetchImpl: fetchImpl as unknown as typeof fetch, sleep: async () => {}, now: () => 0 });
    await expect(client.fetchDataset({ dataset: "d" })).rejects.toBeInstanceOf(FinMindLevelError);
  });

  it("其他非 200 → 一般 Error(不重試)", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ msg: "boom", status: 500 }, 500));
    const client = createFinMindClient({ fetchImpl: fetchImpl as unknown as typeof fetch, sleep: async () => {}, now: () => 0 });
    await expect(client.fetchDataset({ dataset: "d" })).rejects.toThrow(/boom|500/);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
