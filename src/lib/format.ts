export function fmtNum(n: number | null | undefined, digits = 0): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return n.toLocaleString("ko-KR", { maximumFractionDigits: digits, minimumFractionDigits: digits });
}

export function fmtWon(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  return `${fmtNum(n)}원`;
}

export function fmtPct(n: number | null | undefined, digits = 1, sign = true): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  const s = n > 0 && sign ? "+" : "";
  return `${s}${n.toFixed(digits)}%`;
}

export function pctChange(now: number | null, base: number | null): number | null {
  if (now === null || base === null || base === 0) return null;
  return ((now - base) / base) * 100;
}

/** 상승 빨강, 하락 파랑 (한국 증권앱 관례) */
export function udClass(n: number | null | undefined): string {
  if (n === null || n === undefined || n === 0) return "text-fg-2";
  return n > 0 ? "text-up" : "text-down";
}

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric" });
}

export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function todayKST(): string {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
}

export function daysBetween(fromISO: string, toISO: string): number {
  const a = new Date(fromISO.slice(0, 10) + "T00:00:00Z").getTime();
  const b = new Date(toISO.slice(0, 10) + "T00:00:00Z").getTime();
  return Math.floor((b - a) / 86400000);
}

/** 발자국 표기: 주수W 최대조정/최소조정 횟수T */
export function footprint(weeks: number | null, max: number | null, min: number | null, t: number | null): string {
  if (weeks === null || max === null || min === null || t === null) return "—";
  return `${weeks}W ${Math.round(max)}/${Math.round(min)} ${t}T`;
}
