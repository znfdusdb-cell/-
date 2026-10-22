-- =============================================================================
-- 7차 (2026-10-22): 10/21 삼성전자 수동 포지션 손실 정리에서 나온 규칙 4개. 전부 추가/교체만.
-- 근거: bium-brain research swingbot_lessons_2026-10-21
--   FN-1 투자금은 1년 안에 쓸 계획이 없는 돈만 (생활비 분리 확인 전엔 봇 매수 불가)
--   CD-1 손실 확정일 쿨다운: 손절·손실 정리가 체결된 거래일엔 신규 매수 금지 (1거래일)
--   UV-5 인버스·숏 금지 (공부·백테스트 전)
--   AL-1 가설 무효화 + 손절선 이탈 + 20일선 이탈 동시 성립 → '오늘 할 일' 최상단 빨간 경고 (사이트 계산)
-- 실행 순서: 이 파일 → supabase/seed.sql (삼성전자 10/21 정리 반영)
-- =============================================================================

-- ---------- 규칙 ----------
insert into sb_rules (rule_id, category, title, description) values
  ('FN-1', '자금',     '투자금은 1년 안에 안 쓸 돈만', '봇 계좌에는 1년 안에 쓸 계획이 없는 돈만 넣는다. 카드값·수술비·생활비는 계좌 밖에 따로. 비움이 사이트에서 "생활비 분리 확인"을 누르기 전엔 봇이 사지 않는다.'),
  ('CD-1', '진입',     '손실 확정일 신규 매수 금지',   '손절·손실 정리가 체결된 거래일에는 신규·추가 매수를 하지 않는다 (쿨다운 1거래일, sb_settings.loss_cooldown_trading_days). 복수 매매 차단.'),
  ('UV-5', '유니버스', '인버스·숏 금지',               '인버스·숏 상품은 규칙이 없다. 공부·백테스트 전엔 레이더 이후 단계로 올리지 않고 사지 않는다.'),
  ('AL-1', '손절·매도', '세 신호 동시 경고',            '가설 무효화 조건 성립 + 손절선 이탈 + 20일선 아래 종가가 동시에 켜지면 오늘 할 일 맨 위에 빨간 경고. 수동 보유도 포함 (손절선 없으면 평단 -6%).')
on conflict (rule_id) do update set category = excluded.category, title = excluded.title, description = excluded.description;

-- ---------- 설정 ----------
insert into sb_settings (key, value, decided_by, review_at) values
  ('living_fund_confirmed_at',   null, '비움', '1년마다 다시 확인'),   -- 생활비 분리 확인한 날 (null = 미확인 → 봇 매수 불가)
  ('loss_cooldown_trading_days', '1',  '비움 결정 (10/21 교훈)', '7단계 백테스트')
on conflict (key) do nothing;

-- ---------- UV-5: 인버스·숏은 검토 이상으로 못 올린다 ----------
create or replace function sb_is_inverse_short(p_name text) returns boolean
language sql immutable as $$
  select coalesce(p_name, '') ~* '(인버스|곱버스|inverse|숏|short|bear)';
$$;

create or replace function sb_guard_inverse() returns trigger
language plpgsql as $$
begin
  if new.stage in ('review','universe','holding') and sb_is_inverse_short(new.name) then
    raise exception 'UV-5: % (%) 는 인버스·숏 상품이라 규칙이 없다. 공부·백테스트 전엔 올리지 않는다', new.name, new.code;
  end if;
  return new;
end $$;
drop trigger if exists sb_stocks_guard_inverse on sb_stocks;
create trigger sb_stocks_guard_inverse
  before insert or update of stage, name on sb_stocks
  for each row execute function sb_guard_inverse();

-- ---------- CD-1: 오늘(KST)이 손실 확정일 쿨다운 안인가 ----------
-- 손실 확정 = 봇 계좌 포지션이 손실(realized_pnl < 0)로 닫혔거나, 봇의 손절(EX-1) 매도가 체결된 날.
create or replace function sb_last_loss_day() returns date
language sql stable as $$
  select max(d) from (
    select (closed_at at time zone 'Asia/Seoul')::date d from sb_positions
     where account = 'kis_bot' and closed_at is not null and realized_pnl < 0
    union all
    select (ts at time zone 'Asia/Seoul')::date from sb_orders_log
     where source = 'bot' and side = 'sell' and rule_id = 'EX-1'
  ) x;
$$;

create or replace function sb_in_loss_cooldown(p_day date default (now() at time zone 'Asia/Seoul')::date) returns boolean
language plpgsql stable as $$
declare
  n integer := coalesce((select value::integer from sb_settings where key = 'loss_cooldown_trading_days'), 1);
  last_loss date := sb_last_loss_day();
  d date;
  i integer := 1;
begin
  if last_loss is null or n <= 0 or p_day < last_loss then return false; end if;
  -- 손실일 포함 n 거래일 동안 매수 금지. n=1 이면 손실일 당일만.
  d := last_loss;
  while i < n loop d := sb_next_trading_day(d); i := i + 1; end loop;
  return p_day <= d;
end $$;

