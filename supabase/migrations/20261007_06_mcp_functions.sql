-- =============================================================================
-- 6차 (2026-10-07): bium-brain MCP 도구용 DB 함수. VPS 쪽 도구는 이 함수를 RPC 한 번 호출하면 된다.
-- 근거: swingbot_cc_request_2026-10-06_mcp_tools. 주문 관련 함수는 없다(대화 경로 주문 전면 금지).
-- =============================================================================

-- ---------- 읽기 ----------
create or replace function sb_today() returns jsonb
language sql stable as $$
  select jsonb_build_object(
    'as_of', (now() at time zone 'Asia/Seoul')::date,
    'regime', (select to_jsonb(r) - 'created_at' from sb_market_regime r order by as_of desc limit 1),
    'risk',   (select to_jsonb(r) - 'created_at' from sb_risk_log r order by as_of desc limit 1),
    'settings', (select jsonb_object_agg(key, value) from sb_settings),
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
                        from sb_events e where event_date between (now() at time zone 'Asia/Seoul')::date and (now() at time zone 'Asia/Seoul')::date + 14)
  );
$$;

create or replace function sb_card(p_code text) returns jsonb
language sql stable as $$
  select jsonb_build_object(
    'stock',    (select to_jsonb(s) from sb_stocks s where code = p_code),
    'thesis',   (select to_jsonb(t) from sb_theses t where code = p_code order by created_at desc limit 1),
    'setup',    (select to_jsonb(u) from sb_setups u where code = p_code order by as_of desc limit 1),
    'position', (select to_jsonb(p) from sb_positions p where code = p_code and closed_at is null limit 1),
    'snapshots',(select coalesce(jsonb_agg(to_jsonb(b) order by as_of desc), '[]'::jsonb) from sb_balance_snapshots b where code = p_code),
    'events',   (select coalesce(jsonb_agg(to_jsonb(e) order by event_date), '[]'::jsonb) from sb_events e where (code = p_code or code is null) and event_date >= (now() at time zone 'Asia/Seoul')::date),
    'stage_log',(select coalesce(jsonb_agg(to_jsonb(l) order by created_at desc), '[]'::jsonb) from (select * from sb_stage_log where code = p_code order by created_at desc limit 20) l),
    'orders',   (select coalesce(jsonb_agg(to_jsonb(o) order by ts desc), '[]'::jsonb) from (select * from sb_orders_log where code = p_code order by ts desc limit 30) o),
    'last_close', (select close from sb_candles where code = p_code order by date desc limit 1),
    'candles_count', (select count(*) from sb_candles where code = p_code and source <> 'seed')
  );
$$;

create or replace function sb_setups_of(p_code text, p_limit integer default 30) returns jsonb
language sql stable as $$
  select coalesce(jsonb_agg(to_jsonb(u) order by as_of desc), '[]'::jsonb)
  from (select * from sb_setups where code = p_code order by as_of desc limit p_limit) u;
$$;

create or replace function sb_orders_between(p_from date, p_to date) returns jsonb
language sql stable as $$
  select coalesce(jsonb_agg(to_jsonb(o) order by ts desc), '[]'::jsonb)
  from sb_orders_log o where (o.ts at time zone 'Asia/Seoul')::date between p_from and p_to;
$$;

-- 위반: 검증 함수(verify.ts)와 같은 판정을 DB에서 전부 재현하진 않는다. 봇 자진 신고 + 근거 없는 주문만.
-- 사이트의 규칙 로그 화면이 완전판이다. MCP 답변은 이 함수 + "자세한 판정은 사이트 기록 화면"으로 안내.
create or replace function sb_violations(p_days integer default 90) returns jsonb
language sql stable as $$
  select jsonb_build_object(
    'bot_started_at', (select value from sb_settings where key = 'bot_started_at'),
    'self_reported', (select coalesce(jsonb_agg(to_jsonb(o) order by ts desc), '[]'::jsonb)
                      from sb_orders_log o where source = 'bot' and (is_violation or rule_id is null) and ts >= now() - (p_days || ' days')::interval),
    'note', '완전한 대조 판정(UV-1·EN-2·EN-7·EN-8·RR-1·SZ-1·RS-1·EX-1·EV-2)은 사이트 기록 화면 기준'
  );
$$;

