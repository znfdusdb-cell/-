import type { Challenge, ChallengeConfig, Checkin, CountConfig, Participation, SlotDef, SlotsConfig } from "./types";
import { addDays, daysBetween, hmToMinutes, kstDate, kstMinutes, kstWeekday } from "./time";

/* ───────── 경험치 · 레벨 ───────── */

export const XP = {
  /** 시간대형 사진 1장 */
  photo: 10,
  /** 시간대형 하루 전부 완료 */
  dayComplete: 20,
  /** 시간대형 연속일 보너스 (× min(streak, 10)) */
  dayStreakPer: 5,
  /** 횟수형 인증 1회 (횟수 안에서만) */
  count: 60,
  /** 횟수형 기간 목표 달성 */
  periodComplete: 40,
  /** 횟수형 연속 기간 보너스 (× min(streak, 5)) */
  periodStreakPer: 20,
};

/** 레벨 n 에 도달하는 데 필요한 누적 경험치. L1=0, L2=100, L3=300, L4=600, L5=1000, L6=1500 … */
export function xpForLevel(n: number): number {
  return 50 * (n - 1) * n;
}

export const MAX_LEVEL = 20;

export function levelFromXp(xp: number): number {
  let lv = 1;
  while (lv < MAX_LEVEL && xp >= xpForLevel(lv + 1)) lv++;
  return lv;
}

export function levelProgress(xp: number): { level: number; current: number; needed: number; ratio: number } {
  const level = levelFromXp(xp);
  if (level >= MAX_LEVEL) return { level, current: 0, needed: 0, ratio: 1 };
  const base = xpForLevel(level);
  const next = xpForLevel(level + 1);
  return { level, current: xp - base, needed: next - base, ratio: Math.min(1, (xp - base) / (next - base)) };
}

/** 챌린지 개설이 열리는 레벨 */
export const CREATE_CHALLENGE_LEVEL = 6;

export const LEVEL_PERKS: { level: number; title: string; look: string }[] = [
  { level: 1, title: "새내기 거너", look: "흰 티셔츠" },
  { level: 2, title: "레드 루키", look: "빨간 셔츠" },
  { level: 3, title: "홈 유니폼", look: "흰 소매 홈 킷 + 대포 엠블럼" },
  { level: 4, title: "노스뱅크 서포터", look: "빨강·흰색 머플러" },
  { level: 5, title: "주장", look: "주장 완장 + 금색 축구화" },
  { level: 6, title: "거너사우르스 친구", look: "거너사우르스 등장 · 챌린지 개설 가능" },
  { level: 7, title: "트로피 헌터", look: "트로피" },
  { level: 8, title: "인빈시블", look: "황금 오라" },
  { level: 9, title: "레전드", look: "왕관" },
  { level: 10, title: "에미레이츠의 전설", look: "불꽃 효과" },
];

export function levelTitle(level: number): string {
  const p = [...LEVEL_PERKS].reverse().find((x) => x.level <= level);
  return p?.title ?? "새내기 거너";
}

/* ───────── 시간대형(다이어트) 엔진 ───────── */

export type SlotState = "done" | "open" | "upcoming" | "missed";

export type SlotStatus = {
  slot: SlotDef;
  state: SlotState;
  checkin: Checkin | null;
};

export type DayStatus = {
  date: string;
  slots: SlotStatus[];
  complete: boolean;
  failed: boolean;
  /** 아직 열리지 않았거나 진행 중인 슬롯이 남아 있음 */
  pending: boolean;
};

/**
 * 집계 시작일은 항상 월요일 (관리자가 start_date 를 지정하면 그 날).
 * 월요일에 참여했고(시간대형이면 첫 슬롯 시작 전) 그날부터, 아니면 다음 월요일부터.
 */
export function effectiveStartDate(p: Participation, cfg: ChallengeConfig): string {
  if (p.start_date) return p.start_date;
  const joined = new Date(p.joined_at);
  const d = kstDate(joined);
  const isMonday = kstWeekday(d) === 1;
  if (isMonday) {
    if (cfg.kind !== "slots") return d;
    const first = Math.min(...cfg.slots.map((s) => hmToMinutes(s.start)));
    if (kstMinutes(joined) <= first) return d;
  }
  // 다음 월요일
  const wd = kstWeekday(d); // 0=일
  const until = wd === 0 ? 1 : 8 - wd;
  return addDays(d, until);
}

export function dayStatus(cfg: SlotsConfig, checkins: Checkin[], date: string, now: Date = new Date()): DayStatus {
  const today = kstDate(now);
  const nowMin = kstMinutes(now);
  const slots: SlotStatus[] = cfg.slots.map((slot) => {
    const checkin = checkins.find((c) => c.local_date === date && c.slot === slot.key) ?? null;
    let state: SlotState;
    if (checkin) state = "done";
    else if (date < today) state = "missed";
    else if (date > today) state = "upcoming";
    else if (nowMin < hmToMinutes(slot.start)) state = "upcoming";
    else if (nowMin < hmToMinutes(slot.end)) state = "open";
    else state = "missed";
    return { slot, state, checkin };
  });
  return {
    date,
    slots,
    complete: slots.every((s) => s.state === "done"),
    failed: slots.some((s) => s.state === "missed"),
    pending: slots.some((s) => s.state === "open" || s.state === "upcoming"),
  };
}

