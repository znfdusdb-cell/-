/** 한국 시간(KST, UTC+9, 서머타임 없음) 전용 날짜 도우미. 서버·클라이언트 공용. */

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

function shifted(d: Date): Date {
  return new Date(d.getTime() + KST_OFFSET_MS);
}

/** "YYYY-MM-DD" (KST 기준 날짜) */
export function kstDate(d: Date = new Date()): string {
  return shifted(d).toISOString().slice(0, 10);
}

/** KST 기준 0시부터 지난 분(0~1439) */
export function kstMinutes(d: Date = new Date()): number {
  const s = shifted(d);
  return s.getUTCHours() * 60 + s.getUTCMinutes();
}

/** "HH:MM" → 분 */
export function hmToMinutes(hm: string): number {
  const [h, m] = hm.split(":").map((x) => parseInt(x, 10));
  return (h || 0) * 60 + (m || 0);
}

export function minutesToHm(min: number): string {
  const h = Math.floor(min / 60) % 24;
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** "YYYY-MM-DD" + n일 */
export function addDays(dateStr: string, n: number): string {
  const t = Date.parse(`${dateStr}T00:00:00Z`) + n * 86400000;
  return new Date(t).toISOString().slice(0, 10);
}

/** b - a (일 단위, 둘 다 "YYYY-MM-DD") */
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);
}

/** KST 요일 (0=일) */
export function kstWeekday(dateStr: string): number {
  return new Date(`${dateStr}T00:00:00Z`).getUTCDay();
}

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

/** "10월 7일 (화)" */
export function fmtDateKo(dateStr: string): string {
  const [, m, d] = dateStr.split("-").map((x) => parseInt(x, 10));
  return `${m}월 ${d}일 (${WEEKDAYS[kstWeekday(dateStr)]})`;
}

/** ISO → "오후 12:34" (KST) */
export function fmtTimeKo(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  const min = kstMinutes(d);
  const h = Math.floor(min / 60);
  const m = min % 60;
  const ampm = h < 12 ? "오전" : "오후";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${ampm} ${h12}:${String(m).padStart(2, "0")}`;
}

/** ISO → "10월 7일 (화) 오후 12:34" */
export function fmtDateTimeKo(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return `${fmtDateKo(kstDate(d))} ${fmtTimeKo(d)}`;
}

/** "11:00" → "오전 11시", "13:30" → "오후 1시 30분" */
export function fmtHmKo(hm: string): string {
  const min = hmToMinutes(hm);
  const h = Math.floor(min / 60);
  const m = min % 60;
  const ampm = h < 12 ? "오전" : "오후";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${ampm} ${h12}시` : `${ampm} ${h12}시 ${m}분`;
}
