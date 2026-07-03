// 把收盤序列 normalize 成 SVG polyline 的 points 字串(左舊右新)。
// <2 點回空字串(畫不成線);全平序列以 height/2 畫置中水平線。
export function sparklinePoints(closes: number[], width: number, height: number, pad = 2): string {
  if (closes.length < 2) return "";
  const min = Math.min(...closes);
  const max = Math.max(...closes);
  const span = max - min;
  const step = (width - pad * 2) / (closes.length - 1);
  const innerH = height - pad * 2;
  return closes
    .map((c, i) => {
      const x = round2(pad + i * step);
      const y = span === 0 ? height / 2 : round2(pad + (1 - (c - min) / span) * innerH);
      return `${x},${y}`;
    })
    .join(" ");
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
