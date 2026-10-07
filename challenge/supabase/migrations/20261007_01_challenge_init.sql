-- 거너스 챌린지 (아스날 인사이드 톡방) 스키마. 접두사 ch_. 추가만 하는 마이그레이션.
-- 서버는 service_role 키로만 접근한다. RLS 는 켜 두고 정책을 두지 않아 anon 키로는 아무것도 못 본다.

create extension if not exists pgcrypto;

create table if not exists ch_users (
  id uuid primary key default gen_random_uuid(),
  username text not null unique,
  display_name text not null,
  password_hash text not null,
  role text not null default 'member' check (role in ('admin', 'member')),
  xp integer not null default 0 check (xp >= 0),
  created_at timestamptz not null default now(),
  last_login_at timestamptz
);

create table if not exists ch_challenges (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('diet', 'hobby', 'custom')),
  title text not null,
  description text not null default '',
  emoji text not null default '🏆',
  prize text not null default '메가커피 아메리카노 쿠폰',
  -- {"kind":"slots","slots":[{"key","label","start","end"}],"goal":"weight"|"none"}
  -- {"kind":"count","times":1,"period_days":7,"goal":"hobby"|"none"}
  config jsonb not null,
  created_by uuid references ch_users(id) on delete set null,
  is_default boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists ch_participations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references ch_users(id) on delete cascade,
  challenge_id uuid not null references ch_challenges(id) on delete cascade,
  joined_at timestamptz not null default now(),
  status text not null default 'active' check (status in ('active', 'left')),
  -- {"start_kg","target_kg","days"} 또는 {"hobby"}
  goal jsonb not null default '{}'::jsonb,
  unique (user_id, challenge_id)
);
create index if not exists ch_participations_challenge_idx on ch_participations (challenge_id) where status = 'active';

create table if not exists ch_checkins (
  id uuid primary key default gen_random_uuid(),
  participation_id uuid not null references ch_participations(id) on delete cascade,
  user_id uuid not null references ch_users(id) on delete cascade,
  challenge_id uuid not null references ch_challenges(id) on delete cascade,
  slot text not null,                       -- 시간대형: slot key / 횟수형: 'count'
  photo_path text not null,                 -- storage 'ch-photos' 버킷 안 경로
  taken_at timestamptz not null,            -- 촬영 시각(표시용)
  created_at timestamptz not null default now(), -- 서버 수신 시각(판정용)
  local_date date not null,                 -- KST 날짜
  note text not null default '',
  xp integer not null default 0
);
create index if not exists ch_checkins_challenge_date_idx on ch_checkins (challenge_id, local_date);
create index if not exists ch_checkins_participation_idx on ch_checkins (participation_id, local_date);

create table if not exists ch_xp_log (
  id bigserial primary key,
  user_id uuid not null references ch_users(id) on delete cascade,
  delta integer not null,
  reason text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists ch_xp_log_user_idx on ch_xp_log (user_id, created_at desc);

create table if not exists ch_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references ch_users(id) on delete cascade,
  endpoint text not null unique,
  keys jsonb not null,                      -- {"p256dh","auth"}
  user_agent text not null default '',
  created_at timestamptz not null default now()
);

-- 같은 알림을 두 번 보내지 않기 위한 키 (날짜:챌린지:슬롯:종류)
create table if not exists ch_notice_log (
  key text primary key,
  created_at timestamptz not null default now()
);

-- 경험치 가감 (원자적) + 로그. 0 아래로 내려가지 않는다. 새 xp 반환.
create or replace function ch_add_xp(p_user_id uuid, p_delta integer, p_reason text default '')
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare new_xp integer;
begin
  update ch_users set xp = greatest(0, xp + p_delta) where id = p_user_id returning xp into new_xp;
  if new_xp is null then
    raise exception 'user % not found', p_user_id;
  end if;
  insert into ch_xp_log (user_id, delta, reason) values (p_user_id, p_delta, coalesce(p_reason, ''));
  return new_xp;
end;
$$;

alter table ch_users enable row level security;
alter table ch_challenges enable row level security;
alter table ch_participations enable row level security;
alter table ch_checkins enable row level security;
alter table ch_xp_log enable row level security;
alter table ch_push_subscriptions enable row level security;
alter table ch_notice_log enable row level security;

-- 사진 버킷 (비공개, 서명 URL 로만 열람). Supabase 에서만 storage 스키마가 있으므로 있을 때만.
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'storage' and table_name = 'buckets') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('ch-photos', 'ch-photos', false, 8388608, array['image/jpeg', 'image/png', 'image/webp'])
    on conflict (id) do nothing;
  end if;
end $$;

-- 오래된 알림 중복 방지 키 정리 (선택): 30일 지난 행 삭제
create or replace function ch_prune_notice_log() returns void language sql as $$
  delete from ch_notice_log where created_at < now() - interval '30 days';
$$;
