import type { Stage, PositionState, RegimeSignal, ThesisStatus, SetupType, EventType, Rule } from "./types";

export const STAGES: Stage[] = ["radar", "review", "universe", "holding", "exited"];

export const STAGE_LABEL: Record<Stage, string> = {
  radar: "레이더",
  review: "검토",
  universe: "유니버스",
  holding: "보유",
  exited: "퇴출",
};

export const STAGE_HINT: Record<Stage, string> = {
  radar: "브레인이 투입한 후보. 아직 아무 권한 없음",
  review: "가설·무효화 조건 작성 중. 강등된 종목도 여기",
  universe: "봇이 매수할 수 있는 유일한 단계",
  holding: "봇이 체결로 올림. 손절선·상태 머신 작동 중",
  exited: "매도 대상. 봇이 정리하면 재설정 감시로",
};

/** 사이트에서 버튼으로 허용하는 단계 이동. 보유 단계 진입은 봇 체결로만 일어난다. */
export const ALLOWED_MOVES: Record<Stage, { to: Stage; label: string; danger?: boolean }[]> = {
  radar: [{ to: "review", label: "검토로 올리기" }],
  review: [
    { to: "universe", label: "유니버스 승인" },
    { to: "radar", label: "레이더로 내리기" },
    { to: "exited", label: "퇴출 승인 (봇 매도)", danger: true },
  ],
  universe: [{ to: "review", label: "검토로 강등" }],
  holding: [{ to: "review", label: "검토로 강등 (위반 의심)", danger: true }],
  exited: [{ to: "radar", label: "레이더로 복귀 (재설정 감시)" }],
};

export const POSITION_STATE_LABEL: Record<PositionState, string> = {
  scout: "정찰병",
  tranche1: "1차",
  tranche2: "2차",
  tranche3: "3차",
  squat_wait: "스쿼트 대기",
  reset_watch: "재설정 감시",
  closed: "종료",
  manual: "수동 보유",
};

export const AUTHOR_LABEL: Record<"brain" | "bium" | "bot" | "claude_code", string> = {
  brain: "브레인",
  bium: "비움",
  bot: "봇",
  claude_code: "claude_code 초안",
};

/** 쉬운 모드 용어. 단어를 누르면 한 줄 설명. */
export const TERMS: Record<string, { easy: string; pro: string; desc: string }> = {
  pivot: { easy: "문턱", pro: "피봇", desc: "쉬는 곳(베이스)의 맨 윗가격. 이걸 거래량과 함께 넘는 날 봇이 산다." },
  stop: { easy: "안전벨트", pro: "손절선", desc: "여기 아래로 내려가면 이유 묻지 않고 판다. 산 가격의 -6%에서 시작해 종가가 오르면 위로만 올라간다." },
  overhead: { easy: "본전 기다리는 사람들", pro: "매물대", desc: "예전에 비싸게 샀다가 물린 사람들. 그 가격 근처에 오면 팔려고 해서 잘 안 올라간다." },
  stage2: { easy: "오르막", pro: "2단계", desc: "큰 흐름이 올라가는 중. 봇은 오르막에서만 산다. 내리막 속 평평한 곳은 쉬는 곳이 아니다." },
  base: { easy: "쉬는 곳", pro: "베이스", desc: "오르다가 잠깐 멈춰 흔들리는 구간. 흔들림이 점점 작아지고 거래량이 마르면 좋은 쉼이다." },
  cbox: { easy: "좁게 쉬는 칸", pro: "C 박스", desc: "컵이 다 차기 전에 중간쯤 좁게(5~10%) 쉬는 곳. 이 칸의 윗가격이 문턱이 된다." },
  universe: { easy: "살 수 있는 목록", pro: "유니버스", desc: "비움이 승인한 종목만 들어간다. 봇은 이 목록 밖 종목을 절대 사지 않는다." },
  tennis: { easy: "테니스공", pro: "정상 반응", desc: "문턱을 넘고 살짝 내려와도 1~2주 안에 다시 튀어 오르면 건강하다. 돌처럼 가라앉으면 경고." },
};

export const ACCOUNT_LABEL: Record<"kis_bot" | "kb_manual", string> = {
  kis_bot: "한투 봇 계좌",
  kb_manual: "KB 수동 보유",
};

