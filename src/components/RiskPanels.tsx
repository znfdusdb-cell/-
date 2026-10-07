import type { Settings, Proposal } from "@/lib/types";
import type { RiskPanelData } from "@/lib/repo";
import { RISK_LEVEL_LABEL, RISK_LEVEL_EASY, PROPOSAL_KIND_LABEL, AUTHOR_LABEL } from "@/lib/constants";
import { fmtNum, fmtDate, fmtDateTime } from "@/lib/format";
import { Section } from "./DetailPanels";
import { Badge } from "./StockCard";

const LEVEL_TONE = { caution: "text-down", normal: "text-fg", bold: "text-up" } as const;

export function RiskDialPanel({ d, settings, easy }: { d: RiskPanelData; settings: Settings; easy?: boolean }) {
  const lvl = d.risk?.level ?? ((settings.risk_level as "caution" | "normal" | "bold") || "normal");
  const stockCap = settings[`risk_stock_pct_${lvl}`] ?? "—";
  const tradeCap = settings[`risk_trade_pct_${lvl}`] ?? "—";
  const minTrades = Number(settings.risk_min_trades_for_bold ?? 30);
  return (
    <Section title={easy ? "오늘 봇이 조심하는 정도" : "RS-1 리스크 다이얼"} right={<span className="text-[11px] text-fg-3">{d.risk ? `${fmtDate(d.risk.as_of)} 장 전 판정` : "판정 기록 없음"}</span>}>
      <div className="flex items-center gap-3">
        <div className="flex gap-1">
          {(["caution", "normal", "bold"] as const).map((k) => (
            <span key={k} className={`rounded-md px-2 py-1 text-xs ${k === lvl ? "bg-fg text-bg" : "bg-bg-3 text-fg-3"}`}>{RISK_LEVEL_LABEL[k]}</span>
          ))}
        </div>
        <span className={`text-lg font-bold ${LEVEL_TONE[lvl]}`}>{RISK_LEVEL_LABEL[lvl]}</span>
      </div>
      <p className="mt-2 text-sm text-fg-2">{easy ? RISK_LEVEL_EASY[lvl] : `종목당 ${stockCap}% · 거래당 리스크 ${tradeCap}% · 업종 ${settings.max_weight_per_sector_pct ?? "—"}% 고정`}</p>
      {d.risk?.reasons.length ? (
        <ul className="mt-2 space-y-0.5 text-xs text-fg-3">{d.risk.reasons.map((r, i) => <li key={i}>· {r}</li>)}</ul>
      ) : null}
      {!easy && (
        <p className="mt-2 text-[11px] text-fg-3">하향은 즉시(흐림·연속 손절 {settings.risk_consecutive_loss_down ?? 2}회·30거래 기댓값 마이너스 중 하나), 상향은 한 단계씩(맑음·누적 {minTrades}거래·기댓값 플러스 전부). 폭풍이면 신규 진입 없음.</p>
      )}
    </Section>
  );
}

export function TradesPanel({ d, settings, easy }: { d: RiskPanelData; settings: Settings; easy?: boolean }) {
  const t = d.trades;
  const tmin = settings.target_return_pct_min ?? "20", tmax = settings.target_return_pct_max ?? "30";
  const p = d.pace;
  return (
    <Section title={easy ? "성적표는 30번마다" : "RS-2 30거래 평가 · RS-3 목표 대비 페이스"}>
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-lg bg-bg-3 p-2">
          <div className="text-[11px] text-fg-3">{easy ? "이번 묶음" : `${t.batch_no}번째 묶음`}</div>
          <div className="num text-lg font-bold">{t.in_batch}<span className="text-xs font-normal text-fg-3">/30</span></div>
        </div>
        <div className="rounded-lg bg-bg-3 p-2">
          <div className="text-[11px] text-fg-3">{easy ? "한 번에 평균" : "최근 30거래 기댓값 (R)"}</div>
          <div className={`num text-lg font-bold ${t.ev_r === null ? "text-fg-3" : t.ev_r > 0 ? "text-up" : "text-down"}`}>{t.ev_r === null ? "—" : `${t.ev_r > 0 ? "+" : ""}${t.ev_r}R`}</div>
        </div>
        <div className="rounded-lg bg-bg-3 p-2">
          <div className="text-[11px] text-fg-3">{easy ? "이긴 비율" : "승률"}</div>
          <div className="num text-lg font-bold">{t.win_rate === null ? "—" : `${t.win_rate}%`}</div>
        </div>
      </div>
      <p className="mt-2 text-xs text-fg-3">
        {t.closed === 0 ? "아직 끝난 거래가 없어요. " : `끝난 거래 ${t.closed}건. `}
        {easy ? "30번 끝날 때마다 성적표를 보고, 그때만 규칙을 바꿀지 생각해요. 한 달 수익률로는 안 바꿔요." : "30건 미만이면 기댓값은 참고만. 규칙 변경 근거는 30건 단위 리포트뿐."}
      </p>
      <div className="mt-3 border-t border-line pt-2 text-sm">
        <span className="text-fg-3">목표 연 {tmin}~{tmax}% · </span>
        <span className="num">지금 페이스 {p.annualized_pct === null ? "—" : `연 ${p.annualized_pct > 0 ? "+" : ""}${p.annualized_pct}%`}</span>
        {p.start_value !== null && p.now_value !== null && (
          <span className="num ml-2 text-[11px] text-fg-3">({fmtNum(p.start_value)} → {fmtNum(p.now_value)}, {fmtDate(p.start_date)}~{fmtDate(p.now_date)})</span>
        )}
        <p className="mt-0.5 text-[11px] text-fg-3">{easy ? "이 숫자는 보기만 해요. 이걸로 규칙을 바꾸진 않아요." : "표시 전용. 목표 수익률로 비중·손절·진입 조건을 바꾸지 않는다 (RS-3)."}</p>
      </div>
    </Section>
  );
}

