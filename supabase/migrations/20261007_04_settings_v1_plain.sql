-- =============================================================================
-- 4차 (2026-10-07): 설정값 v1 투입 + 가설 쉬운 재서술 컬럼. 전부 추가/갱신만.
-- 근거: bium-brain research swingbot_cc_request_2026-10-06_settings_v1
-- =============================================================================

-- 설정값 v1 (Claude 초기값, 비움 위임. 7단계 백테스트 전엔 변경 금지)
insert into sb_settings (key, value) values
  ('max_weight_per_stock_pct',  '20'),
  ('max_weight_per_sector_pct', '40'),
  ('uv4_market_multiple',       '2'),
  ('long_closure_trading_days', '2')    -- 장기 휴장 = 주말 제외 연속 휴장 거래일 수 이상
on conflict (key) do update set value = excluded.value, updated_at = now();

-- 설정값 메타: 정한 사람 / 다시 보는 때 (화면 설명은 코드 SETTING_KEYS 에)
alter table sb_settings
  add column if not exists decided_by text,      -- 'Claude 초기값' / '비움' / '백테스트'
  add column if not exists review_at  text;      -- '7단계 백테스트' 등
update sb_settings set decided_by = 'Claude 초기값', review_at = '7단계 백테스트'
 where key in ('max_weight_per_stock_pct','max_weight_per_sector_pct','uv4_market_multiple','uv4_drawdown_pct','long_closure_trading_days');
update sb_settings set decided_by = '미확정', review_at = '4단계 시장 필터 검증'
 where key like 'regime_%';

-- 가설 쉬운 말 재서술 (승인 화면용). 무효화 조건의 쉬운 말은 jsonb 항목의 plain 필드.
alter table sb_theses add column if not exists hypothesis_plain text;
