import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Challenge, Checkin, Gift, Participation, PushSubscriptionRow, Ticket, TicketMessage, User, WeightLog } from "../types";
import type { CheckinQuery, ParticipantRow, Repo } from "./types";

export const BUCKET = "ch-photos";

export function supabaseUrl(): string | null {
  const raw = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim();
  if (!raw) return null;
  try {
    return new URL(raw.includes("://") ? raw : `https://${raw}`).origin;
  } catch {
    return null;
  }
}

export function supabaseKey(): string | null {
  const k = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
  return k || null;
}

export function hasSupabase(): boolean {
  return Boolean(supabaseUrl() && supabaseKey());
}

function fail(ctx: string, error: { message: string } | null): never {
  throw new Error(`${ctx}: ${error?.message ?? "unknown"}`);
}

/** 서버 전용. service_role 키는 브라우저로 절대 내보내지 않는다. RLS 는 켜 두고 정책은 없다(서비스 키만 통과). */
export class SupabaseRepo implements Repo {
  readonly mode = "supabase" as const;
  private sb: SupabaseClient;

  constructor() {
    this.sb = createClient(supabaseUrl()!, supabaseKey()!, { auth: { persistSession: false, autoRefreshToken: false } });
  }

  private async one<T>(q: PromiseLike<{ data: T | null; error: { message: string } | null }>, ctx: string): Promise<T> {
    const { data, error } = await q;
    if (error || !data) fail(ctx, error ?? { message: "no row" });
    return data as T;
  }
  private async many<T>(q: PromiseLike<{ data: T[] | null; error: { message: string } | null }>, ctx: string): Promise<T[]> {
    const { data, error } = await q;
    if (error) fail(ctx, error);
    return data ?? [];
  }
  private async maybe<T>(q: PromiseLike<{ data: T | null; error: { message: string } | null }>, ctx: string): Promise<T | null> {
    const { data, error } = await q;
    if (error) fail(ctx, error);
    return data ?? null;
  }

  // users
  getUserByUsername(username: string) {
    return this.maybe<User>(this.sb.from("ch_users").select("*").eq("username", username).maybeSingle(), "getUserByUsername");
  }
  getUserById(id: string) {
    return this.maybe<User>(this.sb.from("ch_users").select("*").eq("id", id).maybeSingle(), "getUserById");
  }
  getUsersByIds(ids: string[]) {
    if (ids.length === 0) return Promise.resolve([]);
    return this.many<User>(this.sb.from("ch_users").select("*").in("id", ids), "getUsersByIds");
  }
  listUsers() {
    return this.many<User>(this.sb.from("ch_users").select("*").order("xp", { ascending: false }), "listUsers");
  }
  createUser(data: Pick<User, "username" | "display_name" | "password_hash" | "role" | "gender">) {
    return this.one<User>(this.sb.from("ch_users").insert(data).select("*").single(), "createUser");
  }
  updateUser(id: string, patch: Partial<Omit<User, "id">>) {
    return this.one<User>(this.sb.from("ch_users").update(patch).eq("id", id).select("*").single(), "updateUser");
  }
  async deleteUser(id: string) {
    const checkins = await this.listCheckins({ userId: id });
    const paths = checkins.map((c) => c.photo_path).filter(Boolean);
    if (paths.length) await this.sb.storage.from(BUCKET).remove(paths);
    const { error } = await this.sb.from("ch_users").delete().eq("id", id);
    if (error) fail("deleteUser", error);
  }
  async addXp(userId: string, delta: number, reason: string) {
    const { data, error } = await this.sb.rpc("ch_add_xp", { p_user_id: userId, p_delta: delta, p_reason: reason });
    if (error) fail("addXp", error);
    return Number(data);
  }

