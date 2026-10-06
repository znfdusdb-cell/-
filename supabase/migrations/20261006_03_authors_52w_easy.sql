-- =============================================================================
-- 스윙봇 3차 마이그레이션 (2026-10-06, 모바일 검토 반영). 전부 추가만.
-- =============================================================================

-- 작성자에 claude_code 추가. 가설 작성자를 지어내지 않는다: 초안은 claude_code, 승인은 사이트 버튼으로만.
alter type sb_actor add value if not exists 'claude_code';

-- 가설 상태에 draft(비움 미승인) 추가. UV-2 는 status='valid' 만 인정하므로 draft 는 유니버스 승인 불가.
alter type sb_thesis_status add value if not exists 'draft';

-- 셋업: 52주 고가·저가(최근 252거래일), 베이스 시작일(직전 2단계 고점)
alter table sb_setups
  add column if not exists high_52w   numeric(14,2),
  add column if not exists high_52w_date date,
  add column if not exists low_52w    numeric(14,2),
  add column if not exists low_52w_date  date,
  add column if not exists base_start date;

-- 이벤트 출처
alter table sb_events add column if not exists source text not null default 'brain';  -- brain / bium / seed / kis / dart

-- 가설 승인 이력
create table if not exists sb_thesis_log (
  id         bigserial primary key,
  thesis_id  bigint not null references sb_theses(id) on delete cascade,
  from_status sb_thesis_status,
  to_status   sb_thesis_status not null,
  actor      sb_actor not null,
  note       text,
  created_at timestamptz not null default now()
);
alter table sb_thesis_log enable row level security;
