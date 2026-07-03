import { describe, it, expect } from "vitest";
import { sparklinePoints } from "@/lib/sparkline";

describe("sparklinePoints", () => {
  it("少於 2 點回空字串", () => {
    expect(sparklinePoints([], 64, 24)).toBe("");
    expect(sparklinePoints([100], 64, 24)).toBe("");
  });

  it("遞增序列:第一點在左下、最後一點在右上(pad=2)", () => {
    const pts = sparklinePoints([1, 3], 64, 24, 2);
    expect(pts).toBe("2,22 62,2");
  });

  it("全平序列畫置中水平線", () => {
    const pts = sparklinePoints([10, 10, 10], 60, 24, 2);
    expect(pts.split(" ").every((p) => p.endsWith(",12"))).toBe(true);
  });

  it("點數與輸入相同、x 均分", () => {
    const pts = sparklinePoints([1, 2, 1, 4, 3], 102, 24, 1);
    const xs = pts.split(" ").map((p) => Number(p.split(",")[0]));
    expect(xs).toEqual([1, 26, 51, 76, 101]);
  });
});
