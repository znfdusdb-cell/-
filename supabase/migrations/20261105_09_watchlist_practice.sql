-- =============================================================================
-- 9차 (2026-11-05, 팀장 지시서 일감 A): 연습 모드 장중 루프. 추가만.
-- 연습 모드는 주문을 내지 않는다. 주문서를 sb_orders_log(source='practice')에 기록만 한다.
-- =============================================================================
alter type sb_order_source add value if not exists 'practice';

-- 내일 감시 목록: bot.daily 가 16:20 일봉·셋업 뒤에 만든다. 유니버스·보유 중 2단계+피봇, 최대 40개(KIS 실시간 등록 한도).
create table if not exists sb_watchlist (
  as_of      date not null,                                   -- 데이터 기준일(이 날 일봉으로 계산). 장중 루프는 오늘보다 앞선 최신 as_of 를 쓴다
  code       text not null references sb_stocks(code) on delete cascade,
  pivot      numeric(14,2),
  stop       numeric(14,2),                                   -- 피봇에 체결될 때의 손절선(피봇 x 0.94). 실제 손절선은 체결가 기준
  vol50      bigint,                                          -- 50일 평균 일거래량 (EN-1 거래량 기준)
  reason     text,
  created_at timestamptz not null default now(),
  primary key (as_of, code)
);
alter table sb_watchlist enable row level security;
