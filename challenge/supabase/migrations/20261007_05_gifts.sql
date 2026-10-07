-- 5차: 탈락 벌칙 기프티콘 선물함
create table if not exists ch_gifts (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references ch_challenges(id) on delete cascade,
  from_user_id uuid not null references ch_users(id) on delete cascade,
  to_user_id uuid references ch_users(id) on delete set null,   -- 받을 사람이 없으면 null
  photo_path text not null,
  created_at timestamptz not null default now(),
  opened_at timestamptz
);
create index if not exists ch_gifts_to_idx on ch_gifts (to_user_id, opened_at);
alter table ch_gifts enable row level security;
