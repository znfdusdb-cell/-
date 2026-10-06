import type { MarketRegime } from "@/lib/types";
import { REGIME_LABEL, REGIME_HINT } from "@/lib/constants";
import { fmtNum, fmtDate } from "@/lib/format";

const COLOR = { trade: "bg-go", reduce: "bg-warn", wait: "bg-stop" } as const;
const TEXT = { trade: "text-go", reduce: "text-warn", wait: "text-stop" } as const;

export function MarketLight({ regime }: { regime: MarketRegime | null }) {
  if (!regime) {
    return (
      <section className="rounded-xl border border-line bg-bg-2 p-4">
        <p className="text-sm text-fg-2">시장 신호 없음. 봇이 sb_market_regime 에 오늘 판정을 쓰면 여기 뜬다.</p>
      </section>
    );
  }
  const s = regime.signal;
  return (
    <section className="rounded-xl border border-line bg-bg-2 p-4">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5 rounded-full bg-bg-3 px-2 py-1.5">
          {(["trade", "reduce", "wait"] as const).map((k) => (
            <span key={k} className={`h-4 w-4 rounded-full ${k === s ? COLOR[k] : "bg-line"}`} />
          ))}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className={`text-xl font-bold ${TEXT[s]}`}>{REGIME_LABEL[s]}</span>
            <span className="text-xs text-fg-3">{fmtDate(regime.as_of)} 판정</span>
          </div>
          <p className="text-sm text-fg-2">{REGIME_HINT[s]}</p>
        </div>
      </div>
      <dl className="num mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-fg-2 sm:grid-cols-4">
        <Row k="코스피 / 200일선" v={`${fmtNum(regime.kospi_close)} / ${fmtNum(regime.kospi_ma200)}`} />
        <Row k="코스닥 / 200일선" v={`${fmtNum(regime.kosdaq_close)} / ${fmtNum(regime.kosdaq_ma200)}`} />
        <Row k="VKOSPI" v={fmtNum(regime.vkospi, 1)} />
        <Row k="단일종목 레버리지 ETF 비중" v={regime.lev_etf_turnover_share_pct === null ? "—" : `${fmtNum(regime.lev_etf_turnover_share_pct, 1)}%`} />
      </dl>
      {regime.reasons.length > 0 && (
        <ul className="mt-3 space-y-0.5 border-t border-line pt-2 text-xs text-fg-2">
          {regime.reasons.map((r, i) => (
            <li key={i}>· {r}</li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-2 sm:flex-col sm:gap-0">
      <dt className="text-fg-3">{k}</dt>
      <dd className="text-fg">{v}</dd>
    </div>
  );
}
