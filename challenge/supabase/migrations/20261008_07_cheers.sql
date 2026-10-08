-- 7차: 갤러리 응원(좋아요)
create table if not exists ch_cheers (
  id uuid primary key default gen_random_uuid(),
  checkin_id uuid not null references ch_checkins(id) on delete cascade,
  user_id uuid not null references ch_users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (checkin_id, user_id)
);
create index if not exists ch_cheers_checkin_idx on ch_cheers (checkin_id);
alter table ch_cheers enable row level security;
