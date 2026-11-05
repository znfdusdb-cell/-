"""python3 -m unittest bot.test_live — 연습 모드 장중 판정 (네트워크 없음). 진입·손절·추격 금지·거래량 미달 + 위반 검사·재생."""
import json
import os
import tempfile
import unittest
from datetime import date, timedelta

os.environ.setdefault("SWINGBOT_HOME", tempfile.mkdtemp())
from bot.live import audit as A  # noqa: E402
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
        b.buy("t0", "T", n)                                                # 손절 9,447 → 1R 603
        self.assertIsNone(b.on_price("t1", "T", 10652, "10:40"))
        self.assertEqual(b.on_price("t2", "T", 10653, "11:00"), "EX-3")   # +1R
        self.assertEqual(b.pos["T"]["stop"], 10050)
        self.assertEqual(b.on_price("t3", "T", 10050, "14:00"), "EX-1")   # 본전 손절
        self.assertEqual(A.check(out[1]), [])

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
        anchors = [(0, 100), (200, 200), (220, 170), (240, 195), (255, 180), (268, 193), (278, 186), (290, 192), (299, 191), (300, 196), (310, 215)]

        def val(i):
            for (a, pa), (b_, pb) in zip(anchors, anchors[1:]):
                if a <= i <= b_:
                    return pa + (pb - pa) * (i - a) / (b_ - a)
        d, c = date(2025, 8, 1), []
        for i in range(311):
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
        self.assertEqual(len(events), 1)                                 # 215 > 194 x 1.06 → EX-3


if __name__ == "__main__":
    unittest.main()
