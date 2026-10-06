import type { Setup, Thesis, Position, StageLog, OrderLog, MarketEvent, CheckItem, Violation } from "@/lib/types";
import { SETUP_TYPE_LABEL, THESIS_STATUS_LABEL, POSITION_STATE_LABEL, STAGE_LABEL, RULE_MAP, EVENT_TYPE_LABEL } from "@/lib/constants";
import { fmtNum, fmtPct, footprint, fmtDate, fmtDateTime, pctChange, udClass, daysBetween, todayKST } from "@/lib/format";
import { Badge } from "./StockCard";

export function Section({ title, right, children }: { title: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-line bg-bg-2 p-4">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-fg-2">{title}</h2>
        {right}
      </div>
      {children}
    </section>
  );
}

export function FootprintPanel({ setup, lastClose }: { setup: Setup | null; lastClose: number | null }) {
  if (!setup) return <Section title="발자국·셋업"><p className="text-xs text-fg-3">봇 계산값 없음</p></Section>;
  const toPivot = setup.pivot ? pctChange(lastClose, setup.pivot) : null;
  return (
    <Section title="발자국·셋업" right={<span className="text-[11px] text-fg-3">{fmtDate(setup.as_of)} 계산</span>}>
      <div className="flex items-baseline gap-3">
        <span className="num text-2xl font-bold">{footprint(setup.footprint_weeks, setup.max_contraction_pct, setup.min_contraction_pct, setup.t_count)}</span>
        <span className="text-sm text-fg-2">{SETUP_TYPE_LABEL[setup.setup_type]}</span>
      </div>
      <p className="mt-0.5 text-[11px] text-fg-3">주수W 최대조정/최소조정 횟수T</p>
      <dl className="num mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs sm:grid-cols-3">
        <KV k="피봇" v={fmtNum(setup.pivot)} />
        <KV k="피봇까지" v={fmtPct(toPivot, 1)} cls={udClass(toPivot)} />
        <KV k="C 박스" v={setup.cbox_high ? `${fmtNum(setup.cbox_low)} ~ ${fmtNum(setup.cbox_high)}` : "—"} />
        <KV k="거래량 마른 일수" v={setup.volume_dry_days != null ? `${setup.volume_dry_days}일` : "—"} />
        <KV k="고점 대비 조정" v={fmtPct(setup.drawdown_pct, 1)} />
        <KV k="시장 대비 조정 배수" v={setup.drawdown_vs_market != null ? `${fmtNum(setup.drawdown_vs_market, 1)}배 (시장 ${fmtPct(setup.market_drawdown_pct, 1)})` : "—"} cls={setup.drawdown_vs_market != null && setup.drawdown_vs_market >= 2 ? "text-stop" : undefined} />
      </dl>
      {setup.notes && <p className="mt-3 border-t border-line pt-2 text-xs text-fg-2">{setup.notes}</p>}
    </Section>
  );
}

function KV({ k, v, cls }: { k: string; v: string; cls?: string }) {
  return (
    <div>
      <dt className="text-fg-3">{k}</dt>
      <dd className={cls ?? "text-fg"}>{v}</dd>
    </div>
  );
}