/** sb_settings 키와 설명. 값 null = 비움 미확정. */
export const SETTING_KEYS: { key: string; label: string; unit?: string }[] = [
  { key: "bot_started_at", label: "봇 가동일" },
  { key: "bot_account_balance", label: "봇 계좌 잔고", unit: "원" },
  { key: "max_weight_per_stock_pct", label: "SZ-1 종목당 비중 상한", unit: "%" },
  { key: "max_weight_per_sector_pct", label: "SZ-1 업종당 비중 상한", unit: "%" },
  { key: "uv4_drawdown_pct", label: "UV-4 고점 대비 조정 상한", unit: "%" },
  { key: "uv4_market_multiple", label: "UV-4 시장 대비 조정 배수 상한", unit: "배" },
  { key: "regime_vkospi_reduce", label: "시장 필터: VKOSPI 축소 기준" },
  { key: "regime_vkospi_wait", label: "시장 필터: VKOSPI 관망 기준" },
  { key: "regime_lev_etf_share_reduce", label: "시장 필터: 레버리지 ETF 비중 축소 기준", unit: "%" },
  { key: "regime_ma200_slope_min_pct", label: "시장 필터: 200일선 기울기 최소", unit: "%" },
];

export const REGIME_LABEL: Record<RegimeSignal, string> = {
  trade: "거래",
  reduce: "축소",
  wait: "관망",
};

export const REGIME_HINT: Record<RegimeSignal, string> = {
  trade: "정상 비중으로 신규 진입 가능",
  reduce: "신규 진입은 가능하되 포지션 크기 절반",
  wait: "신규 진입 없음. 보유분은 손절선만 관리",
};

export const THESIS_STATUS_LABEL: Record<ThesisStatus, string> = {
  draft: "비움 미승인",
  valid: "유효",
  suspect: "위반 의심",
  discarded: "폐기",
};

export const SETUP_TYPE_LABEL: Record<SetupType, string> = {
  vcp: "VCP",
  cup3c: "3C",
  flat: "플랫 베이스",
  power_play: "파워 플레이",
  none: "셋업 없음",
};

export const EVENT_TYPE_LABEL: Record<EventType, string> = {
  earnings: "실적",
  holiday: "휴장",
  macro: "거시",
  other: "기타",
};

export const TREND_TEMPLATE_ITEMS: { key: string; label: string }[] = [
  { key: "tt1", label: "현재가 > 150일선·200일선" },
  { key: "tt2", label: "150일선 > 200일선" },
  { key: "tt3", label: "200일선 1개월 이상 상승 (권장 4~5개월)" },
  { key: "tt4", label: "50일선 > 150일선 > 200일선" },
  { key: "tt5", label: "현재가 > 50일선" },
  { key: "tt6", label: "52주 신저가 대비 +25~30% 이상" },
  { key: "tt7", label: "52주 신고가 25% 이내" },
  { key: "tt8", label: "상대강도 상위" },
];

/** 체크리스트 7항목 (비움 확정 2026-10-06) */
export const CHECKLIST_ITEMS: { key: string; label: string }[] = [
  { key: "c1", label: "큰 흐름이 2단계(상승 추세)다" },
  { key: "c2", label: "상승 중 베이스(조정·횡보 구간)가 있다" },
  { key: "c3", label: "흔들림이 갈수록 작아졌고 마지막 조정이 10% 이내다" },
  { key: "c4", label: "베이스 동안 거래량이 줄었다" },
  { key: "c5", label: "고점 대비 조정이 60% 미만이다" },
  { key: "c6", label: "피봇을 거래량 급증과 함께 돌파했다" },
  { key: "c7", label: "피봇 대비 +2~3% 이내에서 진입했다" },
];

