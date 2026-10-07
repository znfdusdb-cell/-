import type { Challenge, Checkin, Participation, PushSubscriptionRow, User } from "../types";

export type CheckinQuery = {
  challengeId?: string;
  userId?: string;
  participationId?: string;
  participationIds?: string[];
  /** local_date >= from */
  from?: string;
  /** local_date <= to */
  to?: string;
};

export type ParticipantRow = Participation & { user: User };

export interface Repo {
  readonly mode: "memory" | "supabase";

  // users
  getUserByUsername(username: string): Promise<User | null>;
  getUserById(id: string): Promise<User | null>;
  getUsersByIds(ids: string[]): Promise<User[]>;
  listUsers(): Promise<User[]>;
  createUser(data: Pick<User, "username" | "display_name" | "password_hash" | "role">): Promise<User>;
  updateUser(id: string, patch: Partial<Omit<User, "id">>): Promise<User>;
  /** 경험치 가감 + 로그. 새 xp 반환 */
  addXp(userId: string, delta: number, reason: string): Promise<number>;

  // challenges
  listChallenges(opts?: { includeInactive?: boolean }): Promise<Challenge[]>;
  getChallenge(id: string): Promise<Challenge | null>;
  createChallenge(data: Omit<Challenge, "id" | "created_at">): Promise<Challenge>;
  updateChallenge(id: string, patch: Partial<Omit<Challenge, "id" | "created_at">>): Promise<Challenge>;

  // participations
  listParticipationsByUser(userId: string): Promise<Participation[]>;
  listParticipants(challengeId: string): Promise<ParticipantRow[]>;
  getParticipation(userId: string, challengeId: string): Promise<Participation | null>;
  createParticipation(data: Omit<Participation, "id">): Promise<Participation>;
  updateParticipation(id: string, patch: Partial<Omit<Participation, "id">>): Promise<Participation>;
  listActiveParticipations(): Promise<Participation[]>;

  // checkins
  listCheckins(q: CheckinQuery): Promise<Checkin[]>;
  getCheckin(id: string): Promise<Checkin | null>;
  createCheckin(data: Omit<Checkin, "id" | "created_at">): Promise<Checkin>;
  updateCheckin(id: string, patch: Partial<Omit<Checkin, "id">>): Promise<Checkin>;
  deleteCheckin(id: string): Promise<void>;

  // photos
  putPhoto(path: string, bytes: Uint8Array, contentType: string): Promise<void>;
  deletePhoto(path: string): Promise<void>;
  /** 표시용 URL (Supabase 는 서명 URL, 메모리는 내부 라우트) */
  photoUrls(paths: string[]): Promise<Record<string, string>>;

  // push
  upsertPushSubscription(data: Omit<PushSubscriptionRow, "id" | "created_at">): Promise<void>;
  deletePushSubscription(endpoint: string): Promise<void>;
  listPushSubscriptions(userIds?: string[]): Promise<PushSubscriptionRow[]>;
  /** 같은 key 로 한 번만 보내기. 처음이면 true */
  claimNotice(key: string): Promise<boolean>;
}
