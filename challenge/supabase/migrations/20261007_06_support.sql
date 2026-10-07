-- 6차: 개발자 문의·오류 신고 채팅
create table if not exists ch_tickets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references ch_users(id) on delete cascade,
  status text not null default 'open' check (status in ('open', 'resolved')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz,
  -- 마지막으로 읽은 시각 (배지용)
  user_read_at timestamptz,
  admin_read_at timestamptz
);
create index if not exists ch_tickets_status_idx on ch_tickets (status, updated_at desc);

create table if not exists ch_ticket_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references ch_tickets(id) on delete cascade,
  sender_id uuid not null references ch_users(id) on delete cascade,
  body text not null default '',
  photo_path text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists ch_ticket_messages_ticket_idx on ch_ticket_messages (ticket_id, created_at);

alter table ch_tickets enable row level security;
alter table ch_ticket_messages enable row level security;
