"""연습 보유 퇴출 (팀장 지시서 2026-11-27 '봇 매수·퇴출 연동' A~C). 주문 함수 없음 — 표시·기록만.

A. 연습 보유를 sb_positions(account='practice')에 잇는다: Store 가 매수·손절선 이동(EX-3)·매도를 DB 에 쓴다.
   ~/.swingbot/practice_positions.json 은 장중 캐시, 장중 루프 시작 때 DB 열린 연습 포지션과 맞춘다(DB 우선).
B. 종가 퇴출(bot.daily, 일봉 적재 뒤·감시 목록 앞): 20일선 아래 종가 3거래일 연속 또는 종가 < 진입 때 C 박스 하단
   → 포지션에 '다음 장 시작 매도'(EX-5) 표시. 장중 루프가 09:00 이후 첫 조회가로 매도 주문서, 재생은 다음 날 시가.
C. sb_stocks.stage='exited'(비움 퇴출 승인) 종목의 열린 연습 포지션 → 장중 루프 첫 조회가로 매도 주문서(UV-3).
우선순위(EX-4): EX-1 손절 > EX-5·UV-3 > EX-3. sb_stocks.stage 는 연습 때문에 바꾸지 않는다.
포지션 표시(box_low·exit·be)는 sb_positions.note(JSON)에 둔다(새 열을 만들지 않음).
"""
from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone

MA_N = 20      # 20일 이동평균
MA_DAYS = 3    # 3거래일 연속 (백테스트 ma20_days=3 과 같은 숫자)
ACCOUNT = "practice"


def ma20_below_days(closes: list[float], since: int = 0) -> int:
    """뒤에서부터 연속으로 '종가 < 그날까지 20일 평균'인 거래일 수. since 앞(진입 전) 날은 세지 않는다."""
    k = 0
    for i in range(len(closes) - 1, max(since, MA_N - 1) - 1, -1):
        if closes[i] < sum(closes[i - MA_N + 1:i + 1]) / MA_N:
            k += 1
        else:
            break
    return k


def close_exit(pos: dict, bars: list[dict]) -> dict | None:
    """오래된 → 최근 일봉(마지막 = 오늘 종가)으로 종가 퇴출 판정. 걸리면 {'rule':'EX-5', 'why', 'as_of', 근거 숫자}."""
    if not bars:
        return None
    opened = str(pos.get("opened") or "")[:10]
    since = next((i for i, b in enumerate(bars) if b["date"] >= opened), len(bars)) if opened else 0
    closes = [float(b["close"]) for b in bars]
    days, close, box = ma20_below_days(closes, since), closes[-1], pos.get("box_low")
    ma20 = round(sum(closes[-MA_N:]) / MA_N, 2) if len(closes) >= MA_N else None
    why = []
    if days >= MA_DAYS:
        why.append(f"20일선 아래 종가 {days}거래일 연속")
    if box and close < float(box):
        why.append(f"박스 하단 종가 이탈 ({close:,.0f} < {float(box):,.0f})")
    if not why:
        return None
    return {"rule": "EX-5", "why": " · ".join(why), "as_of": bars[-1]["date"], "close": close, "ma20": ma20,
            "ma20_days": days, "box_low": box}


def r_multiple(entry: float, initial_stop: float, exit_price: float, qty: int) -> tuple[float, float | None]:
    """(실현 손익, R 배수). R = 실현 손익 ÷ 진입 때 계획 리스크 금액(수량 x (진입가 - 첫 손절선))."""
    pnl = round(qty * (exit_price - entry), 2)
    risk = qty * (entry - initial_stop)
    return pnl, (round(pnl / risk, 3) if risk > 0 else None)


# ---------------------------------------------------------------- DB (sb_positions account='practice')
def _note(p: dict) -> str:
    return json.dumps({k: p.get(k) for k in ("box_low", "be", "exit", "exit_rule")}, ensure_ascii=False)


def from_row(r: dict) -> dict:
    n = json.loads(r["note"]) if r.get("note") else {}
    entry, stop = float(r["avg_price"]), float(r["stop_price"])
    init = float(r["initial_stop_price"]) if r.get("initial_stop_price") is not None else stop
    return {"id": r["id"], "entry": entry, "qty": int(r["qty"]), "stop": stop, "initial_stop": init,
            "be": bool(n.get("be", stop >= entry)), "opened": r["opened_at"], "box_low": n.get("box_low"), "exit": n.get("exit")}


