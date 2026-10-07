-- 4차: 캐릭터 성별 (가입 때 선택, 내 정보에서 변경)
alter table ch_users add column if not exists gender text not null default 'm' check (gender in ('m', 'f'));
