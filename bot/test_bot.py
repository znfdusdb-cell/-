"""python3 -m unittest bot.test_bot — 네트워크 없이 파싱·페이징·토큰 캐시 확인"""
import json
import os
import tempfile
import unittest
from datetime import date

os.environ["SWINGBOT_HOME"] = tempfile.mkdtemp()
from bot import kis as K  # noqa: E402


def row(d, c):
    return {"stck_bsop_date": d, "stck_oprc": str(c), "stck_hgpr": str(c + 100), "stck_lwpr": str(c - 100), "stck_clpr": str(c), "acml_vol": "1000"}


class FakeHttp:
    """날짜 범위 안 거래일(평일)을 최신순 최대 100개 돌려주는 가짜 한투."""
    def __init__(self, first="20250101"):
        self.calls, self.tokens, self.first = 0, 0, first

    def __call__(self, method, url, headers, body):
        if url.endswith("/oauth2/tokenP"):
            self.tokens += 1
            return {"access_token": "T", "access_token_token_expired": "2099-01-01 00:00:00"}
        self.calls += 1
        q = dict(p.split("=") for p in url.split("?")[1].split("&"))
        s, e = date(int(q["FID_INPUT_DATE_1"][:4]), int(q["FID_INPUT_DATE_1"][4:6]), int(q["FID_INPUT_DATE_1"][6:])), date(int(q["FID_INPUT_DATE_2"][:4]), int(q["FID_INPUT_DATE_2"][4:6]), int(q["FID_INPUT_DATE_2"][6:]))
        first = date(int(self.first[:4]), int(self.first[4:6]), int(self.first[6:]))
        out, d = [], e
        from datetime import timedelta
        while d >= max(s, first) and len(out) < 100:
            if d.weekday() < 5:
                out.append(row(d.strftime("%Y%m%d"), 1000 + d.toordinal() % 50))
            d -= timedelta(days=1)
        return {"rt_cd": "0", "output1": {"hts_kor_isnm": "테스트"}, "output2": out + [{}]}


class T(unittest.TestCase):
    def test_parse_skips_empty(self):
        r = K.parse_candles("A", [row("20261021", 224000), {}, {"stck_bsop_date": ""}])
        self.assertEqual(len(r), 1)
        self.assertEqual(r[0]["date"], "2026-10-21")
        self.assertEqual(r[0]["source"], "kis")

    def test_paging_two_years(self):
        h = FakeHttp()
        k = K.Kis("key123456", "sec", http=h)
        name, rows = k.daily("A", date(2024, 9, 22), date(2026, 10, 22))
        self.assertEqual(name, "테스트")
        dates = [r["date"] for r in rows]
        self.assertEqual(dates, sorted(set(dates)))
        self.assertEqual(dates[0], "2025-01-01")   # 상장 전 구간은 빈 응답 → 멈춤
        self.assertEqual(dates[-1], "2026-10-22")
        self.assertLessEqual(h.calls, 6)

    def test_token_cached(self):
        h = FakeHttp()
        K.Kis("key123456", "sec", http=h).token()
        K.Kis("key123456", "sec", http=h).token()
        self.assertEqual(h.tokens, 1)
        self.assertEqual(oct(K.TOKEN_FILE.stat().st_mode & 0o777), "0o600")

    def test_rate_limit_retry(self):
        seq = [{"rt_cd": "1", "msg_cd": "EGW00201", "msg1": "초당 거래건수를 초과"}, {"rt_cd": "0", "output2": []}]
        def http(m, u, h, b):
            return {"access_token": "T", "access_token_token_expired": "2099-01-01 00:00:00"} if u.endswith("tokenP") else seq.pop(0)
        K.time.sleep = lambda s: None
        _, rows = K.Kis("zzz999999", "s", http=http).daily_page("A", date(2026, 1, 1), date(2026, 1, 2))
        self.assertEqual(rows, [])


    def test_setup_vcp(self):
        from datetime import date as D, timedelta as TD
        from bot.setups import compute
        anchors = [(0, 100), (200, 200), (220, 170), (240, 195), (255, 180), (268, 193), (278, 186), (290, 192), (299, 191)]
        def val(i):
            for (a, pa), (b, pb) in zip(anchors, anchors[1:]):
                if a <= i <= b:
                    return pa + (pb - pa) * (i - a) / (b - a)
        d, c = D(2025, 8, 1), []
        for i in range(300):
            p = val(i)
            c.append({"date": d.isoformat(), "open": p, "high": p * 1.005, "low": p * 0.995, "close": p, "volume": 1000000 if i < 200 else 600000})
            d += TD(days=1)
            while d.weekday() > 4:
                d += TD(days=1)
        r = compute("T", c)
        self.assertEqual(r["setup_type"], "vcp")
        self.assertEqual(r["t_count"], 3)
        self.assertEqual(r["pivot"], 194)
        self.assertEqual(r["trend_template_score"], 7)   # TT8 보류
        self.assertTrue(r["checklist"][2]["pass"])        # 흔들림 축소 + 마지막 10% 이내
        self.assertIsNone(r["drawdown_vs_market"])        # UV-4 보류

    def test_setup_short_history_pending(self):
        from bot.setups import compute
        c = [{"date": f"2026-0{1 + i // 28}-{1 + i % 28:02d}", "open": 100, "high": 101, "low": 99, "close": 100, "volume": 1} for i in range(100)]
        r = compute("S", c)
        tt = {x["key"]: x for x in r["trend_template"]}
        self.assertTrue(tt["tt6"]["pending"] and tt["tt7"]["pending"] and tt["tt1"]["pending"])


if __name__ == "__main__":
    unittest.main()
