"""공통 통과 기준(일감 C, 2026-11-05). 결과를 보기 전에 고정한 상수다(회장 원칙 42) — 결과에 맞춰 고치지 않는다.
모든 시장에 같은 기준. 시장마다 따로 판정하고 서로 영향 없음. 출력은 PASS / WAIT 둘뿐.

- 비용·세금 후 거래당 기댓값 > 0
- MDD ≤ 15%
- 거래 ≥ 100건 (익절 절반은 2행으로 센다 — engine.stats 와 같은 기준)
- 최근 2년(2024-11-01~2026-10-31)을 따로 떼어 그 구간 기댓값도 > 0 (구간 = 진입일 기준)
- 데이터에 생존 편향(상폐 종목 빠짐)이 있으면 기댓값 기준(전체·최근 둘 다)을 +0.5%p 올린다
"""
from __future__ import annotations

import pandas as pd

from .engine import stats

EXP_MIN = 0.0
MDD_MAX = 0.15
N_MIN = 100
RECENT = ("2024-11-01", "2026-10-31")
BIAS_ADD = 0.005


def window(res, a, b) -> dict:
    eq, ex = res.equity[a:b], res.exposure[a:b]
    tr = [t for t in res.trades if pd.Timestamp(a) <= t["entry"] <= pd.Timestamp(b)]
    return stats(tr, eq, ex)


def verdict(res, survivorship_bias: bool) -> tuple[str, dict]:
    """(PASS|WAIT, 항목별 값·통과 여부)."""
    s, r = stats(res.trades, res.equity, res.exposure), window(res, *RECENT)
    e_min = EXP_MIN + (BIAS_ADD if survivorship_bias else 0.0)
    chk = {
        "exp": (s.get("exp", 0.0), s.get("exp", 0.0) > e_min),
        "mdd": (s["mdd"], s["mdd"] >= -MDD_MAX),
        "n": (s["n"], s["n"] >= N_MIN),
        "recent_exp": (r.get("exp", 0.0), r.get("exp", 0.0) > e_min),
    }
    chk["exp_min"] = (e_min, True)
    return ("PASS" if all(ok for _, ok in chk.values()) else "WAIT"), chk
