"""설정 파일(~/.swingbot/env) 읽기. 키는 이 파일에만 있고 코드·저장소·대화에는 없다."""
import os
from pathlib import Path

HOME = Path(os.environ.get("SWINGBOT_HOME", Path.home() / ".swingbot"))
ENV_FILE = HOME / "env"
REQUIRED = ("KIS_APP_KEY", "KIS_APP_SECRET", "SUPABASE_URL", "SUPABASE_SERVICE_KEY")


def load_env() -> dict:
    env = {}
    if ENV_FILE.exists():
        for line in ENV_FILE.read_text().splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            env[k.strip()] = v.strip().strip('"').strip("'")
    for k in REQUIRED:  # 환경변수가 있으면 우선
        if os.environ.get(k):
            env[k] = os.environ[k]
    missing = [k for k in REQUIRED if not env.get(k)]
    if missing:
        raise SystemExit(f"설정 없음: {', '.join(missing)} → bot/install.sh 를 다시 실행해 입력")
    return env
