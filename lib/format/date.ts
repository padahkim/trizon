/** "9/28" (서버 시간대 기준). 날짜가 아니면 "" */
export function formatMonthDay(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : `${d.getMonth() + 1}/${d.getDate()}`;
}
