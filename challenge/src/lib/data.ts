import "server-only";
import { getRepo, type ParticipantRow } from "./repo";
import { summarize, weightProgress, type Summary } from "./game";
import { kstDate } from "./time";
import type { Challenge, Checkin, Participation, User } from "./types";

export type MyChallenge = { challenge: Challenge; participation: Participation; summary: Summary; checkins: Checkin[] };

/** 내가 참여 중인 챌린지 + 오늘/이번 기간 상태 */
export async function loadMyChallenges(user: User, now = new Date()): Promise<MyChallenge[]> {
  const repo = getRepo();
  const [parts, challenges] = await Promise.all([repo.listParticipationsByUser(user.id), repo.listChallenges({ includeInactive: true })]);
  const active = parts.filter((p) => p.status === "active");
  if (active.length === 0) return [];
  const checkins = await repo.listCheckins({ participationIds: active.map((p) => p.id) });
  const out: MyChallenge[] = [];
  for (const p of active) {
    const ch = challenges.find((c) => c.id === p.challenge_id);
    if (!ch) continue;
    const mine = checkins.filter((c) => c.participation_id === p.id);
    out.push({ challenge: ch, participation: p, summary: summarize(ch, p, mine, now), checkins: mine });
  }
  return out.sort((a, b) => Number(b.challenge.is_default) - Number(a.challenge.is_default));
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
