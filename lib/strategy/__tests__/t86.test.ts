import { describe, it, expect } from "vitest";
import { parseT86 } from "@/lib/strategy/t86";

const doc = {
  stat: "OK",
  date: "20260702",
  fields: ["證券代號", "證券名稱", "外陸資買進股數(不含外資自營商)", "三大法人買賣超股數"],
  data: [
    ["2330", "台積電          ", "52,683,779", "12,345,678"],
    ["1101", "台泥", "100", "-2,000"],
    ["9999", "壞列", "1", "-"],
  ],
};

describe("parseT86", () => {
  it("以「三大法人買賣超股數」欄名取值,千分位與負數可解,代號 trim", () => {
    expect(parseT86(doc)).toEqual([
      { symbol: "2330", totalNetShares: 12_345_678 },
      { symbol: "1101", totalNetShares: -2000 },
    ]);
  });
  it("找不到欄名時退回最後一欄", () => {
    const noFields = { ...doc, fields: ["證券代號", "證券名稱", "甲", "乙"] };
    expect(parseT86(noFields)[0].totalNetShares).toBe(12_345_678);
  });
  it("stat 非 OK → throw", () => {
    expect(() => parseT86({ stat: "很抱歉,沒有符合條件的資料!" })).toThrow();
  });
});
