"""python3 -m unittest bot.test_live — 연습 모드 장중 판정 (네트워크 없음). 진입·손절·추격 금지·거래량 미달 + 위반 검사·재생."""
import json
import os
import tempfile
import unittest
from datetime import date, timedelta

os.environ.setdefault("SWINGBOT_HOME", tempfile.mkdtemp())
from bot.live import audit as A  # noqa: E402
from bot.live import exits as X  # noqa: E402
from bot.live import loop as L  # noqa: E402

W = {"code": "T", "pivot": 10000, "vol50": 1_000_000}


def book():
    out = []
    return L.Book({}, out.append), out


class Live(unittest.TestCase):
    def test_entry(self):
        v, why, n = L.entry_check(W, 10100, 600_000, "10:05", 100_000_000, gate=lambda c, p: [])
        self.assertEqual((v, why), ("order", "EN-1"))
        self.assertEqual(n["qty"], 2062)                  # 1억 x 1.25% ÷ (10,100 x 6%) = 2062.7 → 2062
        self.assertEqual(n["stop"], 9494.0)               # 10,100 x 0.94
        self.assertEqual(n["rr"], 2.0)
        b, out = book()
        b.buy("2026-11-06T10:05:00+09:00", "T", n)
        self.assertEqual(out[0]["source"], "practice")
        self.assertEqual(out[0]["planned_qty"], out[0]["qty"])
        self.assertEqual(A.check(out[0]), [])

    def test_stop_loss(self):
        b, out = book()
        _, _, n = L.entry_check(W, 10000.5, 600_000, "09:30", 100_000_000)
        b.buy("t0", "T", n)
        self.assertIsNone(b.on_price("t1", "T", 9500, "10:00"))
        self.assertEqual(b.on_price("t2", "T", 9400, "13:10"), "EX-1")   # 9,400.47 이하 → 손절 매도 주문서
        self.assertEqual((out[1]["side"], out[1]["rule_id"], out[1]["qty"]), ("sell", "EX-1", out[0]["qty"]))
        self.assertNotIn("T", b.pos)
        self.assertEqual([A.check(o) for o in out], [[], []])

    def test_breakeven_ex3(self):
        b, out = book()
        _, _, n = L.entry_check(W, 10050, 600_000, "09:30", 100_000_000)
        b.buy("t0", "T", n)                                                # 손절 9,447 → 1R 603, 3R 1,809
        self.assertIsNone(b.on_price("t1", "T", 10653, "10:40"))           # +1R 로는 안 올림(v2까지의 오역)
        self.assertIsNone(b.on_price("t1", "T", 11858, "10:50"))
        self.assertEqual(b.on_price("t2", "T", 11859, "11:00"), "EX-3")   # +3R (손절폭 x3)
        self.assertEqual(b.pos["T"]["stop"], 10050)
        self.assertEqual(b.on_price("t3", "T", 10050, "14:00"), "EX-1")   # 본전 손절
        self.assertEqual(A.check(out[1]), [])

    def test_be_r_same_as_backtest(self):
        self.assertEqual(L.BE_R, 3.0)
        try:
            from bot.backtest.engine import Params
        except ImportError:                                               # VPS 봇은 numpy·pandas 없이 돈다
            self.skipTest("numpy/pandas 없음")
        self.assertEqual(L.BE_R, Params().be_r)                           # 연습·백테스트 같은 숫자

    def test_no_chase(self):
        v, why, _ = L.entry_check(W, 10301, 2_000_000, "09:10", 100_000_000, gate=lambda c, p: [])
        self.assertEqual(v, "wait")
        self.assertTrue(why.startswith("EN-2"))
        self.assertEqual(L.entry_check(W, 10300, 2_000_000, "09:10", 100_000_000)[0], "order")   # 피봇 x 1.03 은 허용

    def test_volume_short(self):
        self.assertEqual(L.entry_check(W, 10100, 499_999, "10:30", 100_000_000)[0], "wait")      # 11:00 전엔 대기
        v, why, _ = L.entry_check(W, 10100, 499_999, "11:00", 100_000_000)
        self.assertEqual(v, "skip")
        self.assertIn("거래량 미달", why)

    def test_gate_blocks(self):
        v, why, _ = L.entry_check(W, 10100, 600_000, "10:00", 100_000_000, gate=lambda c, p: ["MF-1: 시장 폭풍(관망), 신규 진입 없음"])
        self.assertEqual(v, "skip")
        self.assertIn("MF-1", why)

    def test_audit_catches(self):
        b, out = book()
        _, _, n = L.entry_check(W, 10100, 600_000, "10:05", 100_000_000)
        b.buy("t", "T", n)
        o = dict(out[0], price=10400, qty=5000)
        o["note"] = json.dumps(dict(json.loads(o["note"]), vol_ref=100))
        bad = " ".join(A.check(o))
        for k in ("EN-2", "EN-1 거래량", "SZ-1", "EX-1 손절선"):
            self.assertIn(k, bad)
        self.assertEqual(A.report([out[0], o]), 1)

    def test_replay_breakout(self):
        anchors = [(0, 100), (200, 200), (220, 170), (240, 195), (255, 180), (268, 193), (278, 186), (290, 192), (299, 191), (300, 196), (310, 215), (325, 235)]

        def val(i):
            for (a, pa), (b_, pb) in zip(anchors, anchors[1:]):
                if a <= i <= b_:
                    return pa + (pb - pa) * (i - a) / (b_ - a)
        d, c = date(2025, 8, 1), []
        for i in range(326):
            p = val(i)
            c.append({"date": d.isoformat(), "open": p, "high": p * 1.005, "low": p * 0.995, "close": p,
                      "volume": 3_000_000 if i == 300 else (1_000_000 if i < 200 else 600_000)})
            d += timedelta(days=1)
            while d.weekday() > 4:
                d += timedelta(days=1)
        orders, events, stat = L.replay({"T": c}, c[299]["date"], c[-1]["date"], 1e8)
        self.assertEqual(orders[0]["side"], "buy")
        self.assertEqual(orders[0]["ts"][:10], c[300]["date"])          # 전날까지 일봉의 피봇 194 를 300번째 날 돌파
        self.assertEqual(json.loads(orders[0]["note"])["pivot"], 194)
        self.assertEqual(orders[0]["price"], 196)                        # max(시가 196, 피봇 194), 194 x 1.03 이내
        self.assertEqual(A.report(orders), 0)
        self.assertEqual(len(events), 1)                                 # 고가 ≥ 196 + 3 x 11.76 = 231.28 → EX-3 한 번
        self.assertGreaterEqual(events[0]["price"], 231.28)


