import type { CheckItem } from "@/lib/types";
import type { Mountain } from "@/lib/easy";
import { MOUNTAIN_LABEL } from "@/lib/easy";

export function WeatherIcon({ kind, size = 56 }: { kind: "sun" | "cloud" | "storm" | "none"; size?: number }) {
  const s = size;
  if (kind === "sun")
    return (
      <svg width={s} height={s} viewBox="0 0 64 64" aria-label="맑음">
        <circle cx="32" cy="32" r="13" fill="#f59e0b" />
        {Array.from({ length: 8 }).map((_, i) => (
          <line key={i} x1="32" y1="6" x2="32" y2="14" stroke="#f59e0b" strokeWidth="4" strokeLinecap="round" transform={`rotate(${i * 45} 32 32)`} />
        ))}
      </svg>
    );
  if (kind === "cloud")
    return (
      <svg width={s} height={s} viewBox="0 0 64 64" aria-label="흐림">
        <path d="M20 46h26a10 10 0 0 0 1-20 14 14 0 0 0-27 4 8 8 0 0 0 0 16z" fill="#9aa3b5" />
      </svg>
    );
  if (kind === "storm")
    return (
      <svg width={s} height={s} viewBox="0 0 64 64" aria-label="폭풍">
        <path d="M18 40h28a10 10 0 0 0 1-20 14 14 0 0 0-27 4 8 8 0 0 0-2 16z" fill="#626b7d" />
        <path d="M34 36l-8 14h7l-3 10 11-16h-7l4-8z" fill="#f59e0b" />
      </svg>
    );
  return <svg width={s} height={s} viewBox="0 0 64 64" aria-label="모름"><circle cx="32" cy="32" r="14" fill="none" stroke="#626b7d" strokeWidth="3" strokeDasharray="4 4" /></svg>;
}

/** 산 그림 위 현재 위치. 1 평지 → 2 오르막 → 3 꼭대기 → 4 내리막 */
export function MountainPos({ stage, fake }: { stage: Mountain; fake?: boolean }) {
  const pts: Record<Mountain, [number, number]> = { 1: [28, 92], 2: [92, 58], 3: [150, 22], 4: [212, 60] };
  const [x, y] = pts[stage];
  return (
    <div className="relative">
      <svg viewBox="0 0 260 110" className="h-auto w-full" aria-label={`산 위 위치: ${MOUNTAIN_LABEL[stage]}`}>
        <polyline points="4,96 56,96 150,18 250,86" fill="none" stroke="#3a4152" strokeWidth="4" strokeLinejoin="round" strokeLinecap="round" />
        <polyline points="56,96 150,18" fill="none" stroke={stage === 2 ? "#f04452" : "#3a4152"} strokeWidth="4" strokeLinecap="round" />
        <polyline points="150,18 250,86" fill="none" stroke={stage === 4 ? "#3182f6" : "#3a4152"} strokeWidth="4" strokeLinecap="round" />
        <text x="22" y="108" fontSize="10" fill="#626b7d">1 평지</text>
        <text x="74" y="78" fontSize="10" fill="#626b7d">2 오르막</text>
        <text x="130" y="12" fontSize="10" fill="#626b7d">3 꼭대기</text>
        <text x="196" y="80" fontSize="10" fill="#626b7d">4 내리막</text>
        <circle cx={x} cy={y} r="9" fill={stage === 2 ? "#f04452" : stage === 4 ? "#3182f6" : "#f59e0b"} stroke="#0b0d12" strokeWidth="3" />
      </svg>
      {fake && <span className="absolute right-0 top-0 rounded-full border border-warn/60 bg-warn/15 px-1.5 text-[10px] text-warn">가짜 일봉</span>}
    </div>
  );
}

/** 체크리스트 7칸 불빛 막대 */
export function Lights({ items, max = 7 }: { items: CheckItem[]; max?: number }) {
  const cells = Array.from({ length: max }).map((_, i) => items[i]);
  const n = items.filter((i) => i.pass).length;
  return (
    <div>
      <div className="flex gap-1">
        {cells.map((c, i) => (
          <span key={i} title={c?.label} className={`h-3 flex-1 rounded-sm ${c?.pass ? "bg-go" : "bg-line"}`} />
        ))}
      </div>
      <div className="mt-1 text-[11px] text-fg-3">{items.length ? `${n}/${max} 켜짐 · 7개 다 켜지면 살 준비가 된 가격` : "아직 안 재봄"}</div>
    </div>
  );
}

/** 세로 온도계: 위 문턱, 가운데 지금, 아래 안전벨트 */
export function Thermometer({ pivot, now, stop, fake }: { pivot: number | null; now: number | null; stop: number | null; fake: boolean }) {
  const vals = [pivot, now, stop].filter((v): v is number => v !== null);
  const hi = vals.length ? Math.max(...vals) : 1;
  const lo = vals.length ? Math.min(...vals) : 0;
  const span = Math.max(hi - lo, 1);
  const pos = (v: number | null) => (v === null ? null : 12 + ((hi - v) / span) * 76); // % from top
  const fmt = (v: number | null) => (v === null ? "—" : v.toLocaleString("ko-KR"));
  const rows: { key: string; label: string; v: number | null; color: string; note: string }[] = [
    { key: "pivot", label: "문턱", v: pivot, color: "#f59e0b", note: pivot === null ? "봇이 아직 못 정함" : "이걸 거래량과 함께 넘는 날 산다" },
    { key: "now", label: "지금", v: fake ? null : now, color: "#e8eaf0", note: fake ? "실제 일봉 적재 전" : "" },
    { key: "stop", label: "안전벨트", v: stop, color: "#3182f6", note: stop === null ? "살 때 생긴다 (산 가격 -6%)" : "여기 아래면 판다" },
  ];
  return (
    <div className="flex gap-4">
      <div className="relative h-64 w-10 shrink-0">
        <div className="absolute left-1/2 top-2 h-[calc(100%-16px)] w-3 -translate-x-1/2 rounded-full bg-bg-3" />
        {rows.map((r) => {
          const p = pos(r.v);
          if (p === null) return null;
          return <div key={r.key} className="absolute left-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-bg" style={{ top: `${p}%`, background: r.color }} />;
        })}
      </div>
      <ul className="flex flex-1 flex-col justify-between py-1 text-sm">
        {rows.map((r) => (
          <li key={r.key}>
            <div className="flex items-baseline gap-2">
              <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: r.color }} />
              <span className="font-semibold">{r.label}</span>
              <span className="num text-fg">{fmt(r.v)}</span>
            </div>
            {r.note && <div className="text-[11px] text-fg-3">{r.note}</div>}
          </li>
        ))}
      </ul>
    </div>
  );
}