  // challenges
  listChallenges(opts?: { includeInactive?: boolean }) {
    let q = this.sb.from("ch_challenges").select("*").order("is_default", { ascending: false }).order("created_at", { ascending: true });
    if (!opts?.includeInactive) q = q.eq("is_active", true);
    return this.many<Challenge>(q, "listChallenges");
  }
  getChallenge(id: string) {
    return this.maybe<Challenge>(this.sb.from("ch_challenges").select("*").eq("id", id).maybeSingle(), "getChallenge");
  }
  createChallenge(data: Omit<Challenge, "id" | "created_at">) {
    return this.one<Challenge>(this.sb.from("ch_challenges").insert(data).select("*").single(), "createChallenge");
  }
  updateChallenge(id: string, patch: Partial<Omit<Challenge, "id" | "created_at">>) {
    return this.one<Challenge>(this.sb.from("ch_challenges").update(patch).eq("id", id).select("*").single(), "updateChallenge");
  }

  // participations
  listParticipationsByUser(userId: string) {
    return this.many<Participation>(this.sb.from("ch_participations").select("*").eq("user_id", userId), "listParticipationsByUser");
  }
  async listParticipants(challengeId: string): Promise<ParticipantRow[]> {
    const rows = await this.many<Participation & { user: User | null }>(
      this.sb.from("ch_participations").select("*, user:ch_users(*)").eq("challenge_id", challengeId).eq("status", "active"),
      "listParticipants",
    );
    return rows.filter((r): r is ParticipantRow => Boolean(r.user));
  }
  getParticipation(userId: string, challengeId: string) {
    return this.maybe<Participation>(
      this.sb.from("ch_participations").select("*").eq("user_id", userId).eq("challenge_id", challengeId).maybeSingle(),
      "getParticipation",
    );
  }
  createParticipation(data: Omit<Participation, "id">) {
    return this.one<Participation>(this.sb.from("ch_participations").insert(data).select("*").single(), "createParticipation");
  }
  updateParticipation(id: string, patch: Partial<Omit<Participation, "id">>) {
    return this.one<Participation>(this.sb.from("ch_participations").update(patch).eq("id", id).select("*").single(), "updateParticipation");
  }
  listActiveParticipations() {
    return this.many<Participation>(this.sb.from("ch_participations").select("*").eq("status", "active"), "listActiveParticipations");
  }

  // checkins
  listCheckins(q: CheckinQuery) {
    let s = this.sb.from("ch_checkins").select("*").order("created_at", { ascending: false });
    if (q.challengeId) s = s.eq("challenge_id", q.challengeId);
    if (q.userId) s = s.eq("user_id", q.userId);
    if (q.participationId) s = s.eq("participation_id", q.participationId);
    if (q.participationIds) {
      if (q.participationIds.length === 0) return Promise.resolve([]);
      s = s.in("participation_id", q.participationIds);
    }
    if (q.from) s = s.gte("local_date", q.from);
    if (q.to) s = s.lte("local_date", q.to);
    return this.many<Checkin>(s, "listCheckins");
  }
  getCheckin(id: string) {
    return this.maybe<Checkin>(this.sb.from("ch_checkins").select("*").eq("id", id).maybeSingle(), "getCheckin");
  }
  createCheckin(data: Omit<Checkin, "id" | "created_at">) {
    return this.one<Checkin>(this.sb.from("ch_checkins").insert(data).select("*").single(), "createCheckin");
  }
  updateCheckin(id: string, patch: Partial<Omit<Checkin, "id">>) {
    return this.one<Checkin>(this.sb.from("ch_checkins").update(patch).eq("id", id).select("*").single(), "updateCheckin");
  }
  async deleteCheckin(id: string) {
    const { error } = await this.sb.from("ch_checkins").delete().eq("id", id);
    if (error) fail("deleteCheckin", error);
  }

  // weight
  listWeightLogs(participationId: string) {
    return this.many<WeightLog>(this.sb.from("ch_weight_logs").select("*").eq("participation_id", participationId).order("local_date", { ascending: true }), "listWeightLogs");
  }
  listWeightLogsMany(ids: string[]) {
    if (ids.length === 0) return Promise.resolve([]);
    return this.many<WeightLog>(this.sb.from("ch_weight_logs").select("*").in("participation_id", ids).order("local_date", { ascending: true }), "listWeightLogsMany");
  }
  async upsertWeightLog(data: Omit<WeightLog, "id" | "created_at">) {
    const row = await this.one<WeightLog>(this.sb.from("ch_weight_logs").upsert(data, { onConflict: "participation_id,local_date" }).select("*").single(), "upsertWeightLog");
    return { ...row, kg: Number(row.kg) };
  }

