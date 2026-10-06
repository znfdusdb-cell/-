-- =============================================================================
-- 스윙봇 2차 마이그레이션 (2026-10-06, 비움 수정 요청 반영). 전부 추가만.
-- 1차(20261006_swingbot_init.sql) 실행 후 SQL Editor 에서 실행.
-- =============================================================================

-- ---------- 계좌 구분: 한투 봇 계좌 / KB 수동 보유 ----------
do $$ begin
  create type sb_account as enum ('kis_bot','kb_manual');
exception when duplicate_object then null; end $$;

alter type sb_position_state add value if not exists 'manual';

alter table sb_positions
  add column if not exists account sb_account not null default 'kis_bot',
  alter column stop_price drop not null;          -- KB 수동 보유는 봇 손절선이 없다

-- 확인된 시점의 잔고 스냅샷 (체결 이력을 지어내지 않기 위한 테이블)
create table if not exists sb_balance_snapshots (
  id           bigserial primary key,
  account      sb_account not null,
  code         text references sb_stocks(code) on delete cascade,   -- null 이면 계좌 전체(예수금 등)
  as_of        timestamptz not null,
  qty          integer,
  avg_price    numeric(14,2),
  market_price numeric(14,2),
  cash         numeric(14,2),
  note         text,
  created_at   timestamptz not null default now()
);
create index if not exists sb_balance_snapshots_code_idx on sb_balance_snapshots (code, as_of desc);

-- ---------- 주문 로그: RR-1 / SZ-1 판정에 필요한 값 ----------
alter table sb_orders_log
  add column if not exists stop_price         numeric(14,2),   -- RR-1 매수 전 고정한 손절가
  add column if not exists target_price       numeric(14,2),   -- RR-1 매수 전 고정한 목표가
  add column if not exists account_balance_at numeric(14,2);   -- SZ-1 주문 시각 봇 계좌 잔고(평가액+예수금)

-- ---------- 셋업: 비교 지수, 데이터 출처 ----------
alter table sb_setups
  add column if not exists benchmark   text,                        -- UV-4 비교 지수 (KOSPI/KOSDAQ/SOX ...)
  add column if not exists data_source text not null default 'bot'; -- 'seed' = 가짜 일봉으로 계산

-- ---------- 일봉·시장 신호: 출처 ----------
alter table sb_candles       add column if not exists source  text not null default 'kis';  -- 'seed' = 가짜
alter table sb_market_regime add column if not exists is_seed boolean not null default false;

-- ---------- 설정 키 추가 (값 null = 비움 미확정) ----------
insert into sb_settings (key, value) values
  ('max_weight_per_stock_pct',  null),   -- SZ-1 종목당 비중 상한 (%), 봇 계좌 잔고 기준
  ('max_weight_per_sector_pct', null),   -- SZ-1 업종당 비중 상한 (%)
  ('bot_account_balance',       null),   -- 봇 계좌 잔고 (봇이 갱신, 원)
  ('uv4_drawdown_pct',          '60'),   -- UV-4 고점 대비 조정 상한 (%)
  ('uv4_market_multiple',       '2'),    -- UV-4 시장 대비 조정 배수 상한 (확정본 "2~3배", 보수적으로 2)
  ('regime_vkospi_reduce',      null),   -- 시장 필터 임계값: VKOSPI 이상이면 축소 (4단계 검증 때 확정)
  ('regime_vkospi_wait',        null),   -- VKOSPI 이상이면 관망
  ('regime_lev_etf_share_reduce', null), -- 단일종목 레버리지 ETF 거래대금 비중(%) 이상이면 축소
  ('regime_ma200_slope_min_pct', null)   -- 200일선 기울기 최소치(%) — 미만이면 관망
on conflict (key) do nothing;

-- ---------- 규칙 3개 추가 ----------
insert into sb_rules (rule_id, category, title, description) values
  ('RR-1', '진입',     '손익비 2:1 이상 사전 고정', '매수 전 손절가·목표가를 숫자로 기록하고 손익비(목표-진입)/(진입-손절)가 2:1~3:1 이상이어야 한다. 미기록 시 주문 거부.'),
  ('SZ-1', '진입',     '종목당·업종당 비중 상한',   '봇 계좌 잔고 기준 종목당·업종당 최대 비중(sb_settings)을 넘는 주문은 거부.'),
  ('UV-4', '유니버스', '제외 조건',                 '고점 대비 60% 이상 조정, 또는 같은 기간 비교 지수 대비 2배 이상 조정한 종목은 유니버스 승인 불가. 대형 지수 비중주는 코스피 대신 반도체지수·코스닥 등으로 비교.')
on conflict (rule_id) do update set category = excluded.category, title = excluded.title, description = excluded.description;

-- ---------- UV-4 를 유니버스 승인 가드에 추가 ----------
create or replace function sb_guard_universe() returns trigger
language plpgsql as $$
declare
  s record;
  dd_limit numeric := coalesce((select value::numeric from sb_settings where key = 'uv4_drawdown_pct'), 60);
  mult_limit numeric := coalesce((select value::numeric from sb_settings where key = 'uv4_market_multiple'), 2);
begin
  if new.stage = 'universe' and (old.stage is distinct from 'universe') then
    if not exists (
      select 1 from sb_theses t
      where t.code = new.code and t.status = 'valid' and jsonb_array_length(t.invalidation_conditions) >= 1
    ) then
      raise exception 'UV-2: % 는 유효한 가설과 무효화 조건(1개 이상)이 없어 유니버스 승인 불가', new.code;
    end if;
    select drawdown_pct, drawdown_vs_market, benchmark into s
      from sb_setups where code = new.code order by as_of desc limit 1;
    if s.drawdown_pct is not null and abs(s.drawdown_pct) >= dd_limit then
      raise exception 'UV-4: % 고점 대비 조정 % 가 상한 % 이상 (단위 %%)', new.code, abs(s.drawdown_pct), dd_limit;
    end if;
    if s.drawdown_vs_market is not null and s.drawdown_vs_market >= mult_limit then
      raise exception 'UV-4: % 비교지수(%) 대비 조정 배수 % 가 상한 % 이상', new.code, coalesce(s.benchmark,'?'), s.drawdown_vs_market, mult_limit;
    end if;
  end if;
  new.updated_at := now();
  if new.stage is distinct from old.stage then
    new.stage_changed_at := now();
  end if;
  return new;
end $$;

alter table sb_balance_snapshots enable row level security;
