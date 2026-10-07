-- 3차: 손실 프레이밍(벌칙·탈락 조건), 체중 기록, 링크 인증, 취미 인증 방식
alter table ch_challenges add column if not exists penalty text not null default '톡방에 메가커피 아메리카노 쿠폰 쏘기';
-- 실패 n번이면 탈락 (0 = 탈락 없음)
alter table ch_challenges add column if not exists max_fails integer not null default 3 check (max_fails >= 0);

-- 인증 매체에 링크 추가
alter table ch_checkins drop constraint if exists ch_checkins_media_type_check;
alter table ch_checkins add constraint ch_checkins_media_type_check check (media_type in ('camera', 'album', 'audio', 'link'));
alter table ch_checkins add column if not exists link_url text not null default '';
alter table ch_checkins alter column photo_path set default '';

-- 체중 기록 (본인만 봄)
create table if not exists ch_weight_logs (
  id uuid primary key default gen_random_uuid(),
  participation_id uuid not null references ch_participations(id) on delete cascade,
  user_id uuid not null references ch_users(id) on delete cascade,
  local_date date not null,
  kg numeric(5,1) not null check (kg > 0),
  created_at timestamptz not null default now(),
  unique (participation_id, local_date)
);
alter table ch_weight_logs enable row level security;