  // gifts
  createGift(data: Omit<Gift, "id" | "created_at" | "opened_at">) {
    return this.one<Gift>(this.sb.from("ch_gifts").insert(data).select("*").single(), "createGift");
  }
  listGiftsReceived(userId: string) {
    return this.many<Gift>(this.sb.from("ch_gifts").select("*").eq("to_user_id", userId).order("created_at", { ascending: false }), "listGiftsReceived");
  }
  listGiftsSentSince(userId: string, challengeId: string, sinceIso: string) {
    return this.many<Gift>(this.sb.from("ch_gifts").select("*").eq("from_user_id", userId).eq("challenge_id", challengeId).gte("created_at", sinceIso), "listGiftsSentSince");
  }
  async markGiftOpened(id: string, userId: string) {
    const { error } = await this.sb.from("ch_gifts").update({ opened_at: new Date().toISOString() }).eq("id", id).eq("to_user_id", userId).is("opened_at", null);
    if (error) fail("markGiftOpened", error);
  }
  async countUnreadGifts(userId: string) {
    const { count, error } = await this.sb.from("ch_gifts").select("id", { count: "exact", head: true }).eq("to_user_id", userId).is("opened_at", null);
    if (error) fail("countUnreadGifts", error);
    return count ?? 0;
  }

  // support
  getOpenTicket(userId: string) {
    return this.maybe<Ticket>(this.sb.from("ch_tickets").select("*").eq("user_id", userId).eq("status", "open").order("created_at", { ascending: false }).limit(1).maybeSingle(), "getOpenTicket");
  }
  getLatestTicket(userId: string) {
    return this.maybe<Ticket>(this.sb.from("ch_tickets").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(1).maybeSingle(), "getLatestTicket");
  }
  getTicket(id: string) {
    return this.maybe<Ticket>(this.sb.from("ch_tickets").select("*").eq("id", id).maybeSingle(), "getTicket");
  }
  createTicket(userId: string) {
    return this.one<Ticket>(this.sb.from("ch_tickets").insert({ user_id: userId }).select("*").single(), "createTicket");
  }
  listOpenTickets() {
    return this.many<Ticket>(this.sb.from("ch_tickets").select("*").eq("status", "open").order("updated_at", { ascending: false }), "listOpenTickets");
  }
  updateTicket(id: string, patch: Partial<Omit<Ticket, "id">>) {
    return this.one<Ticket>(this.sb.from("ch_tickets").update(patch).eq("id", id).select("*").single(), "updateTicket");
  }
  listTicketMessages(ticketId: string) {
    return this.many<TicketMessage>(this.sb.from("ch_ticket_messages").select("*").eq("ticket_id", ticketId).order("created_at", { ascending: true }), "listTicketMessages");
  }
  async addTicketMessage(data: Omit<TicketMessage, "id" | "created_at">) {
    const m = await this.one<TicketMessage>(this.sb.from("ch_ticket_messages").insert(data).select("*").single(), "addTicketMessage");
    await this.sb.from("ch_tickets").update({ updated_at: m.created_at }).eq("id", data.ticket_id);
    return m;
  }

