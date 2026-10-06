# 스윙봇 관제 사이트 — Claude Code 작업 규칙

## 시작할 때
1. bium-brain에서 `swingbot_final_spec_2026-10-06`(확정 규칙) → `swingbot_context_2026-10-06`(+erratum, erratum_2)(이유·실수 기록) 순으로 읽는다. 충돌하면 확정본 우선.
2. bium-brain에서 research_id가 `swingbot_cc_request_`로 시작하는 문서를 전부 읽고, 아직 반영 안 된 요청이 있으면 목록으로 보고한다.
3. 규칙이 애매하면 맥락본의 이유로 판단하고, 그래도 애매하면 구현하지 말고 비움에게 묻는다.

## 세션 저장 (클라우드 세션은 bium-claude-sync 훅이 안 돈다)
- 작업 단위가 끝날 때마다, 그리고 세션을 마치기 전에 bium-brain `save_conversation`으로 저장한다. 같은 session_id로 갱신한다.
- session_id: `claude_code_cloud:swingbot-<YYYY-MM-DD>`, topics: `claude_code`, `cloud`, `swingbot`.
- 원문 전체를 넣지 않는다(긴 원문은 안전 필터에 걸린다). 저장 형식은 작업 요약 `{날짜, 완료 항목[], 미완료 항목[], 미반영 요청 research_id[]}` 500자 안팎. 원문이 필요하면 세션 jsonl 파일을 직접 읽는다.
- 저장 후 `search_conversations`로 검색해 나오는지 확인하기 전엔 완료라고 하지 않는다.

## 지키는 것
- 사이트는 주문을 내지 않는다. 승인과 조회만.
- 가설 작성자·체결가·체결일을 지어내지 않는다. 초안은 `claude_code`, 승인은 비움이 사이트 버튼으로.
- 숫자는 비움 화면으로 확인된 값만. 미확인이면 `is_unverified` 배지.
- 유료 서비스 추가 전엔 반드시 묻는다. 0원 유지.
- 상승 빨강, 하락 파랑. 모바일 우선. 기본은 쉬운 모드.

## 구조
- `src/lib/constants.ts` 규칙 카탈로그·체크리스트·용어, `src/lib/verify.ts` 주문 검증, `src/lib/setup-calc.ts` 52주·베이스 정의, `src/lib/krx-calendar.ts` 거래일 달력(매년 12월 갱신).
- 마이그레이션은 `supabase/migrations/` 추가만. 시드는 `src/lib/seed-data.ts` 단일 출처 → `npx tsx scripts/seed.ts --sql`로 `supabase/seed.sql` 재생성.
- 로컬 Postgres 16으로 마이그레이션·시드·트리거를 돌려본 뒤 push한다.
