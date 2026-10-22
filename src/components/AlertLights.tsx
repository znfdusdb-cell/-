import type { StockSummary } from "@/lib/types";
import { alertSignals } from "@/lib/easy";
import { fmtNum } from "@/lib/format";

/** AL-1 세 신호. 보유 중(봇·수동)일 때만 보인다. 셋 다 켜지면 빨간 판. */
export function AlertLights({ s, easy = false }: { s: StockSummary; easy?: boolean }) {
  const a = alertSignals(s);
  if (!a) return null;
  const rows: { on: boolean; label: string; detail: string }[] = [
    { on: a.thesis, label: easy ? "가설이 깨졌나" : "가설 무효화 조건", detail: a.thesis ? "성립" : "아직 아님" },
    { on: a.stop, label: easy ? "안전벨트 아래인가" : "손절선 이탈", detail: `종가 ${fmtNum(s.last_close)} / 손절선 ${fmtNum(a.stopPrice)}${a.stopFromRule ? " (평단 -6%)" : ""}` },
    { on: a.ma20, label: easy ? "20일선 아래인가" : "20일선 아래 마감", detail: s.ma20 === null || s.ma20 === undefined ? "일봉 20개 미만" : `20일선 ${fmtNum(s.ma20)} · 연속 ${s.below_ma20_days ?? 0}일` },
  ];
  return (
    <section className={`rounded-xl border p-3 ${a.all ? "border-2 border-stop bg-stop/15" : "border-line bg-bg-2"}`}>
      <div className={`text-sm font-semibold ${a.all ? "text-stop" : "text-fg-2"}`}>
        {a.all ? (easy ? "세 신호가 모두 켜졌어요. 규칙상 정리할 때예요." : "AL-1 세 신호 동시 성립: 정리") : easy ? "정리 신호 세 개" : "AL-1 정리 신호"}
      </div>
      <ul className="mt-2 space-y-1 text-xs">
        {rows.map((r) => (
          <li key={r.label} className="flex items-center gap-2">
            <span className={`inline-block h-3 w-3 shrink-0 rounded-full ${r.on ? "bg-stop" : "bg-line"}`} />
            <span className="text-fg">{r.label}</span>
            <span className="num text-fg-3">{r.detail}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
