-- =============================================================================
-- 스윙봇 관제 사이트 — 초기 스키마 (2026-10-06)
-- 대상: bium-brain Supabase (public 스키마). 기존 테이블과 겹치지 않도록
-- 모든 테이블에 sb_ 접두사를 붙였다 (events / predictions / actions 같은
-- 일반 명사 충돌 방지). 기존 테이블은 건드리지 않는다. 전부 IF NOT EXISTS.
-- 실행: Supabase SQL Editor에 붙여넣고 Run.
-- =============================================================================

create extension if not exists pgcrypto;

-- ---------- 열거형 ----------
do $$ begin
  create type sb_stage as enum ('radar','review','universe','holding','exited');
exception when duplicate_object then null; end $$;

do $$ begin
  create type sb_market as enum ('KOSPI','KOSDAQ');
exception when duplicate_object then null; end $$;

do $$ begin
  create type sb_actor as enum ('brain','bium','bot');
exception when duplicate_object then null; end $$;

do $$ begin
  create type sb_thesis_status as enum ('valid','suspect','discarded');
exception when duplicate_object then null; end $$;

do $$ begin
  create type sb_setup_type as enum ('vcp','cup3c','flat','power_play','none');
exception when duplicate_object then null; end $$;

do $$ begin
  create type sb_position_state as enum ('scout','tranche1','tranche2','tranche3','squat_wait','reset_watch','closed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type sb_side as enum ('buy','sell');
exception when duplicate_object then null; end $$;

do $$ begin
  create type sb_regime as enum ('trade','reduce','wait');
exception when duplicate_object then null; end $$;

do $$ begin
  create type sb_event_type as enum ('earnings','holiday','macro','other');
exception when duplicate_object then null; end $$;

-- ---------- 규칙 카탈로그 (orders_log.rule_id 가 가리키는 대상) ----------
create table if not exists sb_rules (
  rule_id     text primary key,            -- 예: EN-1
  category    text not null,
  title       text not null,
  description text not null,
  created_at  timestamptz not null default now()
);

-- ---------- 종목 (파이프라인 카드) ----------
create table if not exists sb_stocks (
  code             text primary key,       -- 6자리 종목코드
  name             text not null,
  market           sb_market not null,
  sector           text,
  stage            sb_stage not null default 'radar',
  stage_changed_at timestamptz not null default now(),
  stage_reason     text,
  is_seed          boolean not null default false,   -- 가짜 시드 카드 표시
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists sb_stocks_stage_idx on sb_stocks (stage);

-- ---------- 단계 이동 이력 ----------
create table if not exists sb_stage_log (
  id         bigserial primary key,
  code       text not null references sb_stocks(code) on delete cascade,
  from_stage sb_stage,
  to_stage   sb_stage not null,
  reason     text,
  actor      sb_actor not null default 'bium',
  created_at timestamptz not null default now()
);
create index if not exists sb_stage_log_code_idx on sb_stage_log (code, created_at desc);

-- ---------- 가설 + 무효화 조건 ----------
-- invalidation_conditions: [{"text": "...", "violated": false, "note": null}, ...]
create table if not exists sb_theses (
  id                      bigserial primary key,
  code                    text not null references sb_stocks(code) on delete cascade,
  hypothesis              text not null,
  invalidation_conditions jsonb not null default '[]'::jsonb,
  author                  sb_actor not null default 'bium',
  status                  sb_thesis_status not null default 'valid',
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  constraint sb_theses_conditions_is_array check (jsonb_typeof(invalidation_conditions) = 'array')
);
create index if not exists sb_theses_code_idx on sb_theses (code, created_at desc);

-- ---------- 셋업 (봇이 매일 계산) ----------
create table if not exists sb_setups (
  id                   bigserial primary key,
  code                 text not null references sb_stocks(code) on delete cascade,
  as_of                date not null,
  setup_type           sb_setup_type not null default 'none',
  footprint_weeks      integer,            -- 발자국 W
  max_contraction_pct  numeric(6,2),       -- 발자국 최대조정
  min_contraction_pct  numeric(6,2),       -- 발자국 최소조정
  t_count              integer,            -- 발자국 T
  pivot                numeric(14,2),      -- C 박스/베이스 고점
  cbox_high            numeric(14,2),
  cbox_low             numeric(14,2),
  cbox_start           date,               -- C 박스 시작일 (차트 띠 표시용)
  volume_dry_days      integer,            -- 거래량 50일 평균 이하 연속 일수
  trend_template       jsonb not null default '[]'::jsonb,  -- [{key,label,pass,value}] 8개
  trend_template_score integer not null default 0 check (trend_template_score between 0 and 8),
  checklist            jsonb not null default '[]'::jsonb,  -- [{key,label,pass,value}] 7개
  checklist_score      integer not null default 0 check (checklist_score between 0 and 7),
  drawdown_pct         numeric(6,2),       -- 고점 대비 조정
  market_drawdown_pct  numeric(6,2),       -- 같은 기간 시장 조정
  drawdown_vs_market   numeric(6,2),       -- 시장 대비 조정 배수
  notes                text,
  created_at           timestamptz not null default now(),
  unique (code, as_of)
);

-- ---------- 포지션 ----------
create table if not exists sb_positions (
  id            bigserial primary key,
  code          text not null references sb_stocks(code) on delete cascade,
  qty           integer not null check (qty >= 0),
  avg_price     numeric(14,2) not null,
  stop_price    numeric(14,2) not null,
  state         sb_position_state not null default 'scout',
  entry_rule_id text references sb_rules(rule_id),
  opened_at     timestamptz not null default now(),
  closed_at     timestamptz,
  updated_at    timestamptz not null default now()
);
create index if not exists sb_positions_open_idx on sb_positions (code) where closed_at is null;

-- ---------- 주문 로그 (근거 규칙 ID 필수 지향) ----------
create table if not exists sb_orders_log (
  id           bigserial primary key,
  ts           timestamptz not null default now(),
  code         text not null references sb_stocks(code) on delete cascade,
  side         sb_side not null,
  qty          integer not null check (qty > 0),
  price        numeric(14,2) not null,
  rule_id      text references sb_rules(rule_id),
  rule_text    text,
  is_violation boolean not null default false,   -- 규칙 밖 주문 (rule_id 없음 또는 위반 판정)
  note         text,
  position_id  bigint references sb_positions(id)
);
create index if not exists sb_orders_log_ts_idx on sb_orders_log (ts desc);

-- ---------- 이벤트 (종목별·시장) ----------
create table if not exists sb_events (
  id         bigserial primary key,
  code       text references sb_stocks(code) on delete cascade,  -- null이면 시장 전체
  event_type sb_event_type not null default 'other',
  title      text not null,
  event_date date not null,
  note       text,
  created_at timestamptz not null default now()
);
create index if not exists sb_events_date_idx on sb_events (event_date);

-- ---------- 가설 장부 (예측 → 결과) ----------
create table if not exists sb_predictions (
  id          bigserial primary key,
  code        text references sb_stocks(code) on delete set null,
  statement   text not null,
  deadline    date not null,
  outcome     text,
  hit         boolean,
  created_at  timestamptz not null default now(),
  resolved_at timestamptz
);

-- ---------- 시장 신호 (날짜별) ----------
create table if not exists sb_market_regime (
  as_of                      date primary key,
  signal                     sb_regime not null,
  kospi_close                numeric(12,2),
  kospi_ma200                numeric(12,2),
  kospi_ma200_slope_pct      numeric(6,2),
  kosdaq_close               numeric(12,2),
  kosdaq_ma200               numeric(12,2),
  kosdaq_ma200_slope_pct     numeric(6,2),
  vkospi                     numeric(6,2),
  lev_etf_turnover_share_pct numeric(6,2),  -- 단일종목 레버리지 ETF 거래대금 비중
  reasons                    jsonb not null default '[]'::jsonb,  -- ["..."]
  created_at                 timestamptz not null default now()
);

-- ---------- 일봉 (차트용, 봇이 적재) ----------
create table if not exists sb_candles (
  code   text not null references sb_stocks(code) on delete cascade,
  date   date not null,
  open   numeric(14,2) not null,
  high   numeric(14,2) not null,
  low    numeric(14,2) not null,
  close  numeric(14,2) not null,
  volume bigint not null default 0,
  primary key (code, date)
);

-- =============================================================================
-- 가드: 유니버스 승인은 유효한 가설 + 무효화 조건 1개 이상일 때만 (UV-2)
-- 사이트가 막아도 DB에서 한 번 더 막는다.
-- =============================================================================
create or replace function sb_guard_universe() returns trigger
language plpgsql as $$
begin
  if new.stage = 'universe' and (old.stage is distinct from 'universe') then
    if not exists (
      select 1 from sb_theses t
      where t.code = new.code
        and t.status = 'valid'
        and jsonb_array_length(t.invalidation_conditions) >= 1
    ) then
      raise exception 'UV-2: % 는 유효한 가설과 무효화 조건(1개 이상)이 없어 유니버스 승인 불가', new.code;
    end if;
  end if;
  new.updated_at := now();
  if new.stage is distinct from old.stage then
    new.stage_changed_at := now();
  end if;
  return new;
end $$;

drop trigger if exists sb_stocks_guard_universe on sb_stocks;
create trigger sb_stocks_guard_universe
  before update on sb_stocks
  for each row execute function sb_guard_universe();

-- =============================================================================
-- RLS: 사이트는 서버에서 service_role 로만 접근한다. anon 은 전부 차단.
-- =============================================================================
alter table sb_rules         enable row level security;
alter table sb_stocks        enable row level security;
alter table sb_stage_log     enable row level security;
alter table sb_theses        enable row level security;
alter table sb_setups        enable row level security;
alter table sb_positions     enable row level security;
alter table sb_orders_log    enable row level security;
alter table sb_events        enable row level security;
alter table sb_predictions   enable row level security;
alter table sb_market_regime enable row level security;
alter table sb_candles       enable row level security;
