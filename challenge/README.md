# 거너스 챌린지 — 톡방에 올리기까지 내가 할 일

아스날 인사이드 톡방 챌린지 앱. 아래 5단계만 하면 톡방 사람들이 폰에서 바로 씁니다.
전부 무료이고, 한 번만 하면 됩니다. 막히면 그 단계 화면을 캡처해서 보여 주세요.

---

## 1단계. Supabase에 표 만들기 (5분)

아스날맵 만들 때 쓴 Supabase 프로젝트에 같이 해도 됩니다.

1. supabase.com 접속 → 그 프로젝트 열기
2. 왼쪽 메뉴 **SQL Editor** 클릭 → **New query**
3. 이 저장소의 `challenge/supabase/migrations/20261007_01_challenge_init.sql` 파일 내용을 전부 복사해서 붙여넣기
4. **Run** 클릭. 초록색으로 "Success"가 뜨면 끝

두 번 실행해도 망가지지 않습니다.

## 2단계. Supabase에서 값 2개 복사해 두기 (2분)

같은 프로젝트, 왼쪽 맨 아래 톱니바퀴(Settings)에서:

- **프로젝트 URL**: 왼쪽 메뉴 **Data API** (INTEGRATIONS 아래) → 맨 위 **Project URL** 복사. `https://xxxx.supabase.co` 모양.
  → 메모장에 `NEXT_PUBLIC_SUPABASE_URL` 이라고 적고 옆에 붙여넣기
- **service_role 키**: 왼쪽 메뉴 **API Keys** → 위쪽 탭 **"Legacy anon, service_role API keys"** 클릭 → `service_role` 줄 **Reveal** → 복사.
  → `SUPABASE_SERVICE_ROLE_KEY` 로 적어 두기

주의: 첫 탭에 보이는 `sb_publishable_...` 키나 `anon` 키가 아니라 **service_role** 키입니다. 이 키는 톡방에 절대 올리지 마세요.

## 3단계. 알림 열쇠 만들기 (1분)

맥 터미널에서 이 한 줄만 (저장소를 내려받을 필요 없음):

```bash
npx web-push generate-vapid-keys
```

"Ok to proceed? (y)" 가 나오면 `y` 엔터. 결과가 이렇게 나옵니다.

```
Public Key:
BNxxxx...        ← 이 줄이 NEXT_PUBLIC_VAPID_PUBLIC_KEY
Private Key:
xxxx...          ← 이 줄이 VAPID_PRIVATE_KEY
```

두 줄을 메모장에 붙여 두세요. (이 단계를 건너뛰면 알림만 꺼진 채로 나머지는 다 됩니다.)

## 4단계. Vercel에 올리기 (10분)

1. vercel.com 로그인 → **Add New → Project**
2. 이 GitHub 저장소(`znfdusdb-cell/-`) 선택
3. **Root Directory** 에서 **Edit** 누르고 `challenge` 선택 ← 이게 제일 중요
4. **Environment Variables** 에 아래를 하나씩 추가 (이름 / 값)

| 이름 | 값 |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | 2단계에서 복사한 URL |
| `SUPABASE_SERVICE_ROLE_KEY` | 2단계에서 복사한 service_role 키 |
| `SESSION_SECRET` | 아무 긴 문장 (예: 비밀번호 만들듯 30자 이상 아무렇게나) |
| `ADMIN_PASSWORD` | `4581` (비움 계정 첫 비밀번호. 나중에 앱 안에서 바꿀 수 있음) |
| `INVITE_CODE` | (안 넣어도 됨) 넣으면 가입할 때 이 단어를 알아야 가입됨. 누구나 가입하게 하려면 이 줄은 건너뜀 |
| `CRON_SECRET` | 아무 긴 문장 (알림 보내기용. SESSION_SECRET과 다르게) |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | 3단계의 Public Key |
| `VAPID_PRIVATE_KEY` | 3단계의 Private Key |
| `VAPID_SUBJECT` | `mailto:내이메일주소` |

5. **Deploy** 클릭. 1~2분 뒤 주소(예: `https://xxx.vercel.app`)가 나옵니다.
6. 그 주소로 들어가 `비움 / 4581` 로 로그인되면 성공. 아래 탭에 **관리**가 보입니다.

## 5단계. 알림 자동 발송 켜기 (3분, 3단계를 했을 때만)

GitHub 저장소 페이지 → **Settings → Secrets and variables → Actions → New repository secret** 으로 2개 추가:

- `CHALLENGE_URL` : 4단계에서 받은 주소 (끝에 `/` 없이)
- `CHALLENGE_CRON_SECRET` : 4단계에 넣은 `CRON_SECRET` 과 똑같은 값

이러면 30분마다 자동으로 "점심 인증 시간이에요", "마감 30분 전" 알림이 나갑니다.

---

## 톡방에 공지할 내용 (복사해서 쓰세요)

> 📱 챌린지 앱: (주소)
> 1. 들어가서 "처음이에요" → 아이디·비밀번호 만들기
> 2. 다이어트 / 취미 중 하고 싶은 거 참여
> 3. 아이폰: Safari 아래 공유 버튼 → "홈 화면에 추가". 안드로이드: 설치 버튼
> 4. 홈 화면 아이콘으로 열고 → 내 정보 → 알림 켜기
> 점심 11~2시, 저녁 5~8시 안에 사진 올리기! 연속으로 하면 레벨업 🔥

## 관리자(비움)가 앱 안에서 할 수 있는 것

- **관리** 탭: 멤버 목록, 경험치 조정, 비밀번호 잊은 사람 초기화, 다른 관리자 지정
- 챌린지 카드 → **수정**: 상품(기본 메가커피 아메리카노 쿠폰), 인증 시간대, 횟수 바꾸기
- **챌린지 만들기**: 관리자는 레벨 상관없이 바로. 멤버는 Lv.6부터

## 자주 묻는 것

- **아이폰에서 알림이 안 켜져요** → 사파리로 열면 안 되고, 홈 화면에 추가한 아이콘으로 열어야 합니다 (애플 규칙).
- **사진이 시간 밖이라고 거부돼요** → 판정은 서버의 한국 시간 기준입니다. 폰 시계와 무관합니다.
- **데이터가 사라졌어요** → 4단계 환경변수 중 Supabase 두 개가 비어 있으면 임시 메모리로 돌아서 재시작 때 지워집니다. 값을 확인하세요.

---

## (개발자용) 구조 메모

Next.js 16 · Tailwind 4 · supabase-js(service role 서버 전용) · web-push. 로컬은 `npm run dev` (환경변수 없으면 메모리 모드).
`src/lib/game.ts` 경험치·레벨·판정 엔진, `src/lib/repo/` 저장소(memory/supabase), `src/app/actions.ts` 서버 액션,
`src/app/api/checkin` 사진 인증, `src/app/api/cron/remind` 알림, `src/components/Character.tsx` 레벨별 캐릭터, `public/sw.js` 서비스 워커.
판정 규칙: 서버 KST 기준, 가입 당일은 집계 제외(경험치만), 같은 시간대 재업로드는 사진만 교체, 연속·실패는 저장하지 않고 기록에서 계산.
