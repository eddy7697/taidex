import { describe, it, expect } from "vitest";
import { parseStockDay } from "@/lib/ingest/twseStockDay";

const ok = {
  stat: "OK",
  data: [
    ["115/06/02", "21,282,758", "20,948,377,347", "984.00", "990.00", "980.00", "988.00", "+4.00", "23,417"],
    ["115/06/03", "18,000,000", "17,800,000,000", "--", "--", "--", "--", " ", "0"],
    ["115/06/04", "30,111,222", "29,000,000,000", "990.00", "1,005.00", "989.00", "1,000.00", "+12.00", "30,000"],
  ],
};

describe("parseStockDay", () => {
  it("民國日期轉 ISO、千分位轉數字、volume 為股數", () => {
    const rows = parseStockDay(ok);
    expect(rows[0]).toEqual({
      date: "2026-06-02", open: 984, high: 990, low: 980, close: 988, volume: 21_282_758,
    });
    expect(rows[1].close).toBe(1000); // "--" 列被跳過,下一筆補位
    expect(rows).toHaveLength(2);
  });

  it("千分位價格正確解析", () => {
    expect(parseStockDay(ok)[1].high).toBe(1005);
  });

  it("stat 非 OK 或格式不對回空陣列", () => {
    expect(parseStockDay({ stat: "很抱歉,沒有符合條件的資料!" })).toEqual([]);
    expect(parseStockDay(null)).toEqual([]);
    expect(parseStockDay({ stat: "OK" })).toEqual([]);
  });
});
