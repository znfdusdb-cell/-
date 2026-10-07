import type { Challenge, Checkin, Gift, Participation, PushSubscriptionRow, Ticket, TicketMessage, User, WeightLog } from "../types";

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
  createUser(data: Pick<User, "username" | "display_name" | "password_hash" | "role" | "gender">): Promise<User>;
  updateUser(id: string, patch: Partial<Omit<User, "id">>): Promise<User>;
  /** 계정과 기록 전부 삭제 (참여·인증·체중·알림 구독 포함) */
  deleteUser(id: string): Promise<void>;
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

  // weight
  listWeightLogs(participationId: string): Promise<WeightLog[]>;
  listWeightLogsMany(participationIds: string[]): Promise<WeightLog[]>;
  upsertWeightLog(data: Omit<WeightLog, "id" | "created_at">): Promise<WeightLog>;

  // gifts (탈락 벌칙 기프티콘)
  createGift(data: Omit<Gift, "id" | "created_at" | "opened_at">): Promise<Gift>;
  listGiftsReceived(userId: string): Promise<Gift[]>;
  listGiftsSentSince(userId: string, challengeId: string, sinceIso: string): Promise<Gift[]>;
  markGiftOpened(id: string, userId: string): Promise<void>;
  countUnreadGifts(userId: string): Promise<number>;

  // support (개발자 문의)
  getOpenTicket(userId: string): Promise<Ticket | null>;
  /** 가장 최근 문의 (해결된 것 포함) */
  getLatestTicket(userId: string): Promise<Ticket | null>;
  getTicket(id: string): Promise<Ticket | null>;
  createTicket(userId: string): Promise<Ticket>;
  listOpenTickets(): Promise<Ticket[]>;
  updateTicket(id: string, patch: Partial<Omit<Ticket, "id">>): Promise<Ticket>;
  listTicketMessages(ticketId: string): Promise<TicketMessage[]>;
  addTicketMessage(data: Omit<TicketMessage, "id" | "created_at">): Promise<TicketMessage>;

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
  /** 이미 보냈는지(주장했는지)만 확인 */
  hasNotice(key: string): Promise<boolean>;
}
