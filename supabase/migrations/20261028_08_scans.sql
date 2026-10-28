-- =============================================================================
-- 8차 (2026-10-28): 레이더 전 종목 스캔 요약. 전 종목 일봉은 VPS 로컬 캐시에만 두고 여기엔 요약만.
-- =============================================================================
create table if not exists sb_scans (
  as_of         date primary key,
  universe_n    integer,          -- 스캔한 보통주 수
  rs_n          integer,          -- 상대강도 계산된 종목 수
  price_pass_n  integer,          -- 트렌드 템플레이트 1~7 + RS 70+ + 유동성 통과
  fund_pass_n   integer,          -- + DART 실적 거름 통과
  added         jsonb not null default '[]'::jsonb,   -- 오늘 레이더에 넣은 종목
  top           jsonb not null default '[]'::jsonb,   -- 가격 통과 상위 60 (RS 순, 실적 판정 포함)
  rs_mine       jsonb not null default '{}'::jsonb,   -- sb_stocks 종목의 RS (셋업 TT8 용)
  seconds       integer,
  kis_fail_n    integer,
  notes         text,
  created_at    timestamptz not null default now()
);
alter table sb_scans enable row level security;
