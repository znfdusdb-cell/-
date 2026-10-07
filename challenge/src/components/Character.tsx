/**
 * 레벨별로 꾸며지는 거너 캐릭터. 동글동글한 흰 몸, 점 눈, 볼터치의 귀여운 그림체 (순수 SVG).
 *  L1 기본 · L2 빨간 셔츠 · L3 홈 킷(흰 소매·대포 엠블럼) · L4 머플러 · L5 주장 완장 · L6 거너사우르스 친구
 *  L7 트로피 · L8 황금 오라 · L9 왕관 · L10 불꽃
 */
export function Character({ level, size = 160, className = "", mood = "happy" }: { level: number; size?: number; className?: string; mood?: "happy" | "sad" }) {
  const L = Math.max(1, level);
  const line = "#2a2522";
  const skin = "#fffdf9";
  const red = "#e4002b";
  const shirtOn = L >= 2;
  const sleeves = L >= 3 ? "#ffffff" : red;
  return (
    <svg viewBox="0 0 200 200" width={size} height={size} className={className} aria-label={`레벨 ${L} 캐릭터`}>
      <defs>
        <radialGradient id="ch-aura" cx="50%" cy="55%" r="50%">
          <stop offset="0%" stopColor="#ffe9a3" stopOpacity=".95" />
          <stop offset="70%" stopColor="#f3c84b" stopOpacity=".25" />
          <stop offset="100%" stopColor="#f3c84b" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="ch-flame" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0%" stopColor={red} />
          <stop offset="60%" stopColor="#ff8a00" />
          <stop offset="100%" stopColor="#ffe08a" />
        </linearGradient>
        <clipPath id="ch-body"><ellipse cx="100" cy="112" rx="58" ry="60" /></clipPath>
      </defs>

      {L >= 8 && <circle cx="100" cy="112" r="92" fill="url(#ch-aura)" />}
      {L >= 10 && (
        <g className="animate-flame" opacity=".9">
          <path d="M52 160 C 40 128, 62 118, 58 92 C 76 108, 70 130, 70 140 C 82 128, 80 108, 88 98 C 92 122, 84 142, 78 160 Z" fill="url(#ch-flame)" />
          <path d="M148 160 C 160 128, 138 118, 142 92 C 124 108, 130 130, 130 140 C 118 128, 120 108, 112 98 C 108 122, 116 142, 122 160 Z" fill="url(#ch-flame)" />
        </g>
      )}

      {/* 거너사우르스 친구 (작은 초록 친구) */}
      {L >= 6 && (
        <g className="animate-float" style={{ animationDelay: ".7s" }}>
          <ellipse cx="166" cy="178" rx="16" ry="4" fill="#000" opacity=".12" />
          <ellipse cx="166" cy="152" rx="22" ry="24" fill="#5fcf7a" stroke={line} strokeWidth="3" />
          <path d="M150 134 l 5 -9 l 5 9 M161 130 l 5 -9 l 5 9 M172 134 l 5 -9 l 5 9" fill={red} stroke={line} strokeWidth="2" strokeLinejoin="round" />
          <circle cx="159" cy="150" r="2.6" fill={line} />
          <circle cx="173" cy="150" r="2.6" fill={line} />
          <path d="M162 158 q 4 4 8 0" stroke={line} strokeWidth="2" fill="none" strokeLinecap="round" />
          <ellipse cx="155" cy="156" rx="3.5" ry="2" fill="#ff9aa8" opacity=".8" />
          <ellipse cx="177" cy="156" rx="3.5" ry="2" fill="#ff9aa8" opacity=".8" />
          <path d="M146 162 q 20 10 40 0 v 12 q -20 8 -40 0 Z" fill={red} stroke={line} strokeWidth="2.5" />
          <circle cx="148" cy="162" r="5" fill="#5fcf7a" stroke={line} strokeWidth="2.5" />
          <circle cx="184" cy="162" r="5" fill="#5fcf7a" stroke={line} strokeWidth="2.5" />
        </g>
      )}

      {/* 그림자 */}
      <ellipse cx="100" cy="184" rx="40" ry="6" fill="#000" opacity=".12" />

      {/* 귀 */}
      <circle cx="62" cy="62" r="14" fill={skin} stroke={line} strokeWidth="3" />
      <circle cx="138" cy="62" r="14" fill={skin} stroke={line} strokeWidth="3" />
      <circle cx="62" cy="62" r="6" fill="#ffd1d8" />
      <circle cx="138" cy="62" r="6" fill="#ffd1d8" />

      {/* 몸 (머리와 한 덩어리) */}
      <ellipse cx="100" cy="112" rx="58" ry="60" fill={skin} stroke={line} strokeWidth="3" />

      {/* 셔츠 */}
      {shirtOn && (
        <g clipPath="url(#ch-body)">
          <rect x="30" y="126" width="140" height="60" fill={red} />
          <path d="M42 126 h 116" stroke={line} strokeWidth="3" />
          {L >= 3 && (
            <>
              <rect x="30" y="126" width="18" height="60" fill={sleeves} />
              <rect x="152" y="126" width="18" height="60" fill={sleeves} />
              <path d="M48 126 v 60 M152 126 v 60" stroke={line} strokeWidth="2.5" />
            </>
          )}
        </g>
      )}
      {/* 대포 엠블럼 */}
      {L >= 3 && (
        <g transform="translate(88 136)">
          <path d="M0 0 h 24 v 10 a 12 12 0 0 1 -24 0 Z" fill="#fff" stroke={line} strokeWidth="2" />
          <rect x="5" y="5" width="14" height="3" rx="1.5" fill={red} />
          <circle cx="8" cy="11" r="2" fill="#063672" />
        </g>
      )}

      {/* 팔 */}
      <circle cx="44" cy="134" r="11" fill={skin} stroke={line} strokeWidth="3" />
      <circle cx="156" cy="134" r="11" fill={skin} stroke={line} strokeWidth="3" />
      {L >= 5 && <rect x="146" y="124" width="20" height="7" rx="3" fill="#f3c84b" stroke={line} strokeWidth="2" />}

      {/* 발 */}
      <ellipse cx="82" cy="170" rx="13" ry="9" fill={skin} stroke={line} strokeWidth="3" />
      <ellipse cx="118" cy="170" rx="13" ry="9" fill={skin} stroke={line} strokeWidth="3" />
      {L >= 5 && (
        <>
          <ellipse cx="82" cy="172" rx="13" ry="7" fill="#f3c84b" stroke={line} strokeWidth="2.5" />
          <ellipse cx="118" cy="172" rx="13" ry="7" fill="#f3c84b" stroke={line} strokeWidth="2.5" />
        </>
      )}

      {/* 머플러 */}
      {L >= 4 && (
        <g>
          <path d="M50 118 q 50 16 100 0 v 12 q -50 16 -100 0 Z" fill={red} stroke={line} strokeWidth="2.5" />
          <path d="M50 124 q 50 16 100 0" stroke="#fff" strokeWidth="4" fill="none" />
          <path d="M140 128 l 10 30 l -12 3 l -8 -28 Z" fill={red} stroke={line} strokeWidth="2.5" strokeLinejoin="round" />
          <path d="M136 140 l 11 -3 M139 150 l 11 -3" stroke="#fff" strokeWidth="3" />
        </g>
      )}

      {/* 얼굴 */}
      <circle cx="84" cy="98" r="4.2" fill={line} />
      <circle cx="116" cy="98" r="4.2" fill={line} />
      <circle cx="85.5" cy="96.5" r="1.3" fill="#fff" />
      <circle cx="117.5" cy="96.5" r="1.3" fill="#fff" />
      <ellipse cx="72" cy="108" rx="7" ry="4" fill="#ffb3bd" opacity=".85" />
      <ellipse cx="128" cy="108" rx="7" ry="4" fill="#ffb3bd" opacity=".85" />
      {mood === "happy" ? (
        <path d="M94 109 q 3 4 6 0 q 3 4 6 0" stroke={line} strokeWidth="2.4" fill="none" strokeLinecap="round" />
      ) : (
        <path d="M94 113 q 6 -5 12 0" stroke={line} strokeWidth="2.4" fill="none" strokeLinecap="round" />
      )}

      {/* 왕관 */}
      {L >= 9 && (
        <g transform="translate(0 -4)">
          <path d="M80 50 l 6 -14 l 8 9 l 6 -14 l 6 14 l 8 -9 l 6 14 Z" fill="#f3c84b" stroke={line} strokeWidth="2.5" strokeLinejoin="round" />
          <circle cx="86" cy="36" r="2.5" fill={red} />
          <circle cx="100" cy="31" r="2.8" fill={red} />
          <circle cx="114" cy="36" r="2.5" fill={red} />
        </g>
      )}

      {/* 트로피 */}
      {L >= 7 && (
        <g transform="translate(26 108)">
          <path d="M6 0 h 20 v 10 a 10 10 0 0 1 -20 0 Z" fill="#f3c84b" stroke={line} strokeWidth="2" />
          <path d="M6 3 h -4 a 4 4 0 0 0 4 6 M26 3 h 4 a 4 4 0 0 1 -4 6" stroke={line} strokeWidth="2" fill="none" />
          <rect x="13" y="19" width="6" height="6" fill="#f3c84b" stroke={line} strokeWidth="1.5" />
          <rect x="8" y="25" width="16" height="4" rx="1.5" fill="#f3c84b" stroke={line} strokeWidth="1.5" />
        </g>
      )}
    </svg>
  );
}
