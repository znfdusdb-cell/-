import type { Challenge } from "@/lib/types";

/** 실패 조건·벌칙을 또렷하게 보여주는 상자 (손실 프레이밍) */
export function FailRule({ challenge: ch, compact = false }: { challenge: Challenge; compact?: boolean }) {
  const rule =
    ch.config.kind === "slots"
      ? `${ch.config.slots.map((s) => `${s.label} ${s.start}~${s.end}`).join(", ")} 중 하나라도 시간 안에 못 올리면 그날 실패`
      : `${ch.config.period_days === 7 ? "한 주" : `${ch.config.period_days}일`}에 ${ch.config.times}회를 못 채우면 그 기간 실패`;
  return (
    <div className={`rounded-2xl bg-red-soft border border-red/20 ${compact ? "p-2.5" : "p-3"} mt-3`}>
      <div className="text-[11px] font-extrabold text-red tracking-wide">실패 조건</div>
      <div className="text-sm mt-0.5">{rule}</div>
      <div className="text-sm mt-1">
        {ch.max_fails > 0 ? <>실패 <b>{ch.max_fails}번</b>이면 탈락 → </> : <>실패하면 → </>}
        <b className="text-red">{ch.penalty}</b>
      </div>
    </div>
  );
}
