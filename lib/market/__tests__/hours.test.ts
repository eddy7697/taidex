import { describe, it, expect } from "vitest";
import { isMarketOpen } from "@/lib/market/hours";

// 皆以 UTC 建構,對應台北 = UTC+8
describe("isMarketOpen", () => {
  it("週三 10:00(台北)為盤中", () => {
    // 2026-07-01 是週三;台北 10:00 = UTC 02:00
    expect(isMarketOpen(new Date("2026-07-01T02:00:00Z"))).toBe(true);
  });
  it("週三 08:59(台北)為盤前", () => {
    expect(isMarketOpen(new Date("2026-07-01T00:59:00Z"))).toBe(false);
  });
  it("週三 13:31(台北)為盤後", () => {
    expect(isMarketOpen(new Date("2026-07-01T05:31:00Z"))).toBe(false);
  });
  it("週六為休市", () => {
    // 2026-07-04 週六,台北 10:00
    expect(isMarketOpen(new Date("2026-07-04T02:00:00Z"))).toBe(false);
  });
});
