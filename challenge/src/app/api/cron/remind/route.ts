import { ensureBootstrap, getRepo } from "@/lib/repo";
import { pushEnabled, sendPushToUsers, type PushPayload } from "@/lib/push";
import { dayStatus, effectiveStartDate, periodStatus } from "@/lib/game";
import { addDays, fmtDateKo, hmToMinutes, kstDate, kstMinutes } from "@/lib/time";
import type { Challenge, Participation } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 알림 크론. 30분마다 호출되면 충분하다 (GitHub Actions 또는 Supabase pg_cron).
 *   GET /api/cron/remind?key=<CRON_SECRET>   (또는 헤더 x-cron-secret)
 * 시간대형: 시작 시각(±15분 창)에 "시작" 알림, 끝 30분 전(±15분 창)에 "마감 임박" 알림 — 아직 안 올린 사람만.
 * 횟수형: 기간 시작일·마지막 날 오전 10시(10:00~10:29) — 아직 미달인 사람만.
 * 시작 전 참가자: 시작 전날 20:00~20:29 "내일 시작" 예고, 시작일 08:00~08:29 "오늘부터 시작".
 * 같은 알림은 ch_notice_log 로 하루 1번만.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const secret = (process.env.CRON_SECRET ?? "").trim();
  const given = url.searchParams.get("key") ?? req.headers.get("x-cron-secret") ?? "";
  if (!secret || given !== secret) return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const dry = url.searchParams.get("dry") === "1";
  await ensureBootstrap();

  const repo = getRepo();
  const now = new Date();
  const today = kstDate(now);
  const nowMin = kstMinutes(now);
  const challenges = new Map<string, Challenge>();
  for (const c of await repo.listChallenges()) challenges.set(c.id, c);
  const parts = await repo.listActiveParticipations();

  const planned: { key: string; userIds: string[]; payload: PushPayload }[] = [];
  const byChallenge = new Map<string, Participation[]>();
  for (const p of parts) {
    if (!challenges.has(p.challenge_id)) continue;
    byChallenge.set(p.challenge_id, [...(byChallenge.get(p.challenge_id) ?? []), p]);
  }

  for (const [cid, ps] of byChallenge) {
    const ch = challenges.get(cid)!;

    // 시작 전 참가자 알림 (월요일 시작)
    const tomorrow = addDays(today, 1);
    if (nowMin >= 20 * 60 && nowMin < 20 * 60 + 30) {
      const ids = ps.filter((p) => effectiveStartDate(p, ch.config) === tomorrow).map((p) => p.user_id);
      if (ids.length) planned.push({ key: `${today}:${cid}:start-eve`, userIds: ids, payload: { title: `${ch.emoji} ${ch.title} 내일 시작!`, body: `${fmtDateKo(tomorrow)}부터 인증이 시작돼요. 준비됐나요?`, url: "/", tag: `${cid}-start` } });
    }
    if (nowMin >= 8 * 60 && nowMin < 8 * 60 + 30) {
      const ids = ps.filter((p) => effectiveStartDate(p, ch.config) === today).map((p) => p.user_id);
      if (ids.length) planned.push({ key: `${today}:${cid}:start-day`, userIds: ids, payload: { title: `${ch.emoji} ${ch.title} 오늘부터 시작!`, body: ch.config.kind === "slots" ? `${ch.config.slots.map((x) => `${x.label} ${x.start}~${x.end}`).join(", ")} 안에 인증해 주세요.` : `이번 주 ${ch.config.times}회 인증, 가볍게 시작해요.`, url: "/", tag: `${cid}-start` } });
    }

    const checkins = await repo.listCheckins({ challengeId: cid, from: ch.config.kind === "slots" ? today : undefined });

    if (ch.config.kind === "slots") {
      for (const slot of ch.config.slots) {
        const start = hmToMinutes(slot.start);
        const end = hmToMinutes(slot.end);
        const kinds: { kind: string; when: boolean; title: string; body: string }[] = [
          {
            kind: "start",
            when: nowMin >= start && nowMin < start + 15,
            title: `${ch.emoji} ${slot.label} 인증 시간!`,
            body: `${slot.end}까지 ${slot.label} 사진을 올려 주세요.`,
          },
          {
            kind: "ending",
            when: nowMin >= end - 30 && nowMin < end - 15,
            title: `⏰ ${slot.label} 인증 30분 남았어요`,
            body: `${slot.end}에 마감! 아직 ${slot.label} 사진을 안 올렸어요.`,
          },
        ];
        for (const k of kinds) {
          if (!k.when) continue;
          const userIds = ps
            .filter((p) => effectiveStartDate(p, ch.config) <= today)
            .filter((p) => {
              const mine = checkins.filter((c) => c.participation_id === p.id);
              const st = dayStatus(ch.config as Extract<Challenge["config"], { kind: "slots" }>, mine, today, now);
              return st.slots.find((s) => s.slot.key === slot.key)?.state === "open";
            })
            .map((p) => p.user_id);
          if (userIds.length) planned.push({ key: `${today}:${cid}:${slot.key}:${k.kind}`, userIds, payload: { title: k.title, body: k.body, url: "/", tag: `${cid}-${slot.key}` } });
        }
      }
    } else {
      if (!(nowMin >= 600 && nowMin < 630)) continue; // 10:00~10:29
      const cfg = ch.config;
      const startUsers: string[] = [];
      const lastDayUsers: string[] = [];
      for (const p of ps) {
        const startDate = effectiveStartDate(p, cfg);
        if (startDate > today) continue;
        const mine = checkins.filter((c) => c.participation_id === p.id);
        const st = periodStatus(cfg, startDate, mine, today, now);
        if (st.complete) continue;
        if (st.start === today && cfg.period_days > 1) startUsers.push(p.user_id);
        else if (st.daysLeft === 0) lastDayUsers.push(p.user_id);
      }
      if (startUsers.length) planned.push({ key: `${today}:${cid}:period-start`, userIds: startUsers, payload: { title: `${ch.emoji} ${ch.title} 새 기간 시작`, body: `이번 기간 ${cfg.times}회 인증, 잊지 마세요!`, url: "/", tag: `${cid}-period` } });
      if (lastDayUsers.length) planned.push({ key: `${today}:${cid}:period-last`, userIds: lastDayUsers, payload: { title: `⏰ ${ch.title} 오늘이 마지막 날`, body: `오늘 안에 인증하지 않으면 이번 기간은 실패예요.`, url: "/", tag: `${cid}-period` } });
    }
  }

  if (dry) return Response.json({ ok: true, dry: true, push: pushEnabled(), now: now.toISOString(), planned });

  const results: { key: string; users: number; sent: number }[] = [];
  for (const item of planned) {
    if (!(await repo.claimNotice(item.key))) continue;
    const sent = await sendPushToUsers(item.userIds, item.payload);
    results.push({ key: item.key, users: item.userIds.length, sent });
  }
  return Response.json({ ok: true, push: pushEnabled(), now: now.toISOString(), results });
}
