import { levelProgress, levelTitle } from "@/lib/game";

export function XpBar({ xp, compact = false }: { xp: number; compact?: boolean }) {
  const p = levelProgress(xp);
  return (
    <div>
      <div className="flex items-end justify-between mb-1">
        <div className="flex items-baseline gap-1.5">
          <span className="text-base font-extrabold text-red">Lv.{p.level}</span>
          {!compact && <span className="text-xs text-fg-2">{levelTitle(p.level)}</span>}
        </div>
        <span className="num text-[11px] text-fg-3">{p.needed ? `${p.current} / ${p.needed} XP` : "MAX"}</span>
      </div>
      <div className="h-2 rounded-full bg-bg-3 overflow-hidden">
        <div className="h-full xp-fill rounded-full transition-[width] duration-700" style={{ width: `${Math.max(2, p.ratio * 100)}%` }} />
      </div>
    </div>
  );
}
