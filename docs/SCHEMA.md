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

## 7. 2차 마이그레이션 (2026-10-06, 비움 수정 요청 7개 반영) — `supabase/migrations/20261006_02_accounts_rules_calendar.sql`

전부 추가만. 1차 실행 뒤 SQL Editor에서 실행하고, `supabase/seed.sql`을 다시 실행한다(시드 종목을 지우고 다시 넣는다).

- 계좌 구분 `sb_positions.account` (kis_bot / kb_manual). KB 삼성전자는 `kb_manual` + 상태 `manual`, 손절선 null(봇 관리 아님). 상태 머신·EX-1 검증 대상에서 제외. 봇 계좌 잔고가 SZ-1 기준.
- `sb_balance_snapshots`: 확인된 시점의 잔고 스냅샷. 삼성전자 체결 이력은 재구성하지 않고 8/18·8/26·9/4·9/22 스냅샷만 (정정본 2).
- `sb_orders_log`에 `stop_price`·`target_price`(RR-1), `account_balance_at`(SZ-1) 추가.
- `sb_setups`에 `benchmark`(UV-4 비교 지수)·`data_source`('seed'면 가짜 일봉 기준 표시). `sb_candles.source`, `sb_market_regime.is_seed`.
- `sb_settings` 키 추가: SZ-1 상한 2개, 봇 계좌 잔고, UV-4 임계 2개(60%, 2배), 시장 필터 임계 4개(전부 null = 미확정, 4단계 검증 때 확정).
- 규칙 3개 추가: RR-1, SZ-1, UV-4. UV-4는 유니버스 승인 트리거에도 들어갔다(로컬 Postgres에서 거부·통과 둘 다 확인).
- 검증 함수 추가 판정: RR-1(손절가·목표가 미기록, 손익비 2:1 미만), SZ-1(잔고 미기록, 종목·업종 상한 초과. 상한 null이면 판정 보류), EV-2 휴장일 주문.
- KRX 거래일 달력 `src/lib/krx-calendar.ts` (2025~2026, 주말·공휴일·대체공휴일·선거일·연말휴장). 매년 12월 갱신. 규칙 로그 화면에 다가오는 휴장과 장기 휴장(3일 이상) 표시.
- 규칙 위반 카운터: `bot_started_at` null이면 "가동 전". 봇 주문만 센다.

## 8. 인증 A (매직링크) 설정 — 비움이 할 것

코드는 들어가 있다. 환경변수 두 개와 Supabase 설정 하나만 더 넣으면 비밀번호 대신 이메일 링크 로그인으로 바뀐다.

1. Supabase → Project Settings → API Keys → `anon` 키 복사.
2. Vercel → 프로젝트 → Settings → Environment Variables에 추가:
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = anon 키
   - `AUTH_ALLOWED_EMAIL` = `znfdusdb@naver.com`
3. Supabase → Authentication → URL Configuration:
   - Site URL = `https://<사이트주소>.vercel.app`
   - Redirect URLs에 `https://<사이트주소>.vercel.app/auth/callback` 추가.
4. Vercel에서 Redeploy. 로그인 화면이 이메일 입력으로 바뀐다. 다른 이메일은 발송 자체를 거부한다. `SITE_PASSCODE`는 남겨둬도 된다(매직링크 설정이 비면 폴백).

Supabase 기본 메일러는 시간당 3통 제한이라 혼자 쓰기엔 충분하다. 링크는 한 번만 쓸 수 있고 세션은 브라우저에 남는다.

## 9. 3차 (2026-10-06, 모바일 검토) — `supabase/migrations/20261006_03_authors_52w_easy.sql`

전부 추가만. 2차 다음에 실행하고 `supabase/seed.sql` 재실행.

- 작성자 `claude_code` 추가, 가설 상태 `draft`(비움 미승인) 추가. 시드 가설은 전부 claude_code 초안이고 삼성전자는 draft. UV-2는 valid만 인정하므로 draft는 유니버스 승인 불가. 승인은 사이트 '가설 승인' 버튼 → `sb_thesis_log`에 기록.
- `sb_setups`에 `high_52w/low_52w(+date)`, `base_start`. 정의는 `src/lib/setup-calc.ts`: 52주 = 최근 252거래일 최고가·최저가, 베이스 시작 = 직전 2단계 고점(=52주 고가 날짜), 발자국 W = 베이스 시작~기준일, 고점 대비 조정 = 52주 고가 대비. 봇도 같은 정의를 써야 한다. 시드 셋업은 이 함수로 재계산(삼성전자 16W, 52주 고가 380,000 6/19, TT7 불통과 → TT 5/8).
- `sb_events.source` (brain/bium/seed/kis/dart/krx_calendar).
- UV-4는 가짜 일봉(data_source=seed)이거나 값이 없으면 '판정 보류'로 막지 않는다(`uv4Status`). 실제 일봉이 들어오면 자동으로 판정.
- 쉬운 모드(기본): 쿠키 `sb_view`. 상단 '자세히/쉽게'로 전환. 용어 치환은 `TERMS`(문턱·안전벨트·본전 기다리는 사람들·오르막…), 산 위 위치는 TT 8항목으로 어림(`mountainStage`), '다음에 일어나야 할 일'은 단계·가설 상태에서 생성(`nextStep`). 홈 '오늘 할 일'은 가설 승인·유니버스 승인·퇴출 승인·실적 전 축소만.

## 10. 4차 (2026-10-07) — `supabase/migrations/20261007_04_settings_v1_plain.sql` (cc_request settings_v1 반영)

- 설정값 v1 투입: SZ-1 종목당 20%·업종당 40%, UV-4 배수 2, 장기 휴장 2거래일(주말 제외 연속 휴장 거래일). `sb_settings.decided_by/review_at` 메타 추가. 화면은 숫자마다 쉬운 한 줄 + 정한 사람 + 다시 보는 때. 백테스트 근거 없이 변경 금지.
- `sb_theses.hypothesis_plain` + 조건별 `plain`: 승인 화면은 쉬운 말 먼저, 원문은 접기. draft엔 "이해가 안 되면 승인하지 마세요".
- 52주: 실제 일봉 252거래일 미만이면 `high_52w/low_52w` null, TT6·TT7 `pending`(회색 ?, 점수 제외). 가짜 일봉은 항상 데이터 부족. 베이스 시작·발자국은 자료 범위 안의 고점으로 계산.
- 보류·가짜·미확정 값은 경고색 대신 회색. 경고색(노랑)은 숫자 미확인·가설 미승인처럼 비움 행동이 필요한 것만.
- 퇴출 승인(봇 매도) 버튼: 봇 계좌에 그 종목의 열린 포지션이 있을 때만. KB 수동 보유는 항상 비활성.
- 삼성전자: 가설 사실 기반으로(FnGuide 컨센서스 매출 200조7657억·영업이익 106조9435억), 무효화 조건 3에 숫자(영업이익 96.2조 이하), 승인은 10/8 잠정실적 후. 이벤트 출처 `news:파이낸셜포스트·국제뉴스 2026-10-06`.
