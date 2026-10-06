# 스윙봇 관제 사이트 — 스키마 수정안 (2026-10-06)

> 상태: **비움 승인 대기.** 승인 전에는 bium-brain Supabase에 아무것도 넣지 않는다.
> 승인 후 `supabase/migrations/20261006_swingbot_init.sql` → `supabase/seed.sql` 순서로 Supabase SQL Editor에서 실행한다.

## 1. 기존 스키마와 겹치지 않게 한 것

이 세션에는 bium-brain 저장소와 Supabase 접속 정보가 없어서, brain_status와 과거 대화에서 확인한 기존 테이블 목록
(conversations, research, decisions, lectures, knowledge, businesses, **actions**, raw_sources, research_jobs, feedback_memory,
sensory_events, emotion_snapshots, ministry_summaries, presidential_summary, bium_post_metrics, bium_accounts, sanghyun_messages,
하이파이브 쪽 daily_plans, habits, quarterly_plans, identities, identity_statements, v4_roadmap_items, OKR 계열)을 기준으로 설계했다.

초안의 `events`, `predictions` 같은 일반 명사는 나중에 충돌하기 쉬워서 **모든 테이블·열거형에 `sb_` 접두사**를 붙였다.
기존 테이블은 전혀 건드리지 않고, 전부 `create ... if not exists` 라 두 번 실행해도 안전하다.

| 초안 | 확정안 | 비고 |
|---|---|---|
| stocks | `sb_stocks` | + `is_seed`(가짜 카드 표시), `stage_reason` |
| — | `sb_stage_log` | **추가.** 단계 이동 이력(누가·왜). 복기용 |
| theses | `sb_theses` | 무효화 조건은 jsonb 배열 `[{text, violated, note}]`. 위반 플래그를 조건별로 둔다 |
| setups | `sb_setups` | 발자국 4값 + 피봇 + C박스 상·하단·시작일 + 거래량 마른 일수 + TT/체크리스트(항목별 jsonb + 점수) + 조정·시장 대비 배수 + `setup_type`(vcp/3c/flat/power_play) |
| positions | `sb_positions` | 상태 7종(정찰병/1차/2차/3차/스쿼트대기/재설정감시/종료), `entry_rule_id` |
| orders_log | `sb_orders_log` | `rule_id` + `is_violation`. "규칙 위반 0일" 카운터의 근거 |
| events | `sb_events` | code null = 시장 전체 이벤트 |
| predictions | `sb_predictions` | 가설 장부 (2차 화면용, 테이블만 먼저) |
| market_regime | `sb_market_regime` | 신호 + 근거 수치 5개 + 근거 문장 배열 |
| — | `sb_rules` | **추가.** 규칙 카탈로그. `orders_log.rule_id`가 FK로 가리킨다. 확정본 1장을 23개 ID로 쪼갰다 (MF/UV/EN/EX/EV) |
| — | `sb_candles` | **추가.** 일봉. 차트가 읽는다. 봇이 적재 |

## 2. DB 안에 박은 규칙

- **UV-2 트리거**: `sb_stocks.stage`를 `universe`로 바꾸려면 상태 `valid`이고 무효화 조건이 1개 이상인 가설이 있어야 한다. 없으면 `raise exception`. 사이트가 막아도 DB가 한 번 더 막는다 (코드 레벨 강제 가드, Constitution §29와 같은 원리).
- **RLS 전부 켬**: anon 키로는 어떤 테이블도 못 읽는다. 사이트는 서버에서 service_role 키로만 접근하고, 그 키는 브라우저로 안 나간다.
- 단계 변경 시 `stage_changed_at` 자동 갱신.

## 3. 역할별 쓰기 권한 (설계 의도)

| 테이블 | 브레인 | 사이트(비움) | 스윙봇 |
|---|---|---|---|
| sb_stocks | 레이더 투입(insert) | 단계 이동(버튼) | 보유 진입/종료 |
| sb_theses | 초안 작성, 위반 감시(`violated`, `status=suspect`) | 작성·수정 (2차) | — |
| sb_setups, sb_candles, sb_market_regime | — | — | 매일 계산 |
| sb_positions, sb_orders_log | — | — | 체결·주문 |
| sb_events | 달력 수집 | — | — |
| sb_predictions | — | 작성 (2차) | 결과 기록 |

사이트가 할 수 있는 단계 이동만 허용 목록으로 묶었다. **보유 진입은 봇 체결로만** 일어나고, 보유→퇴출 직행 버튼은 없다
(그게 매도 버튼이기 때문). 흐름은 확정본대로 `보유 → 검토(강등) → 퇴출(승인) → 봇 매도`.

## 4. 비움이 확인해야 할 것

1. **체크리스트 7항목.** 확정본엔 "7개 중"이라는 숫자만 있고 항목이 없다. 규칙에서 추린 초안은 `src/lib/constants.ts`의 `CHECKLIST_ITEMS`. 항목이 다르면 거기 한 곳만 고치면 된다.
2. **삼성전자 실제 숫자.** 시드는 9/22 마지막 확인값(13주, 평단 257,575, 손절 본전). 일봉은 전부 가짜다.
3. **규칙 위반 정의.** 지금은 "rule_id 없는 주문 또는 봇이 is_violation=true로 쓴 주문". 9/18 10주 오주문을 시드에 위반 1건으로 넣어서 카운터가 18일째로 보인다.
4. 접두사 `sb_` 대신 별도 스키마(`swingbot.*`)로 가고 싶으면 가능하지만, Supabase API 노출 설정을 한 번 바꿔야 해서 접두사를 택했다.

## 5. 검증

로컬 Postgres 16에서 마이그레이션 → 시드 → 시드 재실행(멱등) → UV-2 트리거(빈 조건 거부, 조건 있는 종목 통과)까지 실행 확인.
Supabase 본체에는 아직 실행하지 않았다.
