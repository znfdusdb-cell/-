-- 9차: 인증 사진 댓글 (챌린지별 온오프)
alter table ch_challenges add column if not exists comments_enabled boolean not null default true;
create table if not exists ch_comments (
  id uuid primary key default gen_random_uuid(),
  checkin_id uuid not null references ch_checkins(id) on delete cascade,
  user_id uuid not null references ch_users(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 200),
  created_at timestamptz not null default now()
);
create index if not exists ch_comments_checkin_idx on ch_comments (checkin_id);
alter table ch_comments enable row level security;