export function OpportunityPanel({ d, settings, easy }: { d: RiskPanelData; settings: Settings; easy?: boolean }) {
  const o = d.opportunity;
  const tStocks = Number(settings.universe_target_stocks ?? 30), tSectors = Number(settings.universe_target_sectors ?? 8), warn = Number(settings.universe_sector_warn_pct ?? 40);
  const skew = o.top_sector_pct !== null && o.top_sector_pct > warn;
  return (
    <Section title={easy ? "기회가 몇 번 왔나" : "기회 횟수 지표"} right={<span className="text-[11px] text-fg-3">{o.month}</span>}>
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-lg bg-bg-3 p-2"><div className="text-[11px] text-fg-3">규칙 신호</div><div className="num text-lg font-bold">{o.signals}</div></div>
        <div className="rounded-lg bg-bg-3 p-2"><div className="text-[11px] text-fg-3">실제 진입</div><div className="num text-lg font-bold">{o.entries}</div></div>
        <div className="rounded-lg bg-bg-3 p-2"><div className="text-[11px] text-fg-3">신호 업종</div><div className="num text-lg font-bold">{o.sectors}</div></div>
      </div>
      <p className="mt-2 text-sm">
        살 수 있는 목록 <span className="num">{o.universe_stocks}</span>/{tStocks}종목 · <span className="num">{o.universe_sectors}</span>/{tSectors}업종
        {skew && <span className="ml-2 text-warn">쏠림 경고: {o.top_sector} {o.top_sector_pct}%</span>}
      </p>
      <p className="mt-1 text-[11px] text-fg-3">{easy ? "더 벌고 싶으면 한 번에 크게가 아니라, 기회가 더 자주 오게 목록을 넓혀요. 목록이 모자라면 브레인이 후보를 더 찾고 비움이 승인해요." : "'더 벌기'는 비중이 아니라 기회 횟수(유니버스 확장)로. 부족하면 브레인 레이더 확장, 승인은 비움."}</p>
      {!easy && d.signals.length > 0 && (
        <ul className="mt-2 space-y-0.5 border-t border-line pt-2 text-xs">
          {d.signals.map((sg) => (
            <li key={sg.id} className="flex gap-2">
              <span className="num w-12 shrink-0 text-fg-3">{sg.signal_date.slice(5)}</span>
              <span className="text-fg">{sg.code}</span>
              <span className={sg.entered ? "text-up" : "text-fg-3"}>{sg.entered ? "진입" : `미진입 · ${sg.skip_reason ?? ""}`}</span>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

export function ProposalHistoryPanel({ list }: { list: Proposal[] }) {
  const done = list.filter((p) => p.status !== "pending");
  if (!done.length) return null;
  return (
    <Section title="변경 문 이력">
      <ul className="space-y-1 text-xs">
        {done.map((p) => (
          <li key={p.id} className="flex flex-wrap items-center gap-2">
            <Badge tone={p.status === "rejected" ? "muted" : p.status === "applied" ? "go" : "fg"}>{p.status === "approved" ? "승인·적용 대기" : p.status === "applied" ? "적용됨" : "거절"}</Badge>
            <span className="text-fg">{PROPOSAL_KIND_LABEL[p.kind]} {p.target}: {p.current_value ?? "없음"} → {p.proposed_value}</span>
            <span className="text-fg-3">{AUTHOR_LABEL[p.proposer]} · {fmtDateTime(p.approved_at)}{p.apply_at ? ` · 적용 ${fmtDateTime(p.apply_at)}` : ""}{p.decision_note ? ` · ${p.decision_note}` : ""}</span>
          </li>
        ))}
      </ul>
    </Section>
  );
}
