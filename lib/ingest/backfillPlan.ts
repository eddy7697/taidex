// 斷點續跑:該檔 DB 內最早日線已進入目標起日的容忍窗 → 視為回填過,跳過。
// 上市未滿 N 年的股票最早日=掛牌日;掛牌日晚於容忍窗者會重抓,靠 skipDuplicates 冪等。
export function shouldSkipSymbol(
  earliest: Date | null,
  targetStart: Date,
  toleranceDays = 30
): boolean {
  if (!earliest) return false;
  return earliest.getTime() <= targetStart.getTime() + toleranceDays * 86_400_000;
}

export function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}
