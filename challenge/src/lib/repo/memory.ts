import { randomUUID } from "node:crypto";
import type { Challenge, Checkin, Participation, PushSubscriptionRow, User, WeightLog } from "../types";
import type { CheckinQuery, ParticipantRow, Repo } from "./types";

type Store = {
  users: User[];
  challenges: Challenge[];
  participations: Participation[];
  checkins: Checkin[];
  photos: Map<string, { bytes: Uint8Array; contentType: string }>;
  pushSubs: PushSubscriptionRow[];
  weights: WeightLog[];
  notices: Set<string>;
  xpLog: { user_id: string; delta: number; reason: string; created_at: string }[];
};

const g = globalThis as unknown as { __chMemoryStore?: Store };

function store(): Store {
  if (!g.__chMemoryStore) {
    g.__chMemoryStore = {
      users: [],
      challenges: [],
      participations: [],
      checkins: [],
      photos: new Map(),
      pushSubs: [],
      weights: [],
      notices: new Set(),
      xpLog: [],
    };
  }
  return g.__chMemoryStore;
}

const clone = <T>(x: T): T => structuredClone(x);
const now = () => new Date().toISOString();

/** Supabase 없이 돌아가는 인메모리 저장소 (로컬 개발·테스트용). 프로세스가 죽으면 사라진다. */
export class MemoryRepo implements Repo {
  readonly mode = "memory" as const;

  async getUserByUsername(username: string) {
    return clone(store().users.find((u) => u.username === username) ?? null);
  }
  async getUserById(id: string) {
    return clone(store().users.find((u) => u.id === id) ?? null);
  }
  async getUsersByIds(ids: string[]) {
    const set = new Set(ids);
    return clone(store().users.filter((u) => set.has(u.id)));
  }
  async listUsers() {
    return clone([...store().users].sort((a, b) => b.xp - a.xp));
  }
  async createUser(data: Pick<User, "username" | "display_name" | "password_hash" | "role" | "gender">) {
    const u: User = { id: randomUUID(), xp: 0, created_at: now(), last_login_at: null, ...data };
    store().users.push(u);
    return clone(u);
  }
  async updateUser(id: string, patch: Partial<Omit<User, "id">>) {
    const u = store().users.find((x) => x.id === id);
    if (!u) throw new Error("user not found");
    Object.assign(u, patch);
    return clone(u);
  }
  async deleteUser(id: string) {
    const s = store();
    const pids = new Set(s.participations.filter((p) => p.user_id === id).map((p) => p.id));
    s.users = s.users.filter((u) => u.id !== id);
    s.participations = s.participations.filter((p) => p.user_id !== id);
    s.checkins = s.checkins.filter((c) => c.user_id !== id);
    s.weights = s.weights.filter((w) => !pids.has(w.participation_id));
    s.pushSubs = s.pushSubs.filter((x) => x.user_id !== id);
  }
  async addXp(userId: string, delta: number, reason: string) {
    const u = store().users.find((x) => x.id === userId);
    if (!u) throw new Error("user not found");
    u.xp = Math.max(0, u.xp + delta);
    store().xpLog.push({ user_id: userId, delta, reason, created_at: now() });
    return u.xp;
  }

  async listChallenges(opts?: { includeInactive?: boolean }) {
    const list = store().challenges.filter((c) => opts?.includeInactive || c.is_active);
    return clone(list.sort((a, b) => Number(b.is_default) - Number(a.is_default) || a.created_at.localeCompare(b.created_at)));
  }
  async getChallenge(id: string) {
    return clone(store().challenges.find((c) => c.id === id) ?? null);
  }
  async createChallenge(data: Omit<Challenge, "id" | "created_at">) {
    const c: Challenge = { id: randomUUID(), created_at: now(), ...data };
    store().challenges.push(c);
    return clone(c);
  }
  async updateChallenge(id: string, patch: Partial<Omit<Challenge, "id" | "created_at">>) {
    const c = store().challenges.find((x) => x.id === id);
    if (!c) throw new Error("challenge not found");
    Object.assign(c, patch);
    return clone(c);
  }

