import { describe, it, expect } from "vitest";
import { parseBwibbu } from "@/lib/screener/bwibbu";

const sample = [
  { Date: "1150702", Code: "1101", Name: "台泥", PEratio: "", DividendYield: "3.46", PBratio: "0.74" },
  { Date: "1150702", Code: "2330", Name: "台積電", PEratio: "25.51", DividendYield: "1.55", PBratio: "7.53" },
  { Date: "1150702", Code: "", Name: "", PEratio: "-", DividendYield: "-", PBratio: "-" }, // 無代號應略過
];

describe("parseBwibbu", () => {
  it("解析估值列,空字串/'-' 轉 null,無代號略過", () => {
    const rows = parseBwibbu(sample);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({ symbol: "1101", peRatio: null, dividendYield: 3.46, pbRatio: 0.74 });
    expect(rows[1]).toEqual({ symbol: "2330", peRatio: 25.51, dividendYield: 1.55, pbRatio: 7.53 });
  });
  it("非陣列輸入回空陣列", () => {
    expect(parseBwibbu({ oops: true })).toEqual([]);
  });
});
