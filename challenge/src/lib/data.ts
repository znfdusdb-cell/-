import "server-only";
import { getRepo, type ParticipantRow } from "./repo";
import { summarize, type Summary } from "./game";
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

export type BoardRow = { participant: ParticipantRow; summary: Summary; checkins: Checkin[] };

/** 챌린지 리더보드: 연속 → 완료 수 → 경험치 */
export async function loadBoard(challenge: Challenge, now = new Date()): Promise<BoardRow[]> {
  const repo = getRepo();
  const participants = await repo.listParticipants(challenge.id);
  if (participants.length === 0) return [];
  const checkins = await repo.listCheckins({ participationIds: participants.map((p) => p.id) });
  const rows = participants.map((participant) => {
    const mine = checkins.filter((c) => c.participation_id === participant.id);
    return { participant, summary: summarize(challenge, participant, mine, now), checkins: mine };
  });
  const completes = (s: Summary) => (s.kind === "slots" ? s.completeDays : s.completePeriods);
  return rows.sort((a, b) => b.summary.streak - a.summary.streak || completes(b.summary) - completes(a.summary) || b.participant.user.xp - a.participant.user.xp);
}
