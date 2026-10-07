export type Role = "admin" | "member";

export type User = {
  id: string;
  username: string;
  display_name: string;
  password_hash: string;
  role: Role;
  /** 캐릭터 성별 */
  gender: "m" | "f";
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
  /** 실패하면 잃는 것 (손실 프레이밍) */
  penalty: string;
  /** 실패 n번이면 탈락. 0 = 탈락 없음 */
  max_fails: number;
  config: ChallengeConfig;
  created_by: string | null;
  is_default: boolean;
  is_active: boolean;
  created_at: string;
};

export type ParticipationGoal = {
  start_kg?: number;
  /** 감량 목표 kg */
  target_kg?: number;
  days?: number;
  hobby?: string;
  /** 취미 인증 방식 (camera/album/audio/link) */
  methods?: string[];
};

export type WeightLog = {
  id: string;
  participation_id: string;
  user_id: string;
  local_date: string;
  kg: number;
  created_at: string;
};

export type Participation = {
  id: string;
  user_id: string;
  challenge_id: string;
  joined_at: string;
  status: "active" | "left";
  goal: ParticipationGoal;
  /** 관리자가 지정한 집계 시작일 (없으면 월요일 규칙) */
  start_date?: string | null;
};

export type Checkin = {
  id: string;
  participation_id: string;
  user_id: string;
  challenge_id: string;
  /** 시간대형이면 slot key, 횟수형이면 "count" */
  slot: string;
  /** camera: 앱에서 바로 촬영 / album: 앨범 사진 / audio: 녹음 / link: 링크 */
  media_type: "camera" | "album" | "audio" | "link";
  /** 스토리지 경로 (사진·오디오). 링크면 빈 문자열 */
  photo_path: string;
  /** 링크 인증 주소 */
  link_url: string;
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

/** 탈락 벌칙으로 보낸 기프티콘 (받는 사람 선물함) */
export type Gift = {
  id: string;
  challenge_id: string;
  from_user_id: string;
  /** 받을 사람이 없으면 null */
  to_user_id: string | null;
  photo_path: string;
  created_at: string;
  opened_at: string | null;
};

/** 개발자 문의 스레드 */
export type Ticket = {
  id: string;
  user_id: string;
  status: "open" | "resolved";
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
  user_read_at: string | null;
  admin_read_at: string | null;
};

export type TicketMessage = {
  id: string;
  ticket_id: string;
  sender_id: string;
  body: string;
  photo_path: string;
  created_at: string;
};
