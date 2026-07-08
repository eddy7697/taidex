import { describe, it, expect } from "vitest";
import { parseTpexDaily } from "@/lib/ingest/tpexOpenApi";

const sample = [
  {
    Date: "1150708", SecuritiesCompanyCode: "5483", CompanyName: "中美晶",
    Close: "168.50", Change: "1.50", Open: "167.00", High: "169.00", Low: "166.50",
    Average: "167.80", TradingShares: "3,251,000", TransactionAmount: "545,618,000", TransactionNumber: "2,100",
  },
  { Date: "1150708", SecuritiesCompanyCode: "707771", CompanyName: "某權證", Close: "0.55", Open: "0.5", High: "0.6", Low: "0.5", TradingShares: "10,000" }, // 權證代號 → 排除
  { Date: "1150708", SecuritiesCompanyCode: "8069", CompanyName: "元太", Close: "---", Open: "---", High: "---", Low: "---", TradingShares: "0" }, // 無成交 → 排除
];

describe("parseTpexDaily", () => {
  it("解析上櫃列:代號過濾(4碼/00開頭)、千分位、民國日期轉 ISO", () => {
    const rows = parseTpexDaily(sample);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ symbol: "5483", name: "中美晶", close: 168.5, open: 167, high: 169, low: 166.5 });
    expect(rows[0].volume).toBe(3251000);
    expect(rows[0].date).toBe("2026-07-08");
  });
  it("非陣列輸入回 []", () => {
    expect(parseTpexDaily(null)).toEqual([]);
    expect(parseTpexDaily({})).toEqual([]);
  });
});