export type SlotsSummary = {
  kind: "slots";
  today: DayStatus;
  streak: number;
  failDays: number;
  completeDays: number;
  totalDays: number;
  startDate: string;
};

export function slotsSummary(cfg: SlotsConfig, p: Participation, checkins: Checkin[], now: Date = new Date()): SlotsSummary {
  const start = effectiveStartDate(p, cfg);
  const today = kstDate(now);
  const todayStatus = dayStatus(cfg, checkins, today, now);

  let streak = 0;
  let failDays = 0;
  let completeDays = 0;
  let totalDays = 0;

  // 연속일: 오늘(완료면) → 어제 → … 완료가 끊기면 멈춘다. 오늘 실패면 0.
  if (today >= start) {
    if (todayStatus.failed) streak = 0;
    else {
      let cursor = todayStatus.complete ? today : addDays(today, -1);
      while (cursor >= start) {
        const st = dayStatus(cfg, checkins, cursor, now);
        if (!st.complete) break;
        streak++;
        cursor = addDays(cursor, -1);
      }
    }
    // 집계: 시작일 ~ 어제 (+ 오늘은 확정된 경우만)
    for (let d = start; d <= today; d = addDays(d, 1)) {
      const st = d === today ? todayStatus : dayStatus(cfg, checkins, d, now);
      if (d === today && st.pending && !st.failed) continue;
      totalDays++;
      if (st.complete) completeDays++;
      if (st.failed) failDays++;
    }
  }
  return { kind: "slots", today: todayStatus, streak, failDays, completeDays, totalDays, startDate: start };
}

/* ───────── 횟수형(취미) 엔진 ───────── */

export type PeriodStatus = {
  index: number;
  start: string;
  end: string;
  count: number;
  required: number;
  complete: boolean;
  /** 기간이 끝났는데 미달 */
  failed: boolean;
  daysLeft: number;
  checkins: Checkin[];
};

export function periodOf(cfg: CountConfig, startDate: string, date: string): { index: number; start: string; end: string } {
  const idx = Math.max(0, Math.floor(daysBetween(startDate, date) / cfg.period_days));
  const start = addDays(startDate, idx * cfg.period_days);
  return { index: idx, start, end: addDays(start, cfg.period_days - 1) };
}

export function periodStatus(cfg: CountConfig, startDate: string, checkins: Checkin[], date: string, now: Date = new Date()): PeriodStatus {
  const { index, start, end } = periodOf(cfg, startDate, date);
  const today = kstDate(now);
  const inPeriod = checkins
    .filter((c) => c.local_date >= start && c.local_date <= end)
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
  const count = inPeriod.length;
  const complete = count >= cfg.times;
  return {
    index,
    start,
    end,
    count,
    required: cfg.times,
    complete,
    failed: !complete && end < today,
    daysLeft: Math.max(0, daysBetween(today, end)),
    checkins: inPeriod,
  };
}

export type CountSummary = {
  kind: "count";
  current: PeriodStatus;
  streak: number;
  failPeriods: number;
  completePeriods: number;
  totalCounted: number;
  startDate: string;
};

export function countSummary(cfg: CountConfig, p: Participation, checkins: Checkin[], now: Date = new Date()): CountSummary {
  const start = effectiveStartDate(p, cfg);
  const today = kstDate(now);
  const current = periodStatus(cfg, start, checkins, today, now);
  let streak = 0;
  let failPeriods = 0;
  let completePeriods = 0;
  let totalCounted = 0;
  for (let i = current.index; i >= 0; i--) {
    const st = periodStatus(cfg, start, checkins, addDays(start, i * cfg.period_days), now);
    totalCounted += Math.min(st.count, cfg.times);
    if (st.complete) completePeriods++;
    if (st.failed) failPeriods++;
  }
  // 연속: 현재 기간(완료면) → 이전 기간 … 끊기면 멈춤
  let i = current.complete ? current.index : current.index - 1;
  while (i >= 0) {
    const st = periodStatus(cfg, start, checkins, addDays(start, i * cfg.period_days), now);
    if (!st.complete) break;
    streak++;
    i--;
  }
  return { kind: "count", current, streak, failPeriods, completePeriods, totalCounted, startDate: start };
}

export type Summary = SlotsSummary | CountSummary;

export function summarize(ch: Challenge, p: Participation, checkins: Checkin[], now: Date = new Date()): Summary {
  const mine = checkins.filter((c) => c.participation_id === p.id);
  return ch.config.kind === "slots" ? slotsSummary(ch.config, p, mine, now) : countSummary(ch.config, p, mine, now);
}

/* ───────── 인증 시 경험치 계산 ───────── */

