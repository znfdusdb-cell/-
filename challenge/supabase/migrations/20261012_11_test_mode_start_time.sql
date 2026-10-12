-- 11차: 관리자 테스트 참여(숨김·24시간 업로드) + '지금부터 시작' (시작일에 이미 지난 시간대는 제외)
alter table ch_participations add column if not exists is_test boolean not null default false;
alter table ch_participations add column if not exists start_time text;
alter table ch_checkins add column if not exists is_test boolean not null default false;

-- 경험치 로그에 실제 반영된 양을 기록 (0 아래로는 안 깎이므로, 되돌릴 때 정확히 돌려주기 위해)
create or replace function ch_add_xp(p_user_id uuid, p_delta integer, p_reason text default '')
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare old_xp integer; new_xp integer;
begin
  select xp into old_xp from ch_users where id = p_user_id for update;
  if old_xp is null then
    raise exception 'user % not found', p_user_id;
  end if;
  new_xp := greatest(0, old_xp + p_delta);
  update ch_users set xp = new_xp where id = p_user_id;
  insert into ch_xp_log (user_id, delta, reason) values (p_user_id, new_xp - old_xp, coalesce(p_reason, ''));
  return new_xp;
end;
$$;
