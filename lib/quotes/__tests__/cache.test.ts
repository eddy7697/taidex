import { describe, it, expect, vi } from "vitest";
import { memoize } from "@/lib/quotes/cache";

describe("memoize", () => {
  it("TTL 內回傳快取值,不重複呼叫", async () => {
    let calls = 0;
    const now = { t: 0 };
    const cached = memoize(async (k: string) => { calls++; return `v:${k}`; }, 1000, () => now.t);
    expect(await cached("a")).toBe("v:a");
    expect(await cached("a")).toBe("v:a");
    expect(calls).toBe(1);
    now.t = 2000; // 超過 TTL
    expect(await cached("a")).toBe("v:a");
    expect(calls).toBe(2);
  });
});