export type CheckinOutcome = {
  xp: number;
  reasons: string[];
  /** 이 인증으로 하루/기간이 완료됨 */
  completed: boolean;
  streak: number;
};

/**
 * 인증 1건이 기록된 뒤의 보상. `after` 는 새 인증이 포함된 목록.
 * 시간대형: 사진 +10, 하루 완료 +20, 연속일 보너스 5×min(streak,10)
 * 횟수형: 횟수 안의 인증 +60, 기간 완료 +40, 연속 기간 보너스 20×min(streak,5)
 */
export function rewardFor(ch: Challenge, p: Participation, after: Checkin[], created: Checkin, now: Date = new Date()): CheckinOutcome {
  const mine = after.filter((c) => c.participation_id === p.id);
  if (ch.config.kind === "slots") {
    const s = slotsSummary(ch.config, p, mine, now);
    const reasons = [`사진 인증 +${XP.photo}`];
    let xp = XP.photo;
    const day = dayStatus(ch.config, mine, created.local_date, now);
    if (day.complete) {
      xp += XP.dayComplete;
      reasons.push(`오늘 전부 완료 +${XP.dayComplete}`);
      const bonus = XP.dayStreakPer * Math.min(s.streak, 10);
      if (bonus > 0) {
        xp += bonus;
        reasons.push(`${s.streak}일 연속 +${bonus}`);
      }
    }
    return { xp, reasons, completed: day.complete, streak: s.streak };
  }
  const s = countSummary(ch.config, p, mine, now);
  const period = periodStatus(ch.config, s.startDate, mine, created.local_date, now);
  const order = period.checkins.findIndex((c) => c.id === created.id) + 1;
  if (order > ch.config.times) {
    return { xp: 0, reasons: ["이번 기간 목표는 이미 달성 — 추가 인증은 기록만"], completed: false, streak: s.streak };
  }
  let xp = XP.count;
  const reasons = [`인증 +${XP.count}`];
  if (period.complete && order === ch.config.times) {
    xp += XP.periodComplete;
    reasons.push(`기간 목표 달성 +${XP.periodComplete}`);
    const bonus = XP.periodStreakPer * Math.min(s.streak, 5);
    if (bonus > 0) {
      xp += bonus;
      reasons.push(`${s.streak}기간 연속 +${bonus}`);
    }
    return { xp, reasons, completed: true, streak: s.streak };
  }
  return { xp, reasons, completed: false, streak: s.streak };
}

/* ───────── 기본 챌린지 설정 ───────── */

export const DEFAULT_DIET_CONFIG: SlotsConfig = {
  kind: "slots",
  slots: [
    { key: "lunch", label: "점심", start: "11:00", end: "14:00" },
    { key: "dinner", label: "저녁", start: "17:00", end: "20:00" },
  ],
  goal: "weight",
};

export const DEFAULT_HOBBY_CONFIG: CountConfig = {
  kind: "count",
  times: 1,
  period_days: 7,
  goal: "hobby",
};

export const DEFAULT_PRIZE = "메가커피 아메리카노 쿠폰";

/** 설정 한 줄 설명 */
export function describeConfig(cfg: ChallengeConfig): string {
  if (cfg.kind === "slots") {
    return cfg.slots.map((s) => `${s.label} ${s.start}~${s.end}`).join(" · ");
  }
  const period = cfg.period_days === 7 ? "1주일" : cfg.period_days === 1 ? "하루" : `${cfg.period_days}일`;
  return `${period}에 ${cfg.times}회 인증`;
}

/** 챌린지 설정 검증. 문제가 있으면 메시지, 없으면 null. */
export function validateConfig(cfg: unknown): string | null {
  if (!cfg || typeof cfg !== "object") return "설정이 비어 있어요";
  const c = cfg as Partial<ChallengeConfig>;
  if (c.kind === "slots") {
    const slots = (c as SlotsConfig).slots;
    if (!Array.isArray(slots) || slots.length === 0 || slots.length > 6) return "시간대는 1~6개";
    const keys = new Set<string>();
    for (const s of slots) {
      if (!s.key || !/^[a-z0-9_]{1,20}$/.test(s.key)) return "시간대 키가 잘못됐어요";
      if (keys.has(s.key)) return "시간대 키가 중복돼요";
      keys.add(s.key);
      if (!s.label || s.label.length > 10) return "시간대 이름은 1~10자";
      if (!/^\d{2}:\d{2}$/.test(s.start) || !/^\d{2}:\d{2}$/.test(s.end)) return "시간은 HH:MM";
      if (hmToMinutes(s.start) >= hmToMinutes(s.end)) return `${s.label}: 시작이 끝보다 늦어요`;
    }
    return null;
  }
  if (c.kind === "count") {
    const cc = c as CountConfig;
    if (!Number.isInteger(cc.times) || cc.times < 1 || cc.times > 50) return "횟수는 1~50";
    if (!Number.isInteger(cc.period_days) || cc.period_days < 1 || cc.period_days > 90) return "기간은 1~90일";
    return null;
  }
  return "종류는 시간대형 또는 횟수형";
}