def bars(closes, start=date(2026, 10, 1)):
    out, d = [], start
    for c in closes:
        out.append({"date": d.isoformat(), "open": c, "high": c, "low": c, "close": c, "volume": 1})
        d += timedelta(days=1)
        while d.weekday() > 4:
            d += timedelta(days=1)
    return out


class FakeStore:
    def __init__(self):
        self.calls, self.rows = [], {}

    def open(self, code, p):
        p["id"] = len(self.rows) + 1
        self.rows[p["id"]] = dict(p, code=code)
        self.calls.append(("open", code))

    def update(self, code, p):
        self.rows[p["id"]].update(p)
        self.calls.append(("update", code))

    def close(self, code, p, rule, price, ts):
        pnl, r = X.r_multiple(p["entry"], p["initial_stop"], price, p["qty"])
        self.rows[p["id"]].update(closed_at=ts, exit_price=price, realized_pnl=pnl, r_multiple=r, exit_rule=rule)
        self.calls.append(("close", code))


class Exits(unittest.TestCase):
    """지시서 2026-11-27 3절: 20일선 3일·박스 하단·손절 우선·UV-3·r_multiple."""
    POS = {"entry": 10000, "stop": 9400, "initial_stop": 9400, "opened": "2026-10-01", "box_low": None}

    def test_ma20_three_days(self):
        up = [100.0] * 20
        self.assertIsNone(X.close_exit(self.POS, bars(up + [99, 98])))           # 2일이면 유지
        x = X.close_exit(self.POS, bars(up + [99, 98, 97]))                      # 3일 연속 → 다음 장 매도
        self.assertEqual((x["rule"], x["ma20_days"]), ("EX-5", 3))
        self.assertIn("20일선", x["why"])
        self.assertIsNone(X.close_exit(self.POS, bars(up + [99, 98, 101, 97])))  # 중간에 위로 마감하면 다시 센다

    def test_ma20_counts_from_entry(self):
        b = bars([100.0] * 20 + [99, 98, 97])
        self.assertIsNone(X.close_exit(dict(self.POS, opened=b[-2]["date"]), b))   # 진입 전 날은 안 센다

    def test_box_low(self):
        p = dict(self.POS, box_low=95)
        self.assertIsNone(X.close_exit(p, bars([100.0] * 20 + [95])))           # 같으면 이탈 아님
        x = X.close_exit(p, bars([100.0] * 20 + [94.9]))
        self.assertEqual(x["rule"], "EX-5")
        self.assertIn("박스 하단", x["why"])

    def test_next_open_sell_and_r(self):
        out, st = [], FakeStore()
        b = L.Book({}, out.append, store=st)
        _, _, n = L.entry_check(W, 10000.5, 600_000, "09:30", 100_000_000)
        b.buy("2026-11-20T09:30:00+09:00", "T", n, box_low=9600)
        self.assertEqual(st.rows[1]["box_low"], 9600)
        self.assertEqual(out[0]["position_id"], 1)
        b.mark_exit("T", {"rule": "EX-5", "why": "박스 하단 종가 이탈", "as_of": "2026-11-20", "close": 9550, "box_low": 9600, "ma20_days": 0})
        self.assertEqual(b.on_price("2026-11-21T09:00:05+09:00", "T", 9700, "09:00"), "EX-5")   # 다음 장 첫 조회가
        self.assertEqual((out[1]["side"], out[1]["rule_id"]), ("sell", "EX-5"))
        self.assertEqual(A.check(out[1]), [])
        row = st.rows[1]
        q = out[0]["qty"]
        self.assertEqual(row["exit_price"], 9700)
        self.assertEqual(row["realized_pnl"], round(q * (9700 - 10000.5), 2))
        self.assertAlmostEqual(row["r_multiple"], round((9700 - 10000.5) / (10000.5 - n["stop"]), 3), places=3)
        self.assertEqual(row["exit_rule"], "EX-5")

    def test_stop_beats_close_exit(self):
        out = []
        b = L.Book({}, out.append)
        _, _, n = L.entry_check(W, 10000.5, 600_000, "09:30", 100_000_000)
        b.buy("t0", "T", n)
        b.mark_exit("T", {"rule": "EX-5", "why": "20일선 아래 종가 3거래일 연속", "as_of": "2026-11-20", "ma20_days": 3})
        self.assertEqual(b.on_price("2026-11-21T09:00:05+09:00", "T", 9300, "09:00"), "EX-1")   # 같은 날 손절이면 손절만
        self.assertEqual([o["rule_id"] for o in out], ["EN-1", "EX-1"])

    def test_ex3_updates_store(self):
        st = FakeStore()
        b = L.Book({}, [].append, store=st)
        _, _, n = L.entry_check(W, 10050, 600_000, "09:30", 100_000_000)
        b.buy("t0", "T", n)
        b.on_price("t1", "T", 11859, "11:00")
        self.assertEqual(st.rows[1]["stop"], 10050)
        self.assertIn(("update", "T"), st.calls)

    def test_exited_stage_uv3(self):
        out = []
        b = L.Book({}, out.append)
        _, _, n = L.entry_check(W, 10100, 600_000, "10:05", 100_000_000)
        b.buy("t0", "T", n)

        class DB:
            def select(self, table, q):
                return {"sb_stocks": [{"code": "T"}], "sb_stage_log": [{"created_at": "2026-11-26T20:00:00+09:00"}]}[table]
        for code, at in X.exited_approvals(DB(), list(b.pos)).items():
            b.mark_exit(code, X.uv3_mark(at))
        self.assertEqual(b.on_price("2026-11-27T09:00:05+09:00", "T", 10500, "09:00"), "UV-3")
        note = json.loads(out[1]["note"])
        self.assertEqual((out[1]["rule_id"], note["why"], note["exit"]["approved_at"]), ("UV-3", "퇴출 승인 매도", "2026-11-26T20:00:00+09:00"))
        self.assertEqual(A.check(out[1]), [])

    def test_sync_db_first(self):
        db = {"A": {"id": 1, "entry": 100, "qty": 1, "stop": 94, "initial_stop": 94, "be": False, "opened": "x"}}
        cache = {"A": {"id": 1, "stop": 100, "be": True}, "Z": {"id": 9}}
        got = X.sync(cache, db, log=lambda *_: None)
        self.assertEqual(list(got), ["A"])                     # 캐시에만 있는 Z 는 버림
        self.assertEqual((got["A"]["stop"], got["A"]["be"]), (100, True))

    def test_audit_ex5_same_day(self):
        o = {"ts": "2026-11-20T15:30:00+09:00", "code": "T", "side": "sell", "qty": 1, "price": 9500, "rule_id": "EX-5",
             "note": json.dumps({"stop": 9400, "exit": {"rule": "EX-5", "as_of": "2026-11-20", "ma20_days": 3}})}
        self.assertTrue(any("다음 장" in b for b in A.check(o)))

    def test_replay_close_exit_next_open(self):
        anchors = [(0, 100), (200, 200), (220, 170), (240, 195), (255, 180), (268, 193), (278, 186), (290, 192), (299, 191), (300, 196), (306, 199), (316, 188)]

        def val(i):
            for (a, pa), (b_, pb) in zip(anchors, anchors[1:]):
                if a <= i <= b_:
                    return pa + (pb - pa) * (i - a) / (b_ - a)
        d, c = date(2025, 8, 1), []
        for i in range(317):
            p = val(i)
            c.append({"date": d.isoformat(), "open": p, "high": p * 1.005, "low": p * 0.995, "close": p,
                      "volume": 3_000_000 if i == 300 else (1_000_000 if i < 200 else 600_000)})
            d += timedelta(days=1)
            while d.weekday() > 4:
                d += timedelta(days=1)
        orders, _, _ = L.replay({"T": c}, c[299]["date"], c[-1]["date"], 1e8)
        sells = [o for o in orders if o["side"] == "sell"]
        self.assertEqual(sells[0]["rule_id"], "EX-5")                     # 손절(184.24)보다 먼저 20일선 3일 이탈
        x = json.loads(sells[0]["note"])["exit"]
        self.assertGreater(sells[0]["ts"][:10], x["as_of"])               # 판정 다음 거래일
        k = next(i for i, b in enumerate(c) if b["date"] == sells[0]["ts"][:10])
        self.assertEqual(sells[0]["price"], c[k]["open"])                 # 다음 날 시가
        self.assertEqual(A.report(orders), 0)


if __name__ == "__main__":
    unittest.main()
