#!/usr/bin/env bash
# 스윙봇 일봉 적재기 설치 (VPS에서 실행). 조회 전용, 주문 없음, 0원.
#   bash <(curl -fsSL https://raw.githubusercontent.com/znfdusdb-cell/-/claude/swingbot-control-site-o6sory/bot/install.sh)
# 다시 실행해도 안전하다. 키를 다시 묻는 칸에서 엔터만 치면 기존 값을 그대로 쓴다.
set -euo pipefail
REPO=https://github.com/znfdusdb-cell/-.git
BRANCH=claude/swingbot-control-site-o6sory
DIR="$HOME/swingbot"
CONF="$HOME/.swingbot"
ENVF="$CONF/env"

command -v python3 >/dev/null || { echo "python3 가 없다: apt install -y python3"; exit 1; }
command -v git >/dev/null || { echo "git 이 없다: apt install -y git"; exit 1; }

echo "1/4 코드 받기 → $DIR"
if [ -d "$DIR/.git" ]; then git -C "$DIR" fetch -q --depth 1 origin "$BRANCH" && git -C "$DIR" reset -q --hard FETCH_HEAD
else git clone -q --depth 1 -b "$BRANCH" "$REPO" "$DIR"; fi

echo "2/4 키 입력 (입력한 글자는 화면에 안 보인다. 붙여넣고 엔터)"
mkdir -p "$CONF"; chmod 700 "$CONF"
touch "$ENVF"; chmod 600 "$ENVF"
old() { grep -E "^$1=" "$ENVF" 2>/dev/null | head -1 | cut -d= -f2- || true; }
ask() {  # $1 키 이름, $2 설명
  local cur v; cur="$(old "$1")"
  if [ -n "$cur" ]; then printf "  %s (%s) [엔터=기존 값 유지]: " "$1" "$2"; else printf "  %s (%s): " "$1" "$2"; fi
  IFS= read -rs v < /dev/tty; echo
  v="$(printf '%s' "$v" | tr -d '[:space:]')"
  [ -z "$v" ] && v="$cur"
  [ -z "$v" ] && { echo "  비어 있어서 중단. 다시 실행해"; exit 1; }
  printf -v "$1" '%s' "$v"
}
ask KIS_APP_KEY "한투 APP Key"
ask KIS_APP_SECRET "한투 APP Secret"
ask SUPABASE_URL "Supabase 주소 https://xxxx.supabase.co"
ask SUPABASE_SERVICE_KEY "Supabase service_role(secret) 키"
umask 077
cat > "$ENVF" <<CONF
KIS_APP_KEY=$KIS_APP_KEY
KIS_APP_SECRET=$KIS_APP_SECRET
SUPABASE_URL=$SUPABASE_URL
SUPABASE_SERVICE_KEY=$SUPABASE_SERVICE_KEY
CONF
chmod 600 "$ENVF"
unset KIS_APP_KEY KIS_APP_SECRET SUPABASE_SERVICE_KEY

echo "3/4 연결 확인"
cd "$DIR" && python3 -m bot.load_candles --check

echo "4/4 매일 자동 실행 등록 (평일 한국시간 16:20, 장 마감 뒤)"
off="$(date +%z)"; sign="${off:0:1}"; oh=$((10#${off:1:2}))
[ "$sign" = "-" ] && oh=$((-oh))
h=$(( (16 - 9 + oh + 24) % 24 ))
line="20 $h * * 1-5 cd $DIR && python3 -m bot.load_candles >> $CONF/load.log 2>&1"
( crontab -l 2>/dev/null | grep -v "bot.load_candles" || true; echo "$line" ) | crontab -
echo "  등록: $line"

echo "첫 적재 (종목당 2년치, 몇 분 걸릴 수 있음)"
python3 -m bot.load_candles | tee -a "$CONF/load.log"
echo "끝. 기록: $CONF/load.log"