  // cheers
  async toggleCheer(checkinId: string, userId: string) {
    const { data: existing, error: e1 } = await this.sb.from("ch_cheers").select("id").eq("checkin_id", checkinId).eq("user_id", userId).maybeSingle();
    if (e1) fail("toggleCheer", e1);
    if (existing) {
      const { error } = await this.sb.from("ch_cheers").delete().eq("id", existing.id);
      if (error) fail("toggleCheer:delete", error);
    } else {
      const { error } = await this.sb.from("ch_cheers").insert({ checkin_id: checkinId, user_id: userId });
      if (error && error.code !== "23505") fail("toggleCheer:insert", error);
    }
    const { count, error: e2 } = await this.sb.from("ch_cheers").select("id", { count: "exact", head: true }).eq("checkin_id", checkinId);
    if (e2) fail("toggleCheer:count", e2);
    return { cheered: !existing, count: count ?? 0 };
  }
  async cheerStats(checkinIds: string[], userId: string) {
    const out: Record<string, { count: number; mine: boolean }> = {};
    for (const id of checkinIds) out[id] = { count: 0, mine: false };
    if (checkinIds.length === 0) return out;
    const rows = await this.many<{ checkin_id: string; user_id: string }>(this.sb.from("ch_cheers").select("checkin_id, user_id").in("checkin_id", checkinIds), "cheerStats");
    for (const r of rows) {
      const s = out[r.checkin_id] ?? (out[r.checkin_id] = { count: 0, mine: false });
      s.count++;
      if (r.user_id === userId) s.mine = true;
    }
    return out;
  }
  async countCheersReceived(userId: string) {
    const r = await this.countCheersReceivedMany([userId]);
    return r[userId] ?? 0;
  }
  async countCheersReceivedMany(userIds: string[]) {
    const out: Record<string, number> = {};
    for (const id of userIds) out[id] = 0;
    if (userIds.length === 0) return out;
    // 조인 타입이 번거로워 두 단계로: 사용자들의 인증 id → 그 인증들의 응원 수
    const checkins = await this.many<{ id: string; user_id: string }>(this.sb.from("ch_checkins").select("id, user_id").in("user_id", userIds), "countCheersReceivedMany:checkins");
    if (checkins.length === 0) return out;
    const owner = new Map(checkins.map((c) => [c.id, c.user_id]));
    const cheers = await this.many<{ checkin_id: string }>(this.sb.from("ch_cheers").select("checkin_id").in("checkin_id", checkins.map((c) => c.id)), "countCheersReceivedMany:cheers");
    for (const c of cheers) {
      const u = owner.get(c.checkin_id);
      if (u) out[u] = (out[u] ?? 0) + 1;
    }
    return out;
  }

  // photos
  async putPhoto(path: string, bytes: Uint8Array, contentType: string) {
    const { error } = await this.sb.storage.from(BUCKET).upload(path, bytes, { contentType, upsert: true });
    if (error) fail("putPhoto", error);
  }
  async deletePhoto(path: string) {
    await this.sb.storage.from(BUCKET).remove([path]);
  }
  async photoUrls(paths: string[]) {
    if (paths.length === 0) return {};
    const { data, error } = await this.sb.storage.from(BUCKET).createSignedUrls(paths, 60 * 60 * 6);
    if (error) fail("photoUrls", error);
    const out: Record<string, string> = {};
    for (const row of data ?? []) if (row.path && row.signedUrl) out[row.path] = row.signedUrl;
    return out;
  }

  // push
  async upsertPushSubscription(data: Omit<PushSubscriptionRow, "id" | "created_at">) {
    const { error } = await this.sb.from("ch_push_subscriptions").upsert(data, { onConflict: "endpoint" });
    if (error) fail("upsertPushSubscription", error);
  }
  async deletePushSubscription(endpoint: string) {
    const { error } = await this.sb.from("ch_push_subscriptions").delete().eq("endpoint", endpoint);
    if (error) fail("deletePushSubscription", error);
  }
  listPushSubscriptions(userIds?: string[]) {
    let q = this.sb.from("ch_push_subscriptions").select("*");
    if (userIds) {
      if (userIds.length === 0) return Promise.resolve([]);
      q = q.in("user_id", userIds);
    }
    return this.many<PushSubscriptionRow>(q, "listPushSubscriptions");
  }
  async hasNotice(key: string) {
    const { count, error } = await this.sb.from("ch_notice_log").select("key", { count: "exact", head: true }).eq("key", key);
    if (error) fail("hasNotice", error);
    return (count ?? 0) > 0;
  }
  async claimNotice(key: string) {
    const { error } = await this.sb.from("ch_notice_log").insert({ key });
    if (!error) return true;
    if (error.code === "23505") return false; // unique violation = 이미 보냄
    fail("claimNotice", error);
  }
}