  async listParticipationsByUser(userId: string) {
    return clone(store().participations.filter((p) => p.user_id === userId));
  }
  async listParticipants(challengeId: string): Promise<ParticipantRow[]> {
    const ps = store().participations.filter((p) => p.challenge_id === challengeId && p.status === "active");
    return clone(
      ps
        .map((p) => ({ ...p, user: store().users.find((u) => u.id === p.user_id)! }))
        .filter((r) => r.user),
    );
  }
  async getParticipation(userId: string, challengeId: string) {
    return clone(store().participations.find((p) => p.user_id === userId && p.challenge_id === challengeId) ?? null);
  }
  async createParticipation(data: Omit<Participation, "id">) {
    const p: Participation = { id: randomUUID(), ...data };
    store().participations.push(p);
    return clone(p);
  }
  async updateParticipation(id: string, patch: Partial<Omit<Participation, "id">>) {
    const p = store().participations.find((x) => x.id === id);
    if (!p) throw new Error("participation not found");
    Object.assign(p, patch);
    return clone(p);
  }
  async listActiveParticipations() {
    return clone(store().participations.filter((p) => p.status === "active"));
  }

  async listCheckins(q: CheckinQuery) {
    const ids = q.participationIds ? new Set(q.participationIds) : null;
    return clone(
      store()
        .checkins.filter(
          (c) =>
            (!q.challengeId || c.challenge_id === q.challengeId) &&
            (!q.userId || c.user_id === q.userId) &&
            (!q.participationId || c.participation_id === q.participationId) &&
            (!ids || ids.has(c.participation_id)) &&
            (!q.from || c.local_date >= q.from) &&
            (!q.to || c.local_date <= q.to),
        )
        .sort((a, b) => b.created_at.localeCompare(a.created_at)),
    );
  }
  async getCheckin(id: string) {
    return clone(store().checkins.find((c) => c.id === id) ?? null);
  }
  async createCheckin(data: Omit<Checkin, "id" | "created_at">) {
    const c: Checkin = { id: randomUUID(), created_at: now(), ...data };
    store().checkins.push(c);
    return clone(c);
  }
  async updateCheckin(id: string, patch: Partial<Omit<Checkin, "id">>) {
    const c = store().checkins.find((x) => x.id === id);
    if (!c) throw new Error("checkin not found");
    Object.assign(c, patch);
    return clone(c);
  }
  async deleteCheckin(id: string) {
    const s = store();
    s.checkins = s.checkins.filter((c) => c.id !== id);
  }

  async listWeightLogs(participationId: string) {
    return clone(store().weights.filter((w) => w.participation_id === participationId).sort((a, b) => a.local_date.localeCompare(b.local_date)));
  }
  async listWeightLogsMany(ids: string[]) {
    const set = new Set(ids);
    return clone(store().weights.filter((w) => set.has(w.participation_id)).sort((a, b) => a.local_date.localeCompare(b.local_date)));
  }
  async upsertWeightLog(data: Omit<WeightLog, "id" | "created_at">) {
    const s = store();
    const i = s.weights.findIndex((w) => w.participation_id === data.participation_id && w.local_date === data.local_date);
    if (i >= 0) { s.weights[i] = { ...s.weights[i], kg: data.kg }; return clone(s.weights[i]); }
    const row: WeightLog = { id: randomUUID(), created_at: now(), ...data };
    s.weights.push(row);
    return clone(row);
  }

  async putPhoto(path: string, bytes: Uint8Array, contentType: string) {
    store().photos.set(path, { bytes, contentType });
  }
  async deletePhoto(path: string) {
    store().photos.delete(path);
  }
  async photoUrls(paths: string[]) {
    return Object.fromEntries(paths.map((p) => [p, `/api/photo/${p.split("/").map(encodeURIComponent).join("/")}`]));
  }
  /** 내부 라우트용 */
  getPhoto(path: string) {
    return store().photos.get(path) ?? null;
  }

  async upsertPushSubscription(data: Omit<PushSubscriptionRow, "id" | "created_at">) {
    const s = store();
    const i = s.pushSubs.findIndex((x) => x.endpoint === data.endpoint);
    const row: PushSubscriptionRow = { id: randomUUID(), created_at: now(), ...data };
    if (i >= 0) s.pushSubs[i] = { ...s.pushSubs[i], ...data };
    else s.pushSubs.push(row);
  }
  async deletePushSubscription(endpoint: string) {
    const s = store();
    s.pushSubs = s.pushSubs.filter((x) => x.endpoint !== endpoint);
  }
  async listPushSubscriptions(userIds?: string[]) {
    const set = userIds ? new Set(userIds) : null;
    return clone(store().pushSubs.filter((x) => !set || set.has(x.user_id)));
  }
  async claimNotice(key: string) {
    const s = store();
    if (s.notices.has(key)) return false;
    s.notices.add(key);
    return true;
  }
}
