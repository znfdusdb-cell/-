-- 8차: 인증 신고 + 관리자 불인정
alter table ch_checkins add column if not exists rejected_at timestamptz;
alter table ch_checkins add column if not exists rejected_reason text not null default '';

create table if not exists ch_reports (
  id uuid primary key default gen_random_uuid(),
  checkin_id uuid not null references ch_checkins(id) on delete cascade,
  reporter_id uuid not null references ch_users(id) on delete cascade,
  reason text not null default '',
  -- open: 대기 / accepted: 불인정 처리됨 / dismissed: 인증 인정(기각)
  status text not null default 'open' check (status in ('open', 'accepted', 'dismissed')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  unique (checkin_id, reporter_id)
);
create index if not exists ch_reports_status_idx on ch_reports (status, created_at desc);
alter table ch_reports enable row level security;