class Store:
    """연습 포지션을 sb_positions 에 쓴다. Supa 에 update 가 없어 id 로 upsert(전체 열)."""
    def __init__(self, db, log=print):
        self.db, self.log = db, log

    def _row(self, code: str, p: dict, **extra) -> dict:
        r = {"code": code, "account": ACCOUNT, "qty": p["qty"], "avg_price": p["entry"], "stop_price": p["stop"],
             "initial_stop_price": p["initial_stop"], "state": "tranche1", "entry_rule_id": "EN-1", "opened_at": p["opened"],
             "note": _note(p)}
        if p.get("id"):
            r["id"] = p["id"]
        r.update(extra)
        return r

    def open(self, code: str, p: dict) -> None:
        self.db.insert("sb_positions", [self._row(code, p)])
        got = self.db.select("sb_positions", f"select=id&code=eq.{code}&account=eq.{ACCOUNT}&closed_at=is.null&order=id.desc&limit=1")
        p["id"] = got[0]["id"] if got else None

    def update(self, code: str, p: dict) -> None:
        if p.get("id"):
            self.db.upsert("sb_positions", [self._row(code, p)], "id")

    def close(self, code: str, p: dict, rule: str, price: float, ts: str) -> None:
        pnl, r = r_multiple(p["entry"], p["initial_stop"], price, p["qty"])
        p["exit_rule"] = rule
        if p.get("id"):
            self.db.upsert("sb_positions", [self._row(code, p, state="closed", closed_at=ts, exit_price=price,
                                                       realized_pnl=pnl, r_multiple=r)], "id")

    def load_open(self) -> dict:
        rows = self.db.select("sb_positions", f"select=*&account=eq.{ACCOUNT}&closed_at=is.null&order=id")
        return {r["code"]: from_row(r) for r in rows}


def sync(cache: dict, db_open: dict, log=print) -> dict:
    """DB 우선: DB 열린 연습 포지션이 정답. 캐시에만 있는 종목은 버리고, 캐시의 EX-3 본전 표시는 DB 가 옛값일 때만 살린다."""
    out = {}
    for code, p in db_open.items():
        c = cache.get(code) or {}
        if c.get("be") and not p["be"] and c.get("id") == p["id"]:
            p.update(stop=c["stop"], be=True)
        out[code] = p
    for code in set(cache) - set(db_open):
        log(f"{code} 캐시에만 있는 연습 포지션 → 버림 (DB 우선)")
    return out


def mark_close_exits(db, log=print) -> list[str]:
    """bot.daily: 오늘 종가로 연습 보유 종가 퇴출 판정 → sb_positions.note.exit 에 '다음 장 시작 매도' 표시."""
    st, marked = Store(db, log), []
    for code, p in st.load_open().items():
        if p.get("exit"):
            continue
        bars = db.select("sb_candles", f"select=date,close&code=eq.{code}&source=neq.seed&order=date.desc&limit=40")[::-1]
        x = close_exit(p, bars)
        if x:
            p["exit"] = x
            st.update(code, p)
            marked.append(code)
            log(f"{code} 다음 장 시작 매도 표시: EX-5 {x['why']}")
    log(f"종가 퇴출 표시 {len(marked)}종목")
    return marked


def exited_approvals(db, codes: list[str]) -> dict:
    """sb_stocks.stage='exited' 인 종목 → {code: 퇴출 승인 시각(sb_stage_log)}."""
    if not codes:
        return {}
    ex = [s["code"] for s in db.select("sb_stocks", f"select=code&stage=eq.exited&code=in.({','.join(codes)})")]
    out = {}
    for c in ex:
        log = db.select("sb_stage_log", f"select=created_at&code=eq.{c}&to_stage=eq.exited&order=created_at.desc&limit=1")
        out[c] = log[0]["created_at"] if log else None
    return out


def uv3_mark(approved_at) -> dict:
    return {"rule": "UV-3", "why": "퇴출 승인 매도", "approved_at": approved_at,
            "seen": datetime.now(timezone(timedelta(hours=9))).isoformat(timespec="seconds")}
