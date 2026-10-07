import { levelProgress, levelTitle } from "@/lib/game";

export function XpBar({ xp, compact = false }: { xp: number; compact?: boolean }) {
  const p = levelProgress(xp);
  return (
    <div>
      <div className="flex items-end justify-between mb-1">
        <div className="flex items-baseline gap-2">
          <span className="font-display text-2xl text-gold">Lv.{p.level}</span>
          {!compact && <span className="text-sm text-fg-2">{levelTitle(p.level)}</span>}
        </div>
        <span className="num text-xs text-fg-2">{p.needed ? `${p.current} / ${p.needed} XP` : "MAX"}</span>
      </div>
      <div className="h-3 rounded-full bg-bg-3 border border-line overflow-hidden">
        <div className="h-full xp-fill rounded-full transition-[width] duration-700" style={{ width: `${Math.max(2, p.ratio * 100)}%` }} />
      </div>
    </div>
  );
}
