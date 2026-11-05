"""시장별 비용·세금 상수(백테스트 전용). 엔진은 Params.market 으로 여기서 고른다. 규칙 숫자는 여기 두지 않는다.

KR: v1/v2 엔진 기본값 그대로(수수료 0.015%, 매도 거래세 0.25%, 슬리피지 매수·매도 0.1%, 손절 0.2%).
US: 일감 B(swingbot_data_us_2026-11)가 한투 공식 안내 링크와 함께 채울 자리. 그 전엔 임시값이고 verified=False.
    양도세 22%(연 250만원 공제)는 연 단위 세금이라 거래당 tax 로 넣지 않았다(tax=0). 반영 방식은 팀장 질문.
"""
from __future__ import annotations

COSTS = {
    "KR": dict(fee=0.00015, tax=0.0025, slip_buy=0.001, slip_sell=0.001, slip_stop=0.002, verified=True,
               source="엔진 v1 기본값(swingbot_backtest_spec_v1)"),
    "US": dict(fee=0.0025, tax=0.0, slip_buy=0.001, slip_sell=0.001, slip_stop=0.002, verified=False,
               source="임시값 — 일감 B 에서 한투 공식 수수료·환전 스프레드로 교체"),
}