-- ---------- 초안 (항상 비움 미승인) ----------
create or replace function sb_draft_thesis(p_code text, p_hypothesis text, p_conditions jsonb, p_plain text default null, p_actor sb_actor default 'claude_code') returns sb_theses
language plpgsql as $$
declare r sb_theses;
begin
  if jsonb_typeof(p_conditions) <> 'array' then raise exception '무효화 조건은 배열이어야 한다 [{text, plain}]'; end if;
  if not exists (select 1 from sb_stocks where code = p_code) then raise exception '종목 없음: %', p_code; end if;
  insert into sb_theses (code, hypothesis, hypothesis_plain, invalidation_conditions, author, status)
  values (p_code, p_hypothesis, p_plain,
          (select jsonb_agg(jsonb_build_object('text', c->>'text', 'plain', c->>'plain', 'violated', false, 'note', null)) from jsonb_array_elements(p_conditions) c),
          p_actor, 'draft')
  returning * into r;
  insert into sb_thesis_log (thesis_id, from_status, to_status, actor, note) values (r.id, null, 'draft', p_actor, 'MCP 초안');
  return r;
end $$;

create or replace function sb_add_radar(p_code text, p_name text, p_market sb_market, p_sector text, p_reason text, p_actor sb_actor default 'brain') returns sb_stocks
language plpgsql as $$
declare r sb_stocks;
begin
  if coalesce(trim(p_reason), '') = '' then raise exception '레이더 투입 이유가 필요하다'; end if;
  insert into sb_stocks (code, name, market, sector, stage, stage_reason)
  values (p_code, p_name, p_market, p_sector, 'radar', p_reason)
  on conflict (code) do nothing
  returning * into r;
  if r.code is null then raise exception '이미 있는 종목: % (단계 이동은 sb_propose_stage)', p_code; end if;
  insert into sb_stage_log (code, from_stage, to_stage, reason, actor) values (p_code, null, 'radar', p_reason, p_actor);
  return r;
end $$;

-- ---------- 제안 (적용은 비움 사이트 승인) ----------
create or replace function sb_propose_setting(p_key text, p_value text, p_reason text, p_evidence text, p_plain text default null, p_actor sb_actor default 'brain') returns sb_proposals
language plpgsql as $$
declare r sb_proposals;
begin
  if coalesce(trim(p_evidence), '') = '' then raise exception '근거가 비면 설정 제안을 받지 않는다'; end if;
  insert into sb_proposals (kind, target, current_value, proposed_value, reason, evidence, plain, proposer)
  values ('setting', p_key, (select value from sb_settings where key = p_key), p_value, p_reason, p_evidence, p_plain, p_actor)
  returning * into r;
  return r;
end $$;

create or replace function sb_propose_rule(p_rule_id text, p_change text, p_backtest_link text, p_reason text, p_plain text default null, p_actor sb_actor default 'brain') returns sb_proposals
language plpgsql as $$
declare r sb_proposals;
begin
  if coalesce(trim(p_backtest_link), '') = '' then raise exception '백테스트 결과 없이는 규칙 변경을 제안할 수 없다'; end if;
  if not exists (select 1 from sb_rules where rule_id = p_rule_id) then raise exception '규칙 없음: %', p_rule_id; end if;
  insert into sb_proposals (kind, target, current_value, proposed_value, reason, evidence, plain, proposer)
  values ('rule', p_rule_id, (select description from sb_rules where rule_id = p_rule_id), p_change, p_reason, p_backtest_link, p_plain, p_actor)
  returning * into r;
  return r;
end $$;

create or replace function sb_propose_stage(p_code text, p_to sb_stage, p_reason text, p_plain text default null, p_actor sb_actor default 'brain') returns sb_proposals
language plpgsql as $$
declare r sb_proposals;
begin
  if p_to in ('holding') then raise exception '보유 단계 진입은 봇 체결로만 일어난다'; end if;
  insert into sb_proposals (kind, target, current_value, proposed_value, reason, plain, proposer)
  values ('stage', p_code, (select stage::text from sb_stocks where code = p_code), p_to::text, p_reason, p_plain, p_actor)
  returning * into r;
  return r;
end $$;

create or replace function sb_risk_level() returns jsonb
language sql stable as $$
  select jsonb_build_object(
    'level', coalesce((select level::text from sb_risk_log order by as_of desc limit 1), (select value from sb_settings where key = 'risk_level')),
    'log', (select to_jsonb(r) from sb_risk_log r order by as_of desc limit 1),
    'caps', (select jsonb_object_agg(key, value) from sb_settings where key like 'risk_%')
  );
$$;
