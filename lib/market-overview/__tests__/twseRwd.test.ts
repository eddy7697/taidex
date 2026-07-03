import { describe, it, expect } from "vitest";
import { parseBreadth, parseInstitutional } from "@/lib/market-overview/twseRwd";

// 取自 https://www.twse.com.tw/rwd/zh/afterTrading/MI_INDEX?response=json 實際回應(節錄)
const miIndexSample = {
  tables: [
    { title: "", fields: [], data: [] },
    {
      title: "115年07月02日 大盤統計資訊",
      fields: ["成交統計", "成交金額(元)", "成交股數(股)", "成交筆數"],
      data: [["1.一般股票", "1,003,604,616,579", "6,280,438,118", "4,517,512"]],
    },
    {
      title: "漲跌證券數合計",
      fields: ["類型", "整體市場", "股票"],
      data: [
        ["上漲(漲停)", "5,870(231)", "649(54)"],
        ["下跌(跌停)", "5,597(102)", "323(1)"],
        ["持平", "740", "75"],
        ["未成交", "15,583", "3"],
        ["無比價", "2,670", "28"],
      ],
    },
  ],
  type: "index",
  stat: "OK",
  date: "20260702",
};

// 取自 https://www.twse.com.tw/rwd/zh/fund/BFI82U?response=json 實際回應(節錄)
const bfi82uSample = {
  stat: "OK",
  date: "20260702",
  title: "115年07月02日 三大法人買賣金額統計表",
  fields: ["單位名稱", "買進金額", "賣出金額", "買賣差額"],
  data: [
    ["自營商(自行買賣)", "10,242,921,037", "9,142,697,889", "1,100,223,148"],
    ["自營商(避險)", "35,910,472,034", "41,338,937,264", "-5,428,465,230"],
    ["投信", "48,365,666,684", "38,410,029,034", "9,955,637,650"],
    ["外資及陸資(不含外資自營商)", "362,533,729,605", "451,580,243,282", "-89,046,513,677"],
    ["外資自營商", "0", "0", "0"],
    ["合計", "457,052,789,360", "540,471,907,469", "-83,419,118,109"],
  ],
};

describe("parseBreadth", () => {
  it("解析上市股票漲跌家數與漲跌停數,日期轉 ISO", () => {
    const b = parseBreadth(miIndexSample);
    expect(b).toEqual({
      date: "2026-07-02",
      up: 649, limitUp: 54,
      down: 323, limitDown: 1,
      unchanged: 75,
    });
  });
  it("缺漲跌表時回 null", () => {
    expect(parseBreadth({ tables: [], stat: "OK", date: "20260702" })).toBeNull();
    expect(parseBreadth(null)).toBeNull();
    expect(parseBreadth({})).toBeNull();
  });
});

describe("parseInstitutional", () => {
  it("彙總外資(含外資自營商)/投信/自營商(自行+避險)/合計", () => {
    const f = parseInstitutional(bfi82uSample);
    expect(f).toEqual({
      date: "2026-07-02",
      foreign: -89_046_513_677,
      trust: 9_955_637_650,
      dealer: 1_100_223_148 - 5_428_465_230,
      total: -83_419_118_109,
    });
  });
  it("stat 非 OK 或缺資料時回 null", () => {
    expect(parseInstitutional({ stat: "很抱歉,沒有符合條件的資料!" })).toBeNull();
    expect(parseInstitutional(null)).toBeNull();
  });
});