export const RULES: Rule[] = [
  { rule_id: "MF-1", category: "시장 필터", title: "관망이면 신규 진입 없음", description: "코스피·코스닥 200일선 방향, VKOSPI, 단일종목 레버리지 ETF 거래대금 비중으로 거래/축소/관망 판정. 관망 시 신규 진입 금지." },
  { rule_id: "MF-2", category: "시장 필터", title: "축소면 포지션 크기 절반", description: "시장 신호가 축소일 때 모든 신규 포지션 크기를 정상의 절반으로." },
  { rule_id: "UV-1", category: "유니버스", title: "유니버스 밖 종목 매수 금지", description: "봇은 '유니버스' 단계 종목만 매수할 수 있다. 사람이 승인한다." },
  { rule_id: "UV-2", category: "유니버스", title: "가설 + 무효화 조건 필수", description: "무효화 조건이 비어 있으면 유니버스 승인 불가." },
  { rule_id: "UV-3", category: "유니버스", title: "무효화 위반 시 검토 강등", description: "무효화 조건 위반 확인 → 검토 단계로 강등 → 비움 승인 후 퇴출(봇 매도)." },
  { rule_id: "UV-4", category: "유니버스", title: "제외 조건", description: "고점 대비 60% 이상 조정, 또는 같은 기간 비교 지수 대비 2배 이상 조정한 종목은 유니버스 승인 불가. 대형 지수 비중주는 코스피 대신 반도체지수·코스닥 등으로 비교." },
  { rule_id: "EN-1", category: "진입", title: "피봇 장중 돌파 + 거래량", description: "피봇(C 박스/베이스 고점) 장중 돌파 + 개장 2시간 내 누적 거래량 ≥ 50일 평균 일거래량의 50%." },
  { rule_id: "EN-2", category: "진입", title: "추격 금지", description: "피봇 대비 +2~3%를 넘으면 주문 취소. 추격 매수 금지." },
  { rule_id: "EN-3", category: "진입", title: "정찰병 3거래일", description: "소액 정찰병으로 진입 후 3거래일 관찰. 관찰 중 손절선 도달 시 즉시 종료." },
  { rule_id: "EN-4", category: "진입", title: "1차 45~50%", description: "정찰병 통과 후 계획 비중의 45~50% 진입." },
  { rule_id: "EN-5", category: "진입", title: "2차는 피봇 돌파 확인 후", description: "2차 추가는 피봇 돌파 확인 후." },
  { rule_id: "EN-6", category: "진입", title: "3차는 트렌드 템플레이트 대부분 충족", description: "3차 추가는 트렌드 템플레이트 8요건 대부분 충족 시." },
  { rule_id: "EN-7", category: "진입", title: "물타기 금지", description: "손실 중 추가매수 금지. 피라미딩은 위로만." },
  { rule_id: "EN-8", category: "진입", title: "주 수로 계산해 로그", description: "주문은 금액이 아니라 주 수로 계산해 주문 전 로그에 기록 (8/18 10주 오주문 재발 방지)." },
  { rule_id: "RR-1", category: "진입", title: "손익비 2:1 이상 사전 고정", description: "매수 전 손절가·목표가를 숫자로 기록하고 손익비 (목표-진입)/(진입-손절) 가 2:1~3:1 이상이어야 한다. 미기록 시 주문 거부." },
  { rule_id: "SZ-1", category: "진입", title: "종목당·업종당 비중 상한", description: "봇 계좌 잔고 기준 종목당·업종당 최대 비중(sb_settings)을 넘는 주문은 거부." },
  { rule_id: "EX-1", category: "손절·매도", title: "손절 -6% 장중 발동", description: "진입가 -6%. 장중에 손절가 닿으면 발동." },
  { rule_id: "EX-2", category: "손절·매도", title: "손절선 갱신: 종가×0.94, 1일 1회, 위로만", description: "갱신은 종가 기준 하루 한 번, 위로만 움직인다." },
  { rule_id: "EX-3", category: "손절·매도", title: "수익 구간 최소 본전", description: "수익 구간에서는 손절선을 최소 본전 이상으로." },
  { rule_id: "EX-4", category: "손절·매도", title: "매도 우선순위", description: "손절선 > 기준선 이탈 > 익절 > 추가매수." },
  { rule_id: "EX-5", category: "손절·매도", title: "스쿼트 정리", description: "돌파 후 고점 아래 마감 시 1~2일(길면 10일) 회복 대기. 20일선 아래 종가 마감 또는 손절선 도달 시 정리." },
  { rule_id: "EX-6", category: "손절·매도", title: "최대 하락폭 매도 검토", description: "2단계 시작 이후 최대 일간·주간 하락폭이 나오면 실적과 무관하게 매도 검토." },
  { rule_id: "EX-7", category: "손절·매도", title: "실패 재설정", description: "손절 후에도 관심종목 유지. 원래 피봇 재돌파 + 거래량이면 재매수. 아니면 새 베이스 대기." },
  { rule_id: "EX-8", category: "손절·매도", title: "연속 손실 시 축소", description: "연속 손실이 나면 포지션 크기를 줄인다." },
  { rule_id: "EV-1", category: "이벤트", title: "실적 발표 전 알림", description: "실적 발표 전 알림. 포지션 축소 여부는 비움 승인." },
  { rule_id: "EV-2", category: "이벤트", title: "장기 휴장 전 알림", description: "손절선이 며칠간 작동 못 하는 장기 휴장 전 알림. 갭하락 시 시초가 체결을 전제로 크기 결정." },
];

export const RULE_MAP: Record<string, Rule> = Object.fromEntries(RULES.map((r) => [r.rule_id, r]));
