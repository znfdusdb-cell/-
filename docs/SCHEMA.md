# 스윙봇 관제 사이트 — 스키마 수정안 (2026-10-06)

> 상태: **비움 승인 완료 (2026-10-06), 7개 반영 조건 적용.** Supabase 실행은 비움이 SQL Editor에서 한다.
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
| orders_log | `sb_orders_log` | `rule_id` + `is_violation` + **`source`(bot/manual)** + **`planned_qty`**(EN-8 계산 수량). 수동 매매는 기록만, 카운터 제외 |
| — | `sb_settings` | **추가.** key/value. `bot_started_at`(봇 가동일) — 카운터는 이 날부터 센다 |
| events | `sb_events` | code null = 시장 전체 이벤트 |
| predictions | `sb_predictions` | 가설 장부 (2차 화면용, 테이블만 먼저) |
| market_regime | `sb_market_regime` | 신호 + 근거 수치 5개 + 근거 문장 배열 |
| — | `sb_rules` | **추가.** 규칙 카탈로그. `orders_log.rule_id`가 FK로 가리킨다. 확정본 1장을 23개 ID로 쪼갰다 (MF/UV/EN/EX/EV) |
| — | `sb_candles` | **추가.** 일봉. 차트가 읽는다. 봇이 적재 |

## 2. DB 안에 박은 규칙

- **UV-2 트리거**: `sb_stocks.stage`를 `universe`로 바꾸려면 상태 `valid`이고 무효화 조건이 1개 이상인 가설이 있어야 한다. 없으면 `raise exception`. 사이트가 막아도 DB가 한 번 더 막는다 (코드 레벨 강제 가드, Constitution §29와 같은 원리).
- **UV-3 트리거**: 브레인이 `sb_theses.invalidation_conditions`의 조건을 `violated=true`로 바꾸면 `note`(근거)가 비어 있을 때 거부하고, 있으면 가설 상태 `suspect` + 종목이 유니버스/보유면 **자동으로 검토 강등** + `sb_stage_log`에 actor=brain 기록. 매수 허용은 유니버스 단계뿐이라(`sb_can_buy(code)` 함수, 봇이 주문 직전 호출) 강등 즉시 신규·추가 매수가 막힌다. 보유분 손절은 봇 규칙 그대로, 매도는 비움이 퇴출 승인한 뒤에만.
- **규칙 위반 검증 함수** (`src/lib/verify.ts`, 사이트가 읽을 때 계산): UV-1 유니버스 밖 매수(주문 시각 단계를 stage_log로 복원), EN-7 물타기(직전 평단보다 낮은 추가 매수), EN-2 피봇 +3% 초과 추격, EX-1 손절가 도달 후 익일까지 매도 없음(최종 손절선 기준 근사), EN-8 계산 수량≠주문 수량, rule_id 없음. 봇 자진 신고(`is_violation`)는 여기에 합산.
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

## 4. 남은 확인 사항

1. **삼성전자 실제 숫자.** 시드는 9/22 확인값(13주, 평단 257,575, 손절 본전)이고 `is_unverified=true`로 "숫자 미확인" 표시가 붙어 있다. 비움이 현재 수량·평단을 주면 교체.
2. **봇 가동일.** 시드 `bot_started_at=2026-09-15`는 가짜 값. 모의투자 시작일로 바꾼다 (`update sb_settings set value='YYYY-MM-DD' where key='bot_started_at'`).
3. **일봉 용량.** 한 행 약 130바이트(PK 인덱스 포함). 코스피200+코스닥150=350종목 × 연 250일 = 87,500행 ≈ 11MB/년. 10년 ≈ 110MB. Supabase 무료 한도 500MB 안. 분봉·실시간 체결은 DB에 넣지 않는다.

## 5. 검증

로컬 Postgres 16에서 마이그레이션 → 시드 → 시드 재실행(멱등) → UV-2 트리거(빈 조건 거부, 조건 있는 종목 통과)까지 실행 확인.
Supabase 본체에는 아직 실행하지 않았다.

## 6. 사이트 인증 제안 (0원)

지금은 `SITE_PASSCODE` 하나로 잠근다(쿠키 90일). URL을 아는 사람이 비밀번호까지 알아야 승인 버튼을 누를 수 있지만, 비밀번호 하나는 약하다. 후보:

| 안 | 비용 | 장점 | 단점 |
|---|---|---|---|
| A. Supabase Auth 이메일 매직링크 + 허용 이메일 1개 | 0원 (이미 쓰는 Supabase) | 새 서비스 없음, 비밀번호 없음, 폰 메일 앱에서 링크 한 번 | Supabase 기본 메일러는 시간당 3통 제한(혼자 쓰기엔 충분) |
| B. Google 로그인(Supabase Auth OAuth) + 허용 이메일 1개 | 0원 | 메일 기다림 없음 | Google Cloud 콘솔에서 OAuth 클라이언트 한 번 만들어야 함 |
| C. Cloudflare Access (무료 50명) | 0원 | 앱 코드 손 안 댐, 도메인 단위 차단 | 서비스 하나 추가, 커스텀 도메인 필요 |

추천은 **A**(허용 이메일 = znfdusdb@naver.com, 그 외 이메일은 로그인 자체 거부). 비밀번호를 외울 것도 유출될 것도 없고 bium-brain Supabase 안에서 끝난다. 승인하면 `@supabase/ssr`로 붙이고 지금 비밀번호 잠금은 폴백으로 남긴다.
