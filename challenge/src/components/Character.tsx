import { composeRuns, PX_H, PX_W, type Gender } from "@/lib/pixel";

/**
 * 픽셀 캐릭터 (SVG, 픽셀 또렷하게). 레벨에 따라 장식이 붙는다.
 *  L2 빨간 셔츠 · L3 흰 소매+엠블럼 · L4 머플러 · L5 완장+금 축구화 · L6 거너사우르스 · L7 트로피 · L8 반짝임+오라 · L9 왕관 · L10 불꽃
 */
export function Character({ level, gender = "f", size = 160, className = "", mood = "happy" }: { level: number; gender?: Gender; size?: number; className?: string; mood?: "happy" | "sad" }) {
  const runs = composeRuns(level, gender, mood);
  const h = Math.round((size * PX_H) / PX_W);
  return (
    <svg viewBox={`0 0 ${PX_W} ${PX_H}`} width={size} height={h} className={className} shapeRendering="crispEdges" aria-label={`레벨 ${level} 캐릭터`}>
      {level >= 8 && (
        <>
          <defs>
            <radialGradient id="px-aura" cx="50%" cy="55%" r="50%">
              <stop offset="0%" stopColor="#ffe9a3" stopOpacity=".9" />
              <stop offset="100%" stopColor="#ffe9a3" stopOpacity="0" />
            </radialGradient>
          </defs>
          <ellipse cx={PX_W / 2 - 2} cy={PX_H / 2 + 2} rx={20} ry={23} fill="url(#px-aura)" />
        </>
      )}
      {runs.map((r, i) => (
        <rect key={i} x={r.x} y={r.y} width={r.w} height={1} fill={r.color} />
      ))}
    </svg>
  );
}