export function CheckPanel({ title, items, max }: { title: string; items: CheckItem[]; max: number }) {
  const n = items.filter((i) => i.pass).length;
  return (
    <Section title={title} right={<span className={`num text-sm font-semibold ${n === max ? "text-go" : n >= max - 2 ? "text-warn" : "text-fg-2"}`}>{n}/{max}</span>}>
      {items.length === 0 ? (
        <p className="text-xs text-fg-3">계산값 없음</p>
      ) : (
        <ul className="space-y-1 text-xs">
          {items.map((it) => (
            <li key={it.key} className="flex gap-2">
              <span className={`mt-0.5 inline-block h-3.5 w-3.5 shrink-0 rounded-sm border text-center text-[10px] leading-3 ${it.pass ? "border-go bg-go/20 text-go" : "border-line text-fg-3"}`}>{it.pass ? "✓" : ""}</span>
              <span className={it.pass ? "text-fg" : "text-fg-2"}>
                {it.label}
                {it.value && <span className="num ml-1 text-fg-3">({it.value})</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

export function ThesisPanel({ thesis }: { thesis: Thesis | null }) {
  if (!thesis) {
    return (
      <Section title="가설 · 무효화 조건">
        <p className="text-xs text-warn">가설 없음. 가설과 무효화 조건이 있어야 유니버스 승인이 가능하다 (UV-2).</p>
      </Section>
    );
  }
  const anyViolated = thesis.invalidation_conditions.some((c) => c.violated);
  const tone = thesis.status === "suspect" || anyViolated ? "stop" : thesis.status === "discarded" ? "muted" : "go";
  return (
    <Section
      title="가설 · 무효화 조건"
      right={
        <span className="flex items-center gap-1 text-[11px]">
          <Badge tone={tone}>{THESIS_STATUS_LABEL[thesis.status]}</Badge>
          <span className="text-fg-3">{thesis.author === "bium" ? "비움" : thesis.author === "brain" ? "브레인" : "봇"} · {fmtDate(thesis.updated_at)}</span>
        </span>
      }
    >
      <p className="text-sm leading-relaxed">{thesis.hypothesis}</p>
      <h3 className="mt-3 text-[11px] font-semibold text-fg-3">무효화 조건 (이 중 하나라도 맞으면 가설은 틀린 것)</h3>
      {thesis.invalidation_conditions.length === 0 ? (
        <p className="mt-1 rounded-lg border border-warn/50 bg-warn/10 p-2 text-xs text-warn">비어 있음 → 유니버스 승인 불가. 한화오션 때처럼 '언제 틀렸다고 인정할지'를 먼저 적어라.</p>
      ) : (
        <ol className="mt-1 space-y-1.5 text-xs">
          {thesis.invalidation_conditions.map((c, i) => (
            <li key={i} className={`flex gap-2 rounded-lg border p-2 ${c.violated ? "border-stop/70 bg-stop/10" : "border-line"}`}>
              <span className={`num shrink-0 ${c.violated ? "text-stop" : "text-fg-3"}`}>{i + 1}.</span>
              <div>
                <div className={c.violated ? "font-semibold text-stop" : "text-fg"}>{c.text}</div>
                {c.violated && <div className="text-stop/90">위반{c.note ? ` · ${c.note}` : ""}</div>}
              </div>
            </li>
          ))}
        </ol>
      )}
    </Section>
  );
}

export function PositionPanel({ position, lastClose }: { position: Position | null; lastClose: number | null }) {
  if (!position) return null;
  const pnl = pctChange(lastClose, position.avg_price);
  const toStop = pctChange(lastClose, position.stop_price);
  const rule = position.entry_rule_id ? RULE_MAP[position.entry_rule_id] : null;
  return (
    <Section title="포지션" right={<span className="flex gap-1">{position.is_unverified && <Badge tone="warn">숫자 미확인</Badge>}<Badge tone="fg">{POSITION_STATE_LABEL[position.state]}</Badge></span>}>
      {position.note && <p className={`mb-2 text-xs ${position.is_unverified ? "text-warn" : "text-fg-3"}`}>{position.note}</p>}
      <dl className="num grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs sm:grid-cols-4">
        <KV k="수량" v={`${fmtNum(position.qty)}주`} />
        <KV k="평단" v={fmtNum(position.avg_price)} />
        <KV k="손절선" v={fmtNum(position.stop_price)} />
        <KV k="손절까지" v={fmtPct(toStop, 2)} cls={toStop != null && toStop < 2 ? "text-stop" : undefined} />
        <KV k="평가손익" v={fmtPct(pnl, 2)} cls={udClass(pnl)} />
        <KV k="평가금액" v={lastClose ? fmtNum(lastClose * position.qty) : "—"} />
        <KV k="진입 규칙" v={rule ? `${rule.rule_id} ${rule.title}` : position.entry_rule_id ?? "—"} />
        <KV k="진입일" v={fmtDate(position.opened_at)} />
      </dl>
    </Section>
  );
}

export function EventsPanel({ events }: { events: MarketEvent[] }) {
  const t = todayKST();
  const up = events.filter((e) => e.event_date >= t);
  if (!up.length) return null;
  return (
    <Section title="다가오는 이벤트">
      <ul className="space-y-1 text-xs">
        {up.map((e) => {
          const d = daysBetween(t, e.event_date);
          return (
            <li key={e.id} className="flex items-center gap-2">
              <span className={`num w-10 shrink-0 font-semibold ${d <= 2 ? "text-warn" : "text-fg"}`}>D-{d}</span>
              <Badge tone="muted">{EVENT_TYPE_LABEL[e.event_type]}</Badge>
              <span className="text-fg">{e.title}</span>
              {e.note && <span className="text-fg-3">· {e.note}</span>}
            </li>
          );
        })}
      </ul>
    </Section>
  );
}

export function StageLogPanel({ log }: { log: StageLog[] }) {
  if (!log.length) return null;
  return (
    <Section title="단계 이동 이력">
      <ul className="space-y-1 text-xs">
        {log.map((l) => (
          <li key={l.id} className="flex gap-2">
            <span className="num w-20 shrink-0 text-fg-3">{fmtDateTime(l.created_at)}</span>
            <span className="shrink-0 text-fg">{l.from_stage ? STAGE_LABEL[l.from_stage] : "—"} → {STAGE_LABEL[l.to_stage]}</span>
            <span className="text-fg-2">{l.reason ?? ""}</span>
            <span className="ml-auto shrink-0 text-fg-3">{l.actor === "bium" ? "비움" : l.actor === "brain" ? "브레인" : "봇"}</span>
          </li>
        ))}
      </ul>
    </Section>
  );
}

export function OrdersTable({ orders, names, violations }: { orders: OrderLog[]; names?: Record<string, string>; violations?: Map<number, Violation[]> }) {
  if (!orders.length) return <p className="text-xs text-fg-3">주문 없음</p>;
  return (
    <div className="-mx-4 overflow-x-auto px-4">
      <table className="num w-full min-w-[560px] text-left text-xs">
        <thead className="text-fg-3">
          <tr className="border-b border-line">
            <th className="py-1.5 pr-2 font-normal">시각</th>
            {names && <th className="py-1.5 pr-2 font-normal">종목</th>}
            <th className="py-1.5 pr-2 font-normal">매수/매도</th>
            <th className="py-1.5 pr-2 text-right font-normal">수량</th>
            <th className="py-1.5 pr-2 text-right font-normal">가격</th>
            <th className="py-1.5 pr-2 font-normal">근거 규칙</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((o) => {
            const rule = o.rule_id ? RULE_MAP[o.rule_id] : null;
            const vs = violations?.get(o.id) ?? [];
            const manual = o.source === "manual";
            const bad = !manual && (vs.length > 0 || o.is_violation || !o.rule_id);
            return (
              <tr key={o.id} className={`border-b border-line/60 align-top ${bad ? "bg-stop/5" : ""}`}>
                <td className="py-2 pr-2 whitespace-nowrap text-fg-2">{fmtDateTime(o.ts)}</td>
                {names && <td className="py-2 pr-2 whitespace-nowrap">{names[o.code] ?? o.code}</td>}
                <td className={`py-2 pr-2 font-semibold ${o.side === "buy" ? "text-up" : "text-down"}`}>{o.side === "buy" ? "매수" : "매도"}</td>
                <td className="py-2 pr-2 text-right">{fmtNum(o.qty)}주{o.planned_qty !== null && o.planned_qty !== o.qty ? <span className="text-stop"> (계산 {o.planned_qty})</span> : null}</td>
                <td className="py-2 pr-2 text-right">{fmtNum(o.price)}</td>
                <td className="py-2 pr-2">
                  {manual && <span className="mr-1 rounded border border-line px-1 text-[10px] text-fg-3">수동</span>}
                  {bad ? (
                    <span className="font-semibold text-stop">규칙 위반 {vs.length ? vs.map((v) => v.rule_id).join(", ") : o.rule_id ? `(${o.rule_id})` : "· 근거 없음"}</span>
                  ) : (
                    <span><span className="text-fg">{o.rule_id ?? "—"}</span> <span className="text-fg-2">{rule?.title ?? o.rule_text}</span></span>
                  )}
                  {vs.map((v, i) => <div key={i} className="text-stop/90">{v.reason}</div>)}
                  {(o.rule_text && rule) || o.note ? <div className="text-fg-3">{[o.rule_text && rule ? o.rule_text : null, o.note].filter(Boolean).join(" · ")}</div> : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
