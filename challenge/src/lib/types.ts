export type Role = "admin" | "member";

export type User = {
  id: string;
  username: string;
  display_name: string;
  password_hash: string;
  role: Role;
  xp: number;
  created_at: string;
  last_login_at: string | null;
};

export type PublicUser = Omit<User, "password_hash">;

export type SlotDef = {
  key: string;
  label: string;
  /** "HH:MM" KST */
  start: string;
  /** "HH:MM" KST */
  end: string;
};

/** 시간대형: 하루에 정해진 시간대마다 사진 1장 (다이어트) */
export type SlotsConfig = {
  kind: "slots";
  slots: SlotDef[];
  /** 참여할 때 받는 목표 종류 */
  goal: "weight" | "none";
};

/** 횟수형: 정해진 기간마다 정해진 횟수 인증 (취미) */
export type CountConfig = {
  kind: "count";
  times: number;
  period_days: number;
  goal: "hobby" | "none";
};

export type ChallengeConfig = SlotsConfig | CountConfig;

export type ChallengeType = "diet" | "hobby" | "custom";

export type Challenge = {
  id: string;
  type: ChallengeType;
  title: string;
  description: string;
  emoji: string;
  prize: string;
  config: ChallengeConfig;
  created_by: string | null;
  is_default: boolean;
  is_active: boolean;
  created_at: string;
};

export type ParticipationGoal = {
  start_kg?: number;
  target_kg?: number;
  days?: number;
  hobby?: string;
};

export type Participation = {
  id: string;
  user_id: string;
  challenge_id: string;
  joined_at: string;
  status: "active" | "left";
  goal: ParticipationGoal;
};

export type Checkin = {
  id: string;
  participation_id: string;
  user_id: string;
  challenge_id: string;
  /** 시간대형이면 slot key, 횟수형이면 "count" */
  slot: string;
  photo_path: string;
  /** 촬영 시각 (클라이언트 보고, 서버 시각과 10분 이상 어긋나면 서버 시각) */
  taken_at: string;
  /** 서버 수신 시각 */
  created_at: string;
  /** KST 날짜 "YYYY-MM-DD" */
  local_date: string;
  note: string;
  xp: number;
};

export type PushSubscriptionRow = {
  id: string;
  user_id: string;
  endpoint: string;
  keys: { p256dh: string; auth: string };
  user_agent: string;
  created_at: string;
};
