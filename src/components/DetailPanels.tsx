import type { Setup, Thesis, Position, StageLog, OrderLog, MarketEvent, CheckItem, Violation, BalanceSnapshot, Settings } from "@/lib/types";
import { SETUP_TYPE_LABEL, THESIS_STATUS_LABEL, POSITION_STATE_LABEL, STAGE_LABEL, RULE_MAP, EVENT_TYPE_LABEL, ACCOUNT_LABEL, SETTING_KEYS, AUTHOR_LABEL } from "@/lib/constants";
import { upcomingClosures, KRX_CALENDAR_UPDATED, KRX_CALENDAR_COVERS_UNTIL } from "@/lib/krx-calendar";
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
  const cboxWide = setup.cbox_high && setup.cbox_low ? (setup.cbox_high - setup.cbox_low) / setup.cbox_high > 0.1 : false;
  return (
    <Section title="발자국·셋업" right={<span className="flex items-center gap-1 text-[11px] text-fg-3">{setup.data_source === "seed" && <Badge tone="warn">가짜 일봉 기준</Badge>}{fmtDate(setup.as_of)} 계산</span>}>
      <div className="flex items-baseline gap-3">
        <span className="num text-2xl font-bold">{footprint(setup.footprint_weeks, setup.max_contraction_pct, setup.min_contraction_pct, setup.t_count)}</span>
        <span className="text-sm text-fg-2">{SETUP_TYPE_LABEL[setup.setup_type]}</span>
      </div>
      <p className="mt-0.5 text-[11px] text-fg-3">주수W 최대조정/최소조정 횟수T · 베이스 시작 {setup.base_start ? `${fmtDate(setup.base_start)} (직전 2단계 고점)` : "—"}</p>
      <dl className="num mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs sm:grid-cols-3">
        <KV k="피봇" v={fmtNum(setup.pivot)} />
        <KV k="피봇까지" v={fmtPct(toPivot, 1)} cls={udClass(toPivot)} />
        <KV k={cboxWide ? "C 후보 (아직 넓음)" : "C 박스"} v={setup.cbox_high ? `${fmtNum(setup.cbox_low)} ~ ${fmtNum(setup.cbox_high)}${cboxWide ? ` (${fmtNum(((setup.cbox_high - (setup.cbox_low ?? 0)) / setup.cbox_high) * 100, 0)}% 폭)` : ""}` : "—"} cls={cboxWide ? "text-warn" : undefined} />
        <KV k="52주 고가 (252거래일)" v={setup.high_52w ? `${fmtNum(setup.high_52w)} (${fmtDate(setup.high_52w_date)})` : "—"} />
        <KV k="52주 저가 (252거래일)" v={setup.low_52w ? `${fmtNum(setup.low_52w)} (${fmtDate(setup.low_52w_date)})` : "—"} />
        <KV k="거래량 마른 일수" v={setup.volume_dry_days != null ? `${setup.volume_dry_days}일` : "—"} />
        <KV k="고점 대비 조정" v={fmtPct(setup.drawdown_pct, 1)} />
        <KV k={`${setup.benchmark ?? "시장"} 대비 조정 배수`} v={setup.drawdown_vs_market != null ? `${fmtNum(setup.drawdown_vs_market, 1)}배 (${setup.benchmark ?? "시장"} ${fmtPct(setup.market_drawdown_pct, 1)})` : "—"} cls={setup.drawdown_vs_market != null && setup.drawdown_vs_market >= 2 ? "text-stop" : undefined} />
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
  const tone = thesis.status === "suspect" || anyViolated ? "stop" : thesis.status === "discarded" ? "muted" : thesis.status === "draft" ? "warn" : "go";
  return (
    <Section
      title="가설 · 무효화 조건"
      right={
        <span className="flex items-center gap-1 text-[11px]">
          <Badge tone={tone}>{THESIS_STATUS_LABEL[thesis.status]}</Badge>
          <span className="text-fg-3">{AUTHOR_LABEL[thesis.author]} · {fmtDate(thesis.updated_at)}</span>
        </span>
      }
    >
      {thesis.status === "draft" && <p className="mb-2 rounded-lg border border-warn/50 bg-warn/10 p-2 text-xs text-warn">claude_code가 쓴 초안. 비움이 읽고 '가설 승인'을 눌러야 유효해진다. 작성자는 지어내지 않는다.</p>}
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

export function PositionPanel({ position, lastClose, fakePrice }: { position: Position | null; lastClose: number | null; fakePrice?: boolean }) {
  if (!position) return null;
  const manual = position.account === "kb_manual";
  const pnl = pctChange(lastClose, position.avg_price);
  const toStop = position.stop_price === null ? null : pctChange(lastClose, position.stop_price);
  const rule = position.entry_rule_id ? RULE_MAP[position.entry_rule_id] : null;
  return (
    <Section
      title={manual ? "KB 수동 보유 (봇 대상 아님)" : "포지션 (한투 봇 계좌)"}
      right={<span className="flex gap-1">{position.is_unverified && <Badge tone="warn">숫자 미확인</Badge>}<Badge tone={manual ? "muted" : "fg"}>{manual ? ACCOUNT_LABEL.kb_manual : POSITION_STATE_LABEL[position.state]}</Badge></span>}
    >
      {position.note && <p className={`mb-2 text-xs ${position.is_unverified ? "text-warn" : "text-fg-3"}`}>{position.note}</p>}
      <dl className="num grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs sm:grid-cols-4">
        <KV k="수량" v={`${fmtNum(position.qty)}주`} />
        <KV k="평단" v={fmtNum(position.avg_price)} />
        <KV k="손절선" v={position.stop_price === null ? (manual ? "봇 관리 아님" : "—") : fmtNum(position.stop_price)} />
        <KV k="손절까지" v={fmtPct(toStop, 2)} cls={toStop != null && toStop < 2 ? "text-stop" : undefined} />
        <KV k={fakePrice ? "평가손익 (가짜 일봉)" : "평가손익"} v={fakePrice ? "—" : fmtPct(pnl, 2)} cls={udClass(pnl)} />
        <KV k={fakePrice ? "평가금액 (가짜 일봉)" : "평가금액"} v={fakePrice || !lastClose ? "—" : fmtNum(lastClose * position.qty)} />
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
              <span className="ml-auto shrink-0 text-[10px] text-fg-3">출처 {e.source}</span>
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
    <>
    {/* 폰: 카드형 */}
    <ul className="space-y-2 sm:hidden">
      {orders.map((o) => {
        const rule = o.rule_id ? RULE_MAP[o.rule_id] : null;
        const vs = violations?.get(o.id) ?? [];
        const manual = o.source === "manual";
        const bad = !manual && (vs.length > 0 || o.is_violation || !o.rule_id);
        return (
          <li key={o.id} className={`rounded-lg border p-3 text-xs ${bad ? "border-stop/60 bg-stop/5" : "border-line"}`}>
            <div className="flex items-center justify-between">
              <span className="num text-fg-2">{fmtDateTime(o.ts)}</span>
              <span className="flex items-center gap-1">
                {manual && <span className="rounded border border-line px-1 text-[10px] text-fg-3">수동</span>}
                <span className={`font-semibold ${o.side === "buy" ? "text-up" : "text-down"}`}>{o.side === "buy" ? "매수" : "매도"}</span>
              </span>
            </div>
            <div className="num mt-1 flex items-baseline gap-2">
              {names && <span className="font-semibold">{names[o.code] ?? o.code}</span>}
              <span>{fmtNum(o.qty)}주{o.planned_qty !== null && o.planned_qty !== o.qty ? <span className="text-stop"> (계산 {o.planned_qty})</span> : null}</span>
              <span className="text-fg-2">@ {fmtNum(o.price)}</span>
            </div>
            <div className="mt-1">
              {bad ? <span className="font-semibold text-stop">규칙 위반 {vs.length ? vs.map((v) => v.rule_id).join(", ") : o.rule_id ? `(${o.rule_id})` : "· 근거 없음"}</span>
                   : <span><span className="text-fg">{o.rule_id ?? "—"}</span> <span className="text-fg-2">{rule?.title ?? o.rule_text}</span></span>}
              {vs.map((v, i) => <div key={i} className="text-stop/90">{v.reason}</div>)}
              {(o.rule_text && rule) || o.note ? <div className="text-fg-3">{[o.rule_text && rule ? o.rule_text : null, o.note].filter(Boolean).join(" · ")}</div> : null}
            </div>
          </li>
        );
      })}
    </ul>
    {/* 데스크톱: 표 */}
    <div className="-mx-4 hidden overflow-x-auto px-4 sm:block">
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
    </>
  );
}

export function SnapshotsPanel({ snapshots }: { snapshots: BalanceSnapshot[] }) {
  if (!snapshots.length) return null;
  return (
    <Section title="확인된 잔고 스냅샷" right={<span className="text-[11px] text-fg-3">체결가·체결일은 재구성 안 함</span>}>
      <ul className="space-y-2 text-xs">
        {snapshots.map((x) => (
          <li key={x.id} className="border-b border-line/60 pb-2 last:border-0 last:pb-0">
            <div className="num flex flex-wrap gap-x-3 gap-y-0.5">
              <span className="text-fg-3">{fmtDateTime(x.as_of)}</span>
              {x.qty !== null && <span className="font-semibold text-fg">{x.qty}주</span>}
              {x.avg_price !== null && <span className="text-fg">평단 {fmtNum(x.avg_price)}</span>}
              {x.market_price !== null && <span className="text-fg-2">현재가 {fmtNum(x.market_price)}</span>}
              {x.cash !== null && <span className="text-fg-2">예수금 {fmtNum(x.cash)}</span>}
            </div>
            {x.note && <div className="mt-0.5 text-fg-2">{x.note}</div>}
          </li>
        ))}
      </ul>
    </Section>
  );
}

export function ClosuresPanel({ from, days = 45 }: { from: string; days?: number }) {
  const list = upcomingClosures(from, days);
  const expired = KRX_CALENDAR_COVERS_UNTIL < from;
  return (
    <Section title="휴장 달력 (EV-2)" right={<span className="text-[11px] text-fg-3">KRX 달력 {KRX_CALENDAR_UPDATED} 갱신 · 장기 = 연속 3일 이상</span>}>
      {expired && <p className="mb-2 text-xs text-stop">달력이 {KRX_CALENDAR_COVERS_UNTIL}까지만 있다. krx-calendar.ts 갱신 필요.</p>}
      {list.length === 0 ? (
        <p className="text-xs text-fg-3">{days}일 안에 공휴일 휴장 없음</p>
      ) : (
        <ul className="space-y-1 text-xs">
          {list.map((c) => (
            <li key={c.start} className="flex gap-2">
              <span className={`num w-10 shrink-0 font-semibold ${c.long ? "text-warn" : "text-fg"}`}>D-{daysBetween(from, c.start)}</span>
              <span className="text-fg">{c.start.slice(5)}~{c.end.slice(5)} ({c.days}일 휴장{c.long ? " · 장기: 손절선 작동 불가" : ""})</span>
              <span className="text-fg-3">{c.names.join(", ")}</span>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

export function SettingsPanel({ settings }: { settings: Settings }) {
  return (
    <Section title="설정값 (sb_settings)" right={<span className="text-[11px] text-fg-3">null = 비움 미확정</span>}>
      <dl className="num grid grid-cols-1 gap-x-4 gap-y-1 text-xs sm:grid-cols-2">
        {SETTING_KEYS.map((k) => {
          const v = settings[k.key];
          const empty = v === null || v === undefined || v === "";
          return (
            <div key={k.key} className="flex justify-between gap-2 border-b border-line/60 py-1">
              <dt className="text-fg-3">{k.label}</dt>
              <dd className={empty ? "text-warn" : "text-fg"}>{empty ? "미확정" : `${k.key === "bot_account_balance" ? fmtNum(Number(v)) : v}${k.unit ?? ""}`}</dd>
            </div>
          );
        })}
      </dl>
    </Section>
  );
}
