-- 10차: AI 칼로리 추정 (식단 인증 사진 → 예상 kcal, 기준 초과 시 관리자 검토)
alter table ch_challenges add column if not exists kcal_limit integer not null default 700;
alter table ch_checkins add column if not exists ai_kcal integer;
alter table ch_checkins add column if not exists ai_note text not null default '';
alter table ch_checkins add column if not exists ai_flagged boolean not null default false;
