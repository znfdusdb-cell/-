-- =============================================================================
-- 5차 (2026-10-07): 변경 문(제안·설정 이력) + 리스크 다이얼 + 30거래 평가 + 기회 횟수. 전부 추가만.
-- 근거: bium-brain research swingbot_cc_request_2026-10-06_mcp_tools, _risk_dial
-- =============================================================================

-- ---------- 변경 문: 제안 → 비움 승인 → 다음 거래일 08:30 적용 ----------
do $$ begin
  create type sb_proposal_kind as enum ('setting','rule','stage');
exception when duplicate_object then null; end $$;
do $$ begin
  create type sb_proposal_status as enum ('pending','approved','rejected','applied');
exception when duplicate_object then null; end $$;

create table if not exists sb_proposals (
  id             bigserial primary key,
  kind           sb_proposal_kind not null,
  target         text not null,            -- setting: key / rule: rule_id / stage: 종목코드
  current_value  text,
  proposed_value text not null,            -- stage 면 목표 단계
  reason         text not null,
  evidence       text,                     -- setting: 근거(필수) / rule: 백테스트 결과 링크(필수) / stage: 선택
  plain          text,                     -- 쉬운 말 설명 (화면용)
  proposer       sb_actor not null,
  status         sb_proposal_status not null default 'pending',
  approved_at    timestamptz,
  apply_at       timestamptz,              -- 승인 시 다음 거래일 08:30 KST (장중 즉시 적용 금지)
  applied_at     timestamptz,
  decision_note  text,
  created_at     timestamptz not null default now(),
  constraint sb_proposals_evidence_required check (
    (kind = 'stage') or (evidence is not null and length(trim(evidence)) > 0)
  )
);
create index if not exists sb_proposals_status_idx on sb_proposals (status, created_at desc);

create table if not exists sb_settings_history (
  id          bigserial primary key,
  key         text not null,
  old_value   text,
  new_value   text,
  changed_by  sb_actor,
  proposal_id bigint references sb_proposals(id),
  reason      text,
  created_at  timestamptz not null default now()
);

-- 설정 변경은 전부 이력에 남긴다 (누가·왜는 세션 변수로 전달, 없으면 null)
create or replace function sb_settings_track() returns trigger
language plpgsql as $$
begin
  if new.value is distinct from old.value then
    insert into sb_settings_history (key, old_value, new_value, changed_by, proposal_id, reason)
    values (new.key, old.value, new.value,
            nullif(current_setting('sb.actor', true), '')::sb_actor,
            nullif(current_setting('sb.proposal_id', true), '')::bigint,
            nullif(current_setting('sb.reason', true), ''));
    new.updated_at := now();
  end if;
  return new;
end $$;
drop trigger if exists sb_settings_track on sb_settings;
create trigger sb_settings_track before update on sb_settings for each row execute function sb_settings_track();

-- 다음 거래일 08:30 KST (주말·공휴일은 sb_holidays 로 판단; 달력은 코드와 같은 내용을 넣어 둔다)
create table if not exists sb_holidays (
  day  date primary key,
  name text not null
);
insert into sb_holidays (day, name) values
  ('2025-01-01','신정'),('2025-01-27','임시공휴일'),('2025-01-28','설날 연휴'),('2025-01-29','설날'),('2025-01-30','설날 연휴'),
  ('2025-03-03','삼일절 대체공휴일'),('2025-05-01','근로자의 날'),('2025-05-05','어린이날·부처님오신날'),('2025-05-06','대체공휴일'),
  ('2025-06-03','대통령 선거일'),('2025-06-06','현충일'),('2025-08-15','광복절'),('2025-10-03','개천절'),('2025-10-06','추석'),
  ('2025-10-07','추석 연휴'),('2025-10-08','추석 대체공휴일'),('2025-10-09','한글날'),('2025-12-25','성탄절'),('2025-12-31','연말 휴장'),
  ('2026-01-01','신정'),('2026-02-16','설날 연휴'),('2026-02-17','설날'),('2026-02-18','설날 연휴'),('2026-03-02','삼일절 대체공휴일'),
  ('2026-05-01','근로자의 날'),('2026-05-05','어린이날'),('2026-05-25','부처님오신날 대체공휴일'),('2026-06-03','지방선거일'),
  ('2026-08-17','광복절 대체공휴일'),('2026-09-24','추석 연휴'),('2026-09-25','추석'),('2026-09-28','추석 대체공휴일'),
  ('2026-10-05','개천절 대체공휴일'),('2026-10-09','한글날'),('2026-12-25','성탄절'),('2026-12-31','연말 휴장')
on conflict (day) do nothing;

create or replace function sb_next_trading_day(p_from date) returns date
language plpgsql stable as $$
declare d date := p_from + 1;
begin
  while extract(isodow from d) in (6,7) or exists (select 1 from sb_holidays where day = d) loop
    d := d + 1;
  end loop;
  return d;
end $$;

-- 승인: 상태 approved + 적용 시각 = 다음 거래일 08:30 KST
create or replace function sb_approve_proposal(p_id bigint, p_note text default null) returns sb_proposals
language plpgsql as $$
declare r sb_proposals;
begin
  update sb_proposals
     set status = 'approved', approved_at = now(), decision_note = p_note,
         apply_at = (sb_next_trading_day((now() at time zone 'Asia/Seoul')::date)::text || ' 08:30')::timestamp at time zone 'Asia/Seoul'
   where id = p_id and status = 'pending'
   returning * into r;
  if r.id is null then raise exception '대기 중인 제안이 아니다: %', p_id; end if;
  return r;
end $$;

