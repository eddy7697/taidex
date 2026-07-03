import { describe, it, expect } from "vitest";
import { parseSectorIndices } from "@/lib/market-overview/sectors";

// 取自 https://openapi.twse.com.tw/v1/exchangeReport/MI_INDEX 實際回應(節錄)
// 注意:漲跌方向在「漲跌」欄(+/-),「漲跌百分比」下跌列可能已帶負號、上漲列不帶
const sample = [
  { 日期: "1150702", 指數: "發行量加權股價指數", 收盤指數: "46744.16", 漲跌: "-", 漲跌點數: "274.83", 漲跌百分比: "-0.58", 特殊處理註記: "" },
  { 日期: "1150702", 指數: "水泥窯製類指數", 收盤指數: "661.61", 漲跌: "+", 漲跌點數: "4.35", 漲跌百分比: "0.66", 特殊處理註記: "" },
  { 日期: "1150702", 指數: "塑膠化工類指數", 收盤指數: "1,077.75", 漲跌: "+", 漲跌點數: "51.59", 漲跌百分比: "5.03", 特殊處理註記: "" },
  { 日期: "1150702", 指數: "機電類指數", 收盤指數: "16609.12", 漲跌: "-", 漲跌點數: "137.69", 漲跌百分比: "-0.82", 特殊處理註記: "" },
  { 日期: "1150702", 指數: "水泥類報酬指數", 收盤指數: "999.99", 漲跌: "+", 漲跌點數: "1.00", 漲跌百分比: "0.10", 特殊處理註記: "" },
  { 日期: "1150702", 指數: "臺灣50指數", 收盤指數: "43302.61", 漲跌: "-", 漲跌點數: "466.56", 漲跌百分比: "-1.07", 特殊處理註記: "" },
];

describe("parseSectorIndices", () => {
  it("只取「⋯類指數」、排除報酬指數,依漲跌幅由高到低排序", () => {
    const s = parseSectorIndices(sample);
    expect(s).not.toBeNull();
    expect(s!.date).toBe("2026-07-02");
    expect(s!.sectors.map((x) => x.name)).toEqual(["塑膠化工", "水泥窯製", "機電"]);
    expect(s!.sectors[0]).toEqual({ name: "塑膠化工", close: 1077.75, changePct: 5.03 });
    expect(s!.sectors[2].changePct).toBe(-0.82);
  });
  it("漲跌方向以「漲跌」欄為準(負值取絕對值後套方向)", () => {
    const s = parseSectorIndices([
      { 日期: "1150702", 指數: "金融保險類指數", 收盤指數: "2000.00", 漲跌: "-", 漲跌點數: "10.00", 漲跌百分比: "0.50" },
    ]);
    expect(s!.sectors[0].changePct).toBe(-0.5);
  });
  it("非陣列或空資料回 null", () => {
    expect(parseSectorIndices(null)).toBeNull();
    expect(parseSectorIndices([])).toBeNull();
  });
});
