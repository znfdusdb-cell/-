import "server-only";
import { getRepo, type ParticipantRow } from "./repo";
import { failedUnits, monthReport, summarize, weightProgress, type MonthReport, type Summary } from "./game";
import { kstDate } from "./time";
import type { Challenge, Checkin, Participation, User } from "./types";

export type MyChallenge = {
  challenge: Challenge;
  participation: Participation;
  summary: Summary;
  checkins: Checkin[];
  /** 오늘 이 챌린지에서 슬롯별 인증한 사람 수 (사회적 증거) */
  todayCounts: Record<string, number>;
  /** 오늘(이번 주) 인증을 1건 이상 한 사람 수 */
  todayPeople: number;
};

/**
 * 실패 1건마다 경험치를 한 번만 깎는다 (ch_notice_log 키로 멱등). 깎인 총량을 돌려준다.
 * 호출: 본인이 홈을 열 때, 그리고 크론이 돌 때.
 */
export async function applyFailPenalties(ch: Challenge, p: Participation, checkins: Checkin[], now = new Date()): Promise<number> {
  const repo = getRepo();
  let total = 0;
  for (const u of failedUnits(ch.config, p, checkins.filter((c) => c.participation_id === p.id), now)) {
    if (await repo.claimNotice(`xpfail:${p.id}:${u.key}`)) {
      await repo.addXp(p.user_id, u.xp, `${ch.title} 실패 (${u.date})`);
      total += u.xp;
    }
  }
  return total;
}

/** 내가 참여 중인 챌린지 + 오늘/이번 기간 상태 */
export async function loadMyChallenges(user: User, now = new Date()): Promise<MyChallenge[]> {
  const repo = getRepo();
  const [parts, challenges] = await Promise.all([repo.listParticipationsByUser(user.id), repo.listChallenges({ includeInactive: true })]);
  const active = parts.filter((p) => p.status === "active");
  if (active.length === 0) return [];
  const today = kstDate(now);
  const [checkins, todayAll] = await Promise.all([
    repo.listCheckins({ participationIds: active.map((p) => p.id) }),
    repo.listCheckins({ from: today, to: today }),
  ]);
  const out: MyChallenge[] = [];
  for (const p of active) {
    const ch = challenges.find((c) => c.id === p.challenge_id);
    if (!ch) continue;
    const mine = checkins.filter((c) => c.participation_id === p.id);
    await applyFailPenalties(ch, p, mine, now);
    const todays = todayAll.filter((c) => c.challenge_id === ch.id);
    const todayCounts: Record<string, number> = {};
    for (const c of todays) todayCounts[c.slot] = (todayCounts[c.slot] ?? 0) + 1;
    out.push({ challenge: ch, participation: p, summary: summarize(ch, p, mine, now), checkins: mine, todayCounts, todayPeople: new Set(todays.map((c) => c.user_id)).size });
  }
  return out.sort((a, b) => Number(b.challenge.is_default) - Number(a.challenge.is_default));
}

/** 탈락자의 기프티콘을 받을 사람: 같은 챌린지의 성공 중인 멤버 중 랜덤 (실패 0 우선 → 실패 적은 순). 없으면 null */
export async function pickGiftRecipient(challenge: Challenge, fromUserId: string, now = new Date()): Promise<User | null> {
  const board = await loadBoard(challenge, now);
  const pool = board.filter((r) => r.participant.user_id !== fromUserId && !r.summary.eliminated && !r.waiting);
  if (pool.length === 0) return null;
  const min = Math.min(...pool.map((r) => r.summary.fails));
  const best = pool.filter((r) => r.summary.fails === min);
  return best[Math.floor(Math.random() * best.length)].participant.user;
}

export type BoardRow = {
  participant: ParticipantRow;
  summary: Summary;
  checkins: Checkin[];
  /** 오늘(이번 기간) 아직 할 인증이 남아 있음 */
  pending: boolean;
  /** 시작 전 */
  waiting: boolean;
  /** 체중 목표 진행 (몸무게 자체는 공개하지 않음) */
  weight: { targetLoss: number; lost: number; ratio: number; reached: boolean } | null;
};

/** 챌린지 리더보드: 인증 전 → 완료 → 시작 전·탈락 순, 같은 그룹 안은 연속 → 완료 수 → 경험치 */
export async function loadBoard(challenge: Challenge, now = new Date()): Promise<BoardRow[]> {
  const repo = getRepo();
  const participants = await repo.listParticipants(challenge.id);
  if (participants.length === 0) return [];
  const ids = participants.map((p) => p.id);
  const [checkins, weights] = await Promise.all([repo.listCheckins({ participationIds: ids }), challenge.config.goal === "weight" ? repo.listWeightLogsMany(ids) : Promise.resolve([])]);
  const today = kstDate(now);
  const rows: BoardRow[] = participants.map((participant) => {
    const mine = checkins.filter((c) => c.participation_id === participant.id);
    const summary = summarize(challenge, participant, mine, now);
    const waiting = summary.startDate > today;
    const pending = !waiting && !summary.eliminated && (summary.kind === "slots" ? summary.today.pending && !summary.today.complete : !summary.current.complete);
    let weight: BoardRow["weight"] = null;
    const g = participant.goal;
    if (challenge.config.goal === "weight" && g.start_kg && g.target_kg) {
      const logs = weights.filter((w) => w.participation_id === participant.id);
      const latest = logs.length ? Number(logs[logs.length - 1].kg) : null;
      const wp = weightProgress(g.start_kg, g.target_kg, latest);
      weight = { targetLoss: g.target_kg, lost: wp.lost, ratio: wp.ratio, reached: wp.reached };
    }
    return { participant, summary, checkins: mine, pending, waiting, weight };
  });
  const group = (r: BoardRow) => (r.summary.eliminated ? 3 : r.waiting ? 2 : r.pending ? 0 : 1);
  const completes = (s: Summary) => (s.kind === "slots" ? s.completeDays : s.completePeriods);
  return rows.sort((a, b) => group(a) - group(b) || b.summary.streak - a.summary.streak || completes(b.summary) - completes(a.summary) || b.participant.user.xp - a.participant.user.xp);
}

export type MonthlyReportView = { participationId: string; challengeId: string; challengeTitle: string; emoji: string; report: MonthReport };

/** 지난달 리포트 중 아직 안 본 것 (월 첫 접속 때 팝업) */
export async function loadPendingMonthlyReports(mine: MyChallenge[], now = new Date()): Promise<MonthlyReportView[]> {
  const repo = getRepo();
  const today = kstDate(now);
  const y = parseInt(today.slice(0, 4), 10), m = parseInt(today.slice(5, 7), 10);
  const prev = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
  const out: MonthlyReportView[] = [];
  for (const mc of mine) {
    if (await repo.hasNotice(`monthly:${mc.participation.id}:${prev}`)) continue;
    const report = monthReport(mc.challenge, mc.participation, mc.checkins, prev, now);
    if (!report) continue;
    out.push({ participationId: mc.participation.id, challengeId: mc.challenge.id, challengeTitle: mc.challenge.title, emoji: mc.challenge.emoji, report });
  }
  return out;
}
