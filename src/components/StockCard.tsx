import Link from "next/link";
import type { StockSummary } from "@/lib/types";
import { POSITION_STATE_LABEL, SETUP_TYPE_LABEL } from "@/lib/constants";
import { fmtNum, fmtPct, pctChange, udClass, footprint, fmtDate } from "@/lib/format";
import { universeGuard } from "@/lib/guards";

export function StockCard({ s }: { s: StockSummary }) {
  const { stock, thesis, setup, position } = s;
  const chg = pctChange(s.last_close, s.prev_close);
  const violated = thesis?.status === "suspect" || thesis?.invalidation_conditions.some((c) => c.violated);
  const guard = stock.stage === "review" ? universeGuard(thesis) : null;
  const pnl = position && s.last_close ? pctChange(s.last_close, position.avg_price) : null;
  const toPivot = setup?.pivot && s.last_close ? pctChange(s.last_close, setup.pivot) : null;

  return (
    <Link
      href={`/stocks/${stock.code}`}
      className={`block rounded-xl border bg-bg-2 p-3 transition active:scale-[0.99] ${violated ? "border-stop/70" : "border-line hover:border-fg-3"}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-semibold leading-tight">{stock.name}</div>
          <div className="text-[11px] text-fg-3">
            {stock.code} · {stock.market} · {stock.sector ?? "업종 미정"} · {fmtDate(stock.stage_changed_at)}
          </div>
        </div>
        <div className="num text-right">
          <div className="font-semibold">{fmtNum(s.last_close)}</div>
          <div className={`text-xs ${udClass(chg)}`}>{fmtPct(chg, 2)}</div>
        </div>
      </div>

      <div className="mt-2 flex flex-wrap gap-1 text-[11px]">
        {violated && <Badge tone="stop">무효화 조건 위반</Badge>}
        {guard && <Badge tone="warn">{guard.replace("UV-2: ", "")}</Badge>}
        {position && <Badge tone="fg">{POSITION_STATE_LABEL[position.state]} · {position.qty}주</Badge>}
        {setup && setup.setup_type !== "none" && <Badge tone="muted">{SETUP_TYPE_LABEL[setup.setup_type]}</Badge>}
      </div>

      <dl className="num mt-2 grid grid-cols-3 gap-1 text-[11px] text-fg-2">
        <Cell k="발자국" v={setup ? footprint(setup.footprint_weeks, setup.max_contraction_pct, setup.min_contraction_pct, setup.t_count) : "—"} />
        {position ? (
          <>
            <Cell k="평단/손절" v={`${fmtNum(position.avg_price)} / ${fmtNum(position.stop_price)}`} />
            <Cell k="손익" v={fmtPct(pnl, 2)} cls={udClass(pnl)} />
          </>
        ) : (
          <>
            <Cell k="피봇" v={setup?.pivot ? fmtNum(setup.pivot) : "—"} />
            <Cell k="피봇까지" v={fmtPct(toPivot, 1)} cls={udClass(toPivot)} />
          </>
        )}
        <Cell k="TT" v={setup ? `${setup.trend_template_score}/8` : "—"} />
        <Cell k="체크" v={setup ? `${setup.checklist_score}/7` : "—"} />
        <Cell k="거래량 마름" v={setup?.volume_dry_days != null ? `${setup.volume_dry_days}일` : "—"} />
      </dl>
    </Link>
  );
}

function Cell({ k, v, cls }: { k: string; v: string; cls?: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-fg-3">{k}</dt>
      <dd className={`truncate ${cls ?? "text-fg"}`}>{v}</dd>
    </div>
  );
}

export function Badge({ tone, children }: { tone: "stop" | "warn" | "fg" | "muted" | "go"; children: React.ReactNode }) {
  const cls = {
    stop: "border-stop/60 bg-stop/10 text-stop",
    warn: "border-warn/60 bg-warn/10 text-warn",
    go: "border-go/60 bg-go/10 text-go",
    fg: "border-fg-3 bg-bg-3 text-fg",
    muted: "border-line bg-bg-3 text-fg-2",
  }[tone];
  return <span className={`rounded-full border px-1.5 py-0.5 ${cls}`}>{children}</span>;
}
