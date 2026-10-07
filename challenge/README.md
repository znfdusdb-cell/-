# 거너스 챌린지 (아스날 인사이드 톡방 챌린지 앱)

톡방 멤버가 아이디·비밀번호만 만들어 들어와서 다이어트·취미 챌린지를 사진으로 인증하는 모바일 웹앱(PWA).
연속 인증 → 경험치 → 레벨업 → 캐릭터가 아스날 유니폼을 입고 거너사우르스가 옆에 붙는다.

## 기능

- **로그인**: 아이디 + 비밀번호(4자 이상). 첫 로그인은 참여할 챌린지 고르기(온보딩). `INVITE_CODE` 를 두면 초대 코드 없이는 가입 불가.
- **총관리자**: 아이디 `비움`, 비밀번호 `4581`(환경변수 `ADMIN_PASSWORD` 로 바꿀 수 있음). 첫 실행 때 자동 생성.
- **다이어트 챌린지(기본)**: 점심 11:00~14:00, 저녁 17:00~20:00 안에 앱 카메라로 찍어 올린다. 촬영 시각이 사진에 표시되고, 시간 밖이면 서버가 거부(판정은 서버 시각·KST). 둘 중 하나라도 놓치면 그날은 실패. 참여할 때 "몇 kg를 며칠 동안" 목표 입력.
- **취미 챌린지(기본)**: 하고 싶은 취미를 적고 1주일에 1회 사진 인증. 기간 안에 못 하면 그 주는 실패.
- **갤러리 탭**: 챌린지별로 오늘(취미는 이번 주) 올라온 모든 참가자 사진 + 취미 이름 + 촬영 시각. 전날로 넘겨 볼 수 있다.
- **상품**: 챌린지마다 관리자(또는 개설자)가 수정. 기본 "메가커피 아메리카노 쿠폰". 시간대·횟수·기간 규칙도 같은 화면에서 수정.
- **챌린지 개설**: Lv.6 부터(관리자는 언제나). 횟수형(취미처럼) 또는 시간대형(식사처럼)을 골라 만든다.
- **게이미피케이션**: 사진 +10, 하루 완료 +20, 연속일 보너스 최대 +50 / 취미 인증 +60, 기간 달성 +40, 연속 보너스 최대 +100. 레벨 n 필요 경험치 = 50·(n−1)·n (L2 100, L3 300, L6 1500).
  캐릭터: L1 흰 티 → L2 빨간 셔츠 → L3 홈 킷+대포 엠블럼 → L4 머플러 → L5 주장 완장·금 축구화 → L6 거너사우르스 → L7 트로피 → L8 황금 오라 → L9 왕관 → L10 불꽃.
- **홈 화면 아이콘**: PWA 매니페스트 + 아이콘. 아이폰은 Safari 공유 → 홈 화면에 추가, 안드로이드는 설치 버튼/메뉴.
- **알림(웹 푸시)**: 점심·저녁 시작 시각, 마감 30분 전, 취미 기간 시작일·마지막 날 오전 10시. 아이폰은 홈 화면에 추가한 아이콘으로 열어야 켤 수 있다(iOS 16.4+).
- **관리 탭**(관리자만): 멤버 목록·경험치 조정·비밀번호 초기화·관리자 지정, 챌린지 수정.

## 스택 (전부 무료)

Next.js 16 · Tailwind 4 · supabase-js(service role, 서버 전용) · web-push · Vercel Hobby · Supabase Free.
비밀번호는 Node 내장 scrypt, 세션은 HMAC 쿠키(180일). 외부 인증 서비스 없음.

## 로컬 실행

```bash
cd challenge
npm install
npm run dev          # 환경변수 없으면 메모리 모드 (서버 끄면 데이터 사라짐)
```

`비움 / 4581` 로 로그인하면 관리 탭이 보인다.

## 배포 (Vercel + Supabase)

1. **Supabase**: SQL Editor 에서 `supabase/migrations/20261007_01_challenge_init.sql` 실행. 테이블 `ch_*` 7개 + 비공개 버킷 `ch-photos` 가 생긴다. 다시 실행해도 안전(추가만).
   bium-brain 의 Supabase 프로젝트를 같이 써도 된다(접두사 `ch_` 라 스윙봇 `sb_` 와 안 섞인다).
2. **VAPID 키**: `npm run vapid` 한 번 → 출력 3줄을 환경변수로.
3. **Vercel**: 새 프로젝트, **Root Directory 를 `challenge`** 로. 환경변수(`.env.example` 참고):
   `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SESSION_SECRET`(긴 무작위 문자열), `ADMIN_PASSWORD`, `INVITE_CODE`(선택),
   `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `CRON_SECRET`.
4. **알림 크론** (둘 중 하나):
   - GitHub Actions: 저장소 Secrets 에 `CHALLENGE_URL`(배포 주소), `CHALLENGE_CRON_SECRET` 추가. `.github/workflows/challenge-remind.yml` 이 30분마다 호출. (몇 분 늦을 수 있음)
   - Supabase pg_cron (더 정확): Database → Extensions 에서 `pg_cron`, `pg_net` 켜고 SQL:
     ```sql
     select cron.schedule('ch-remind', '*/15 * * * *',
       $$ select net.http_get('https://<배포주소>/api/cron/remind?key=<CRON_SECRET>') $$);
     ```
5. 배포 주소를 톡방에 공유. 각자 가입 → 홈 화면에 추가 → 내 정보에서 알림 켜기.

## 규칙 세부 (판정)

- 시간은 전부 KST, 판정은 서버 시각. 클라이언트가 보낸 촬영 시각은 표시용이며 서버와 10분 넘게 어긋나면 서버 시각으로 대체.
- 가입 당일: 첫 시간대 시작(11:00) 전에 가입하면 그날부터, 아니면 다음 날부터 집계. 당일 인증은 경험치만.
- 같은 시간대에 다시 올리면 사진만 바뀌고 경험치는 그대로.
- 횟수형은 참여일 기준으로 기간(7일)을 끊는다. 목표 횟수를 넘긴 추가 인증은 기록만.
- 연속·실패 수는 저장하지 않고 인증 기록에서 매번 계산한다(규칙을 바꿔도 과거가 새 규칙으로 재계산됨).

## 구조

- `src/lib/game.ts` 경험치·레벨·시간대형/횟수형 판정 엔진 (순수 함수)
- `src/lib/time.ts` KST 날짜 도우미
- `src/lib/repo/` 저장소 인터페이스 + `memory.ts`(로컬) + `supabase.ts`(배포)
- `src/app/actions.ts` 서버 액션(로그인·참여·개설·관리), `src/app/api/checkin` 사진 인증, `src/app/api/cron/remind` 알림
- `src/components/Character.tsx` 레벨별 캐릭터 SVG, `CheckinButton.tsx` 카메라→압축→업로드→보상 연출
- `public/sw.js` 서비스 워커(설치·푸시), `scripts/icons.mjs` 아이콘 재생성
