# 스윙봇 관제탑

미너비니 규칙 기반 국장 스윙봇의 관제 사이트. 종목이 레이더 → 검토 → 유니버스 → 보유 → 퇴출 파이프라인을 흐른다.
봇은 유니버스 단계만 매수하고 퇴출은 매도 대상. **이 사이트는 주문을 내지 않는다. 승인과 조회만 한다.**

규칙 원문: bium-brain `swingbot_final_spec_2026-10-06` (확정본) → `swingbot_context_2026-10-06` (맥락본).

## 화면 (1차)

- `/` 관제탑: 시장 신호등(거래/축소/관망 + 근거 수치) · 다가오는 이벤트 · 5단 파이프라인 보드 (모바일은 단계 탭, 데스크톱은 5열)
- `/stocks/[code]` 종목 카드 상세: 일봉(피봇선·손절선·C 박스 띠·거래량) · 포지션 · 가설과 무효화 조건(위반 시 빨강) · 발자국 · 트렌드 템플레이트 8 · 체크리스트 7 · 이벤트 · 주문 로그 · 단계 이동 이력
- `/log` 규칙 로그: "규칙 위반 0일" 카운터 · 주문별 근거 규칙 · 규칙 카탈로그 23개

단계 이동은 카드 상세의 버튼 + 확인 모달(이유 필수)로만. 드래그 없음. 유니버스 승인은 무효화 조건이 비어 있으면 버튼이 잠기고, DB 트리거도 막는다.

색: 상승 빨강, 하락 파랑 (한국 증권앱 관례). 모바일 우선.

## 스택 (전부 무료)

Next.js 16 · Tailwind 4 · lightweight-charts(TradingView, Apache-2.0) · supabase-js · Vercel Hobby · bium-brain Supabase.

## 로컬 실행

```bash
npm install
npm run dev        # 환경변수 없으면 내장 시드 데이터로 뜬다 (우상단 '시드' 배지)
```

## Supabase 연결 (비움 승인 후)

1. `docs/SCHEMA.md` 읽고 승인.
2. Supabase SQL Editor에서 `supabase/migrations/20261006_swingbot_init.sql` → `20261006_02_accounts_rules_calendar.sql` 순서로 실행.
3. 같은 곳에서 `supabase/seed.sql` 실행 (또는 `.env.local` 채우고 `npx tsx scripts/seed.ts`).
4. `.env.example`을 `.env.local`로 복사해 값 채움. 배지가 'DB'로 바뀐다.

시드 수정은 `src/lib/seed-data.ts` 한 곳에서. `npx tsx scripts/seed.ts --sql`로 `supabase/seed.sql`을 다시 뽑는다.

## Vercel 배포

```bash
vercel link            # 새 프로젝트 (예: swingbot-control)
vercel env add NEXT_PUBLIC_SUPABASE_URL
vercel env add SUPABASE_SERVICE_ROLE_KEY
vercel env add SITE_PASSCODE          # 사이트 잠금 비밀번호 (폰에서 한 번 넣으면 90일 유지)
vercel --prod
```

`SITE_PASSCODE`가 없으면 잠금이 없다. 매직링크 로그인(비움 이메일 1개만 허용)으로 바꾸려면 `NEXT_PUBLIC_SUPABASE_ANON_KEY`·`AUTH_ALLOWED_EMAIL`을 추가하고 Supabase Redirect URL을 등록한다. 절차는 docs/SCHEMA.md 8장.

## 봇·브레인이 쓰는 테이블

`sb_stocks`(레이더 투입·보유 진입), `sb_theses`(가설·무효화 감시), `sb_setups`·`sb_candles`·`sb_market_regime`(매일 계산),
`sb_positions`·`sb_orders_log`(체결, 근거 `rule_id` 필수), `sb_events`(달력). 자세한 분담은 `docs/SCHEMA.md` 3장.

## 2차 범위 (아직 없음)

포지션 상태 머신 도식, 가설 장부 화면(`sb_predictions` 테이블은 있음), 가설·무효화 조건 편집 UI, 이벤트 전 축소 승인 버튼.