-- ---------- 봇 매수 전 관문: 막히는 이유 목록 (빈 배열 = 살 수 있음) ----------
-- 1차의 sb_can_buy(text) 는 '유니버스 단계'만 봤다. 보유 종목 피라미딩(EN-5·6)도 막혔고 MF-1 도 DB 에서 안 막았다.
-- 가격을 넘기면 보유 종목의 물타기(EN-7)도 막는다. 비중·손익비(SZ-1·RS-1·RR-1)는 주문 수량이 있어야 해서 봇 쪽 계산 + 사후 검증.
create or replace function sb_buy_blockers(p_code text, p_price numeric default null) returns text[]
language plpgsql stable as $$
declare
  out text[] := '{}';
  s record;
  regime sb_regime := (select signal from sb_market_regime order by as_of desc limit 1);
  avg numeric;
begin
  select code, name, stage into s from sb_stocks where code = p_code;
  if s.code is null then return array['UV-1: 종목 없음']; end if;
  if s.stage not in ('universe','holding') then
    out := out || ('UV-1: 단계가 ' || s.stage::text || ' (유니버스·보유만 매수)');
  end if;
  if sb_is_inverse_short(s.name) then out := out || 'UV-5: 인버스·숏 금지'::text; end if;
  if coalesce((select value from sb_settings where key = 'living_fund_confirmed_at'), '') = '' then
    out := out || 'FN-1: 생활비 분리 확인 전 (사이트에서 비움 확인 필요)'::text;
  end if;
  if sb_in_loss_cooldown() then
    out := out || ('CD-1: 손실 확정일 쿨다운 (마지막 손실 ' || sb_last_loss_day()::text || ')');
  end if;
  if regime = 'wait' then out := out || 'MF-1: 시장 폭풍(관망), 신규 진입 없음'::text; end if;
  if s.stage = 'holding' and p_price is not null then
    select avg_price into avg from sb_positions where code = p_code and account = 'kis_bot' and closed_at is null limit 1;
    if avg is not null and p_price < avg then
      out := out || ('EN-7: 평단 ' || round(avg)::text || ' 아래 추가 매수(물타기)');
    end if;
  end if;
  return out;
end $$;

drop function if exists sb_can_buy(text);
create or replace function sb_can_buy(p_code text, p_price numeric default null) returns boolean
language sql stable as $$
  select coalesce(array_length(sb_buy_blockers(p_code, p_price), 1), 0) = 0;
$$;

-- ---------- 생활비 분리 확인 (사이트 버튼). 확인 취소는 즉시, 확인은 다음 거래일 08:30 같은 지연 없이 바로 (돈의 성격 확인이라 규칙값 변경이 아님) ----------
create or replace function sb_confirm_living_fund(p_confirm boolean, p_note text default null) returns text
language plpgsql as $$
declare v text := case when p_confirm then (now() at time zone 'Asia/Seoul')::date::text else null end;
begin
  perform set_config('sb.actor', 'bium', true);
  perform set_config('sb.reason', coalesce(p_note, case when p_confirm then 'FN-1 생활비 분리 확인' else 'FN-1 확인 취소' end), true);
  update sb_settings set value = v where key = 'living_fund_confirmed_at';
  if not found then insert into sb_settings (key, value, decided_by, review_at) values ('living_fund_confirmed_at', v, '비움', '1년마다 다시 확인'); end if;
  return v;
end $$;

-- ---------- MCP sb_today 에 관문 상태 추가 ----------
create or replace function sb_today() returns jsonb
language sql stable as $$
  select jsonb_build_object(
    'as_of', (now() at time zone 'Asia/Seoul')::date,
    'regime', (select to_jsonb(r) - 'created_at' from sb_market_regime r order by as_of desc limit 1),
    'risk',   (select to_jsonb(r) - 'created_at' from sb_risk_log r order by as_of desc limit 1),
    'settings', (select jsonb_object_agg(key, value) from sb_settings),
    'gates', jsonb_build_object(
      'living_fund_confirmed_at', (select value from sb_settings where key = 'living_fund_confirmed_at'),
      'loss_cooldown', sb_in_loss_cooldown(),
      'last_loss_day', sb_last_loss_day()
    ),
    'pending_proposals', (select coalesce(jsonb_agg(to_jsonb(p)), '[]'::jsonb) from sb_proposals p where status = 'pending'),
    'todos', (
      select coalesce(jsonb_agg(jsonb_build_object('code', s.code, 'name', s.name, 'kind',
        case when t.status = 'suspect' then 'approve_exit'
             when t.status = 'draft' and jsonb_array_length(t.invalidation_conditions) > 0 then 'approve_thesis'
             when t.status = 'valid' then 'approve_universe' end)), '[]'::jsonb)
      from sb_stocks s
      left join lateral (select * from sb_theses where code = s.code order by created_at desc limit 1) t on true
      where s.stage = 'review' and t.id is not null
        and (t.status in ('suspect','valid') or (t.status = 'draft' and jsonb_array_length(t.invalidation_conditions) > 0))
    ),
    'pipeline', (select jsonb_object_agg(stage, n) from (select stage, count(*) n from sb_stocks group by stage) x),
    'upcoming_events', (select coalesce(jsonb_agg(to_jsonb(e) - 'created_at' order by event_date), '[]'::jsonb)
                        from sb_events e where event_date between (now() at time zone 'Asia/Seoul')::date and (now() at time zone 'Asia/Seoul')::date + 14),
    'note', 'AL-1 세 신호 동시 경고는 사이트가 일봉으로 계산한다 (오늘 할 일 맨 위)'
  );
$$;
