import { describe, it, expect } from "vitest";
import { parseTwseDaily } from "@/lib/ingest/twseOpenApi";

const sample = [
  {
    Code: "2330", Name: "台積電",
    OpeningPrice: "1080.00", HighestPrice: "1090.00",
    LowestPrice: "1075.00", ClosingPrice: "1085.00", TradeVolume: "21000000",
  },
  { Code: "", Name: "", ClosingPrice: "-", TradeVolume: "-" }, // 應被略過
];

describe("parseTwseDaily", () => {
  it("解析有效列,略過無效列", () => {
    const rows = parseTwseDaily(sample);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ symbol: "2330", name: "台積電", close: 1085, open: 1080 });
    expect(rows[0].volume).toBe(21000000);
  });
});