-- 적용: 봇(또는 크론)이 08:30 이후 호출. 설정 제안만 자동 적용. 규칙·단계 제안은 사람이 처리하고 applied 로 표시.
create or replace function sb_apply_due_proposals() returns integer
language plpgsql as $$
declare r record; n integer := 0;
begin
  for r in select * from sb_proposals where status = 'approved' and apply_at <= now() and kind = 'setting' loop
    perform set_config('sb.actor', 'bium', true);
    perform set_config('sb.proposal_id', r.id::text, true);
    perform set_config('sb.reason', r.reason, true);
    update sb_settings set value = r.proposed_value where key = r.target;
    if not found then insert into sb_settings (key, value) values (r.target, r.proposed_value); end if;
    update sb_proposals set status = 'applied', applied_at = now() where id = r.id;
    n := n + 1;
  end loop;
  return n;
end $$;

-- ---------- 리스크 다이얼 (RS-1) ----------
do $$ begin
  create type sb_risk_level as enum ('caution','normal','bold');
exception when duplicate_object then null; end $$;

-- 매일 장 전 봇이 판정해 기록. 사이트는 최신 행을 보여준다.
create table if not exists sb_risk_log (
  as_of              date primary key,
  level              sb_risk_level not null,
  prev_level         sb_risk_level,
  market_signal      sb_regime,
  consecutive_losses integer,
  trades_total       integer,            -- 누적 종료 거래 수
  ev_30_r            numeric(8,3),       -- 최근 30거래 평균 R (30건 미만이면 null)
  reasons            jsonb not null default '[]'::jsonb,
  created_at         timestamptz not null default now()
);

-- 포지션 종료 결과 (R 계산용). 봇이 종료 시 채운다.
alter table sb_positions
  add column if not exists initial_stop_price numeric(14,2),   -- 진입 시 계획 손절가 (리스크 금액의 기준)
  add column if not exists exit_price         numeric(14,2),
  add column if not exists realized_pnl       numeric(14,2),
  add column if not exists r_multiple         numeric(8,3);    -- 실현 손익 ÷ 진입 시 계획 리스크 금액

-- 계좌 전체 평가액 스냅샷 (목표 대비 페이스 계산용)
alter table sb_balance_snapshots add column if not exists total_value numeric(14,2);

-- ---------- 기회 횟수 지표 ----------
create table if not exists sb_signals (
  id          bigserial primary key,
  code        text not null references sb_stocks(code) on delete cascade,
  signal_date date not null,
  kind        text not null default 'pivot_breakout',   -- 규칙 신호 종류
  entered     boolean not null default false,            -- 실제 진입했나
  skip_reason text,                                      -- 진입 안 했으면 왜 (시장 폭풍, 비중 상한, 추격 금지 ...)
  note        text,
  created_at  timestamptz not null default now(),
  unique (code, signal_date, kind)
);

-- ---------- 설정 키 (Claude 초기값, 7단계 재검토) ----------
insert into sb_settings (key, value, decided_by, review_at) values
  ('risk_level',                 'normal', '봇이 매일 판정', '자동'),
  ('risk_stock_pct_caution',     '10',  'Claude 초기값', '7단계 백테스트'),
  ('risk_stock_pct_normal',      '20',  'Claude 초기값', '7단계 백테스트'),
  ('risk_stock_pct_bold',        '30',  'Claude 초기값', '7단계 백테스트'),
  ('risk_trade_pct_caution',     '0.6', 'Claude 초기값', '7단계 백테스트'),
  ('risk_trade_pct_normal',      '1.2', 'Claude 초기값', '7단계 백테스트'),
  ('risk_trade_pct_bold',        '1.8', 'Claude 초기값', '7단계 백테스트'),
  ('risk_min_trades_for_bold',   '30',  'Claude 초기값', '7단계 백테스트'),
  ('risk_consecutive_loss_down', '2',   'Claude 초기값', '7단계 백테스트'),
  ('target_return_pct_min',      '20',  '비움', '표시 전용'),
  ('target_return_pct_max',      '30',  '비움', '표시 전용'),
  ('universe_target_stocks',     '30',  'Claude 초기값', '7단계 백테스트'),
  ('universe_target_sectors',    '8',   'Claude 초기값', '7단계 백테스트'),
  ('universe_sector_warn_pct',   '40',  'Claude 초기값', '7단계 백테스트')
on conflict (key) do nothing;

-- ---------- 규칙 3개 ----------
insert into sb_rules (rule_id, category, title, description) values
  ('RS-1', '리스크', '리스크 다이얼', '조심(종목 10%·거래 리스크 0.6%) / 보통(20%·1.2%) / 과감(30%·1.8%), 업종 40% 고정. 매일 장 전 판정. 하향은 즉시(시장 흐림, 연속 손절 2회, 최근 30거래 기댓값 마이너스 중 하나), 상향은 한 단계씩(시장 맑음, 누적 30거래 이상, 최근 30거래 기댓값 플러스 전부). 단계 상한 초과 주문은 위반. MF-2는 조심 단계로 통합.'),
  ('RS-2', '리스크', '평가 단위 30거래', '성적 리뷰·규칙 변경 근거는 종료 거래 30건 단위만. 30건마다 리포트. 월 수익률은 표시만, 변경 근거 불가.'),
  ('RS-3', '리스크', '목표 수익률로 규칙 변경 금지', '목표 수익률로 비중·손절·진입 조건을 바꾸지 않는다. "목표 연 20~30% · 지금 페이스 연 N%" 표시만.')
on conflict (rule_id) do update set category = excluded.category, title = excluded.title, description = excluded.description;

alter table sb_proposals        enable row level security;
alter table sb_settings_history enable row level security;
alter table sb_holidays         enable row level security;
alter table sb_risk_log         enable row level security;
alter table sb_signals          enable row level security;
