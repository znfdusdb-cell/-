"use client";

import { useEffect, useRef } from "react";
import type { Candle, Setup, Position } from "@/lib/types";

/**
 * 일봉 + 피봇선(주황) + 손절선(파랑) + C 박스 띠(회색 반투명) + 거래량.
 * 상승 빨강 / 하락 파랑 (한국 증권앱 관례).
 */
export function CandleChart({ candles, setup, position }: { candles: Candle[]; setup: Setup | null; position: Position | null }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || !candles.length) return;
    let disposed = false;
    let cleanup = () => {};

    (async () => {
      const lc = await import("lightweight-charts");
      if (disposed) return;
      const { createChart, CandlestickSeries, HistogramSeries, BaselineSeries, LineStyle, ColorType } = lc;

      const chart = createChart(el, {
        layout: { background: { type: ColorType.Solid, color: "transparent" }, textColor: "#9aa3b5", fontSize: 11 },
        grid: { vertLines: { color: "#1a1e27" }, horzLines: { color: "#1a1e27" } },
        rightPriceScale: { borderColor: "#262b36" },
        timeScale: { borderColor: "#262b36", rightOffset: 4 },
        crosshair: { mode: 0 },
        handleScroll: { vertTouchDrag: false },
        height: el.clientHeight || 320,
        autoSize: true,
        localization: { locale: "ko-KR", priceFormatter: (p: number) => p.toLocaleString("ko-KR", { maximumFractionDigits: 0 }) },
      });

      // C 박스 띠: 하단을 기준값으로 두고 상단을 상수 선으로 그리면 그 사이가 채워진다.
      if (setup?.cbox_high && setup?.cbox_low) {
        const start = setup.cbox_start ?? candles[Math.max(0, candles.length - 40)].date;
        const band = chart.addSeries(BaselineSeries, {
          baseValue: { type: "price", price: setup.cbox_low },
          topLineColor: "rgba(154,163,181,0.35)",
          topFillColor1: "rgba(154,163,181,0.16)",
          topFillColor2: "rgba(154,163,181,0.10)",
          bottomLineColor: "rgba(0,0,0,0)",
          bottomFillColor1: "rgba(0,0,0,0)",
          bottomFillColor2: "rgba(0,0,0,0)",
          lineWidth: 1,
          priceLineVisible: false,
          lastValueVisible: false,
          crosshairMarkerVisible: false,
        });
        band.setData(candles.filter((c) => c.date >= start).map((c) => ({ time: c.date, value: setup.cbox_high! })));
        band.createPriceLine({ price: setup.cbox_low, color: "rgba(154,163,181,0.6)", lineWidth: 1, lineStyle: LineStyle.Dotted, axisLabelVisible: true, title: "C하단" });
      }

      const vol = chart.addSeries(HistogramSeries, { priceFormat: { type: "volume" }, priceScaleId: "vol", lastValueVisible: false, priceLineVisible: false });
      chart.priceScale("vol").applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
      vol.setData(candles.map((c) => ({ time: c.date, value: c.volume, color: c.close >= c.open ? "rgba(240,68,82,0.35)" : "rgba(49,130,246,0.35)" })));

      const cs = chart.addSeries(CandlestickSeries, {
        upColor: "#f04452", downColor: "#3182f6", borderUpColor: "#f04452", borderDownColor: "#3182f6", wickUpColor: "#f04452", wickDownColor: "#3182f6",
      });
      cs.setData(candles.map((c) => ({ time: c.date, open: c.open, high: c.high, low: c.low, close: c.close })));

      if (setup?.pivot) {
        cs.createPriceLine({ price: setup.pivot, color: "#f59e0b", lineWidth: 2, lineStyle: LineStyle.Solid, axisLabelVisible: true, title: "피봇" });
      }
      if (position) {
        if (position.stop_price !== null) {
          cs.createPriceLine({ price: position.stop_price, color: "#3182f6", lineWidth: 2, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: "손절" });
        }
        cs.createPriceLine({ price: position.avg_price, color: "#9aa3b5", lineWidth: 1, lineStyle: LineStyle.Dotted, axisLabelVisible: true, title: "평단" });
      }

      chart.timeScale().setVisibleLogicalRange({ from: Math.max(0, candles.length - 90), to: candles.length + 3 });
      cleanup = () => chart.remove();
    })();

    return () => {
      disposed = true;
      cleanup();
    };
  }, [candles, setup, position]);

  if (!candles.length) {
    return <div className="flex h-72 items-center justify-center rounded-xl border border-dashed border-line text-xs text-fg-3">일봉 없음. 봇이 sb_candles 에 적재하면 표시된다.</div>;
  }
  const fake = candles.some((c) => c.source === "seed");
  return (
    <div className="relative">
      {fake && <span className="absolute left-0 top-0 z-10 rounded-full border border-warn/60 bg-warn/15 px-2 py-0.5 text-[11px] text-warn">가짜 일봉 (실제 적재 전)</span>}
      <div ref={ref} className="h-80 w-full" />
      <div className="mt-1 flex flex-wrap gap-3 text-[11px] text-fg-3">
        <Legend c="#f59e0b" t="피봇 (C 박스/베이스 고점)" />
        <Legend c="#3182f6" t="손절선" dashed />
        <Legend c="rgba(154,163,181,0.5)" t="C 박스 띠" />
      </div>
    </div>
  );
}

function Legend({ c, t, dashed }: { c: string; t: string; dashed?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className="inline-block h-0 w-4 border-t-2" style={{ borderColor: c, borderStyle: dashed ? "dashed" : "solid" }} />
      {t}
    </span>
  );
}
