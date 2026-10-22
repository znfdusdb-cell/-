# bot/ — 스윙봇 VPS 프로그램 (지금은 일봉 적재만)

조회 전용. 주문 함수는 없다. 표준 라이브러리만 써서 pip 설치가 필요 없다(Python 3.8+).

## 설치 (VPS에서 한 번)
```
bash <(curl -fsSL https://raw.githubusercontent.com/znfdusdb-cell/-/claude/swingbot-control-site-o6sory/bot/install.sh)
```
키 4개(한투 APP Key/Secret, Supabase 주소, Supabase service_role 키)를 묻는다. 입력은 화면에 안 보이고 `~/.swingbot/env`(권한 600)에만 저장된다. 다시 실행하면 코드만 최신으로 받고, 엔터를 치면 기존 키를 유지한다.

## 하는 일
- `python3 -m bot.load_candles` : sb_stocks 실제 종목(is_seed=false)의 일봉. 실제 일봉이 250개 미만이면 2년치, 아니면 최근 10일. 실제 일봉을 넣은 종목의 가짜 일봉은 지운다.
- 크론: 평일 한국시간 16:20. 기록 `~/.swingbot/load.log`.
- `--check` : 한투·Supabase 연결만 확인 (DB 쓰기 없음). `--full` : 전 종목 2년치 다시.

## 한투 API 메모
토큰 24시간, 발급 1분 1회 제한(파일 캐시). 일봉 1회 100건, 수정주가. 실전 초당 20건 → 초당 약 12건으로 호출. 빈 응답이면 페이징 멈춤.

## 다음
1. 셋업 계산(52주·이동평균·트렌드 템플레이트·베이스)을 setup-calc.ts 정의 그대로 파이썬으로 → sb_setups(data_source='bot')
2. 레이더: 전 종목 마스터 + 실적 성장(최근 2~3분기 영업이익 +25%) + 52주 고가 25% 이내 → sb_add_radar
3. 연습 모드: 신호 → 주문서 기록만 (실제 주문 없음)
