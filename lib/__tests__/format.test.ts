import { describe, it, expect } from "vitest";
import { changeColorClass, fmtPrice, fmtSignedPct } from "@/lib/format";

describe("format", () => {
  it("漲用紅(up)、跌用綠(down)", () => {
    expect(changeColorClass(1)).toBe("text-up");
    expect(changeColorClass(-1)).toBe("text-down");
    expect(changeColorClass(0)).toBe("text-gray-400");
  });
  it("價格與帶號百分比", () => {
    expect(fmtPrice(1085)).toBe("1,085.00");
    expect(fmtSignedPct(1.4)).toBe("+1.40%");
    expect(fmtSignedPct(-1.86)).toBe("-1.86%");
  });
});
