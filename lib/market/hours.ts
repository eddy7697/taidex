export function taipeiParts(now: Date): { weekday: number; minutes: number } {
  // 用 Intl 取台北當地時間,避免伺服器時區影響
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Taipei",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(now);
  const map: Record<string, string> = {};
  for (const p of parts) map[p.type] = p.value;
  const weekdayIndex: Record<string, number> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  };
  const weekday = weekdayIndex[map.weekday] ?? 0;
  const hour = parseInt(map.hour, 10) % 24;
  const minute = parseInt(map.minute, 10);
  return { weekday, minutes: hour * 60 + minute };
}

export function isMarketOpen(now: Date): boolean {
  const { weekday, minutes } = taipeiParts(now);
  if (weekday === 0 || weekday === 6) return false; // 週末
  const open = 9 * 60;        // 09:00
  const close = 13 * 60 + 30; // 13:30
  return minutes >= open && minutes <= close;
}
