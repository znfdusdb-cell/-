/**
 * 레벨별로 화려해지는 거너 캐릭터 (순수 SVG, 외부 이미지 없음).
 *  L1 흰 티셔츠 · L2 빨간 셔츠 · L3 홈 킷(흰 소매·대포 엠블럼·흰 반바지) · L4 머플러 · L5 주장 완장·금 축구화
 *  L6 거너사우르스 · L7 트로피 · L8 황금 오라 · L9 왕관 · L10 불꽃
 */
export function Character({ level, size = 160, className = "" }: { level: number; size?: number; className?: string }) {
  const L = Math.max(1, level);
  const shirt = L >= 2 ? "#ef0107" : "#f3f4f8";
  const shirtStroke = L >= 2 ? "#a80005" : "#c5c9d6";
  const sleeves = L >= 3 ? "#ffffff" : shirt;
  const shorts = L >= 3 ? "#ffffff" : "#3b4a6b";
  const socks = L >= 3 ? "#ef0107" : "#dfe3ee";
  const boots = L >= 5 ? "#e3b341" : "#1b2235";
  return (
    <svg viewBox="0 0 200 200" width={size} height={size} className={className} aria-label={`레벨 ${L} 캐릭터`}>
      <defs>
        <radialGradient id="aura" cx="50%" cy="55%" r="50%">
          <stop offset="0%" stopColor="#ffe08a" stopOpacity=".9" />
          <stop offset="70%" stopColor="#e3b341" stopOpacity=".25" />
          <stop offset="100%" stopColor="#e3b341" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="flame" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0%" stopColor="#ef0107" />
          <stop offset="60%" stopColor="#ff8a00" />
          <stop offset="100%" stopColor="#ffe08a" />
        </linearGradient>
      </defs>

      {/* L8 황금 오라 */}
      {L >= 8 && <circle cx="100" cy="110" r="88" fill="url(#aura)" />}

      {/* L10 불꽃 */}
      {L >= 10 && (
        <g className="animate-flame" opacity=".9">
          <path d="M60 150 C 50 120, 70 110, 68 85 C 85 100, 80 120, 78 130 C 90 120, 88 100, 95 90 C 100 110, 92 135, 85 150 Z" fill="url(#flame)" />
          <path d="M140 150 C 150 120, 130 110, 132 85 C 115 100, 120 120, 122 130 C 110 120, 112 100, 105 90 C 100 110, 108 135, 115 150 Z" fill="url(#flame)" />
        </g>
      )}

      {/* L6 거너사우르스 */}
      {L >= 6 && (
        <g className="animate-float" style={{ animationDelay: ".6s" }}>
          <ellipse cx="160" cy="165" rx="18" ry="6" fill="#000" opacity=".25" />
          <path d="M150 160 C 140 150, 142 125, 160 122 C 178 125, 180 150, 170 160 Z" fill="#2fb857" stroke="#1e8a40" strokeWidth="2" />
          <path d="M172 150 C 185 150, 192 142, 194 134" stroke="#2fb857" strokeWidth="7" fill="none" strokeLinecap="round" />
          <circle cx="160" cy="118" r="12" fill="#2fb857" stroke="#1e8a40" strokeWidth="2" />
          <path d="M170 118 l 10 3 l -10 4 Z" fill="#2fb857" stroke="#1e8a40" strokeWidth="1.5" />
          <circle cx="163" cy="115" r="2.2" fill="#0b0f1c" />
          <path d="M152 108 l 4 -7 l 4 7 M160 106 l 4 -7 l 4 7" fill="#ef0107" stroke="#a80005" strokeWidth="1" />
          <rect x="150" y="124" width="20" height="12" rx="4" fill="#ef0107" />
          <rect x="150" y="124" width="5" height="12" fill="#fff" />
          <rect x="165" y="124" width="5" height="12" fill="#fff" />
        </g>
      )}

      {/* 그림자 */}
      <ellipse cx="100" cy="186" rx="34" ry="6" fill="#000" opacity=".3" />

      {/* 다리·양말·축구화 */}
      <rect x="84" y="140" width="12" height="26" rx="4" fill="#f1c9a5" />
      <rect x="104" y="140" width="12" height="26" rx="4" fill="#f1c9a5" />
      <rect x="83" y="152" width="14" height="18" rx="3" fill={socks} />
      <rect x="103" y="152" width="14" height="18" rx="3" fill={socks} />
      <path d="M80 170 h 18 v 10 h -22 a 4 4 0 0 1 -4 -4 v -3 a 3 3 0 0 1 3 -3 Z" fill={boots} />
      <path d="M102 170 h 18 a 3 3 0 0 1 3 3 v 3 a 4 4 0 0 1 -4 4 h -17 Z" fill={boots} />

      {/* 반바지 */}
      <path d="M78 118 h 44 v 16 l -6 10 h -13 l -3 -8 l -3 8 h -13 l -6 -10 Z" fill={shorts} stroke="#c5c9d6" strokeWidth="1" />

      {/* 몸통 (셔츠) */}
      <path d="M74 72 C 74 60, 84 56, 92 56 h 16 C 116 56, 126 60, 126 72 v 48 h -52 Z" fill={shirt} stroke={shirtStroke} strokeWidth="2" />
      {/* 소매 */}
      <path d="M74 72 l -14 10 l 8 18 l 10 -6 Z" fill={sleeves} stroke={shirtStroke} strokeWidth="2" />
      <path d="M126 72 l 14 10 l -8 18 l -10 -6 Z" fill={sleeves} stroke={shirtStroke} strokeWidth="2" />
      {/* 팔 */}
      <rect x="56" y="98" width="11" height="22" rx="5" fill="#f1c9a5" />
      <rect x="133" y="98" width="11" height="22" rx="5" fill="#f1c9a5" />
      {/* L5 주장 완장 */}
      {L >= 5 && <rect x="131" y="86" width="12" height="7" rx="2" fill="#e3b341" stroke="#9c824a" strokeWidth="1" />}

      {/* L3 대포 엠블럼 */}
      {L >= 3 && (
        <g transform="translate(86 78) scale(0.9)">
          <path d="M0 10 h 24 v 12 a 12 12 0 0 1 -24 0 Z" fill="#fff" stroke="#9c824a" strokeWidth="1.5" />
          <rect x="4" y="14" width="16" height="3" rx="1.5" fill="#ef0107" />
          <circle cx="7" cy="19" r="2" fill="#063672" />
        </g>
      )}

      {/* L4 머플러 */}
      {L >= 4 && (
        <g>
          <path d="M78 60 q 22 12 44 0 v 9 q -22 12 -44 0 Z" fill="#ef0107" />
          <path d="M78 63 q 22 12 44 0 v 3 q -22 12 -44 0 Z" fill="#fff" />
          <path d="M116 66 l 12 26 l -9 2 l -9 -24 Z" fill="#ef0107" stroke="#a80005" strokeWidth="1" />
          <path d="M119 74 l 2 5 l -5 1 l -2 -5 Z M122 82 l 2 5 l -5 1 l -2 -5 Z" fill="#fff" />
        </g>
      )}

      {/* 머리 */}
      <circle cx="100" cy="40" r="22" fill="#f1c9a5" stroke="#d9a983" strokeWidth="1.5" />
      {/* 머리카락 */}
      <path d="M78 36 C 80 20, 92 14, 100 16 C 110 14, 122 22, 122 36 C 116 30, 108 28, 100 29 C 92 28, 84 30, 78 36 Z" fill="#2b2118" />
      {/* 눈·입 */}
      <circle cx="92" cy="40" r="2.4" fill="#0b0f1c" />
      <circle cx="108" cy="40" r="2.4" fill="#0b0f1c" />
      <path d="M93 49 q 7 6 14 0" stroke="#a0542d" strokeWidth="2" fill="none" strokeLinecap="round" />
      {L >= 2 && <circle cx="86" cy="46" r="3" fill="#ff8a8a" opacity=".6" />}
      {L >= 2 && <circle cx="114" cy="46" r="3" fill="#ff8a8a" opacity=".6" />}

      {/* L9 왕관 */}
      {L >= 9 && (
        <g>
          <path d="M82 20 l 6 -12 l 7 8 l 5 -12 l 5 12 l 7 -8 l 6 12 Z" fill="#e3b341" stroke="#9c824a" strokeWidth="1.5" />
          <circle cx="88" cy="8" r="2" fill="#ef0107" />
          <circle cx="100" cy="4" r="2.2" fill="#ef0107" />
          <circle cx="112" cy="8" r="2" fill="#ef0107" />
        </g>
      )}

      {/* L7 트로피 (왼손) */}
      {L >= 7 && (
        <g transform="translate(40 92)">
          <path d="M8 0 h 16 v 8 a 8 8 0 0 1 -16 0 Z" fill="#e3b341" stroke="#9c824a" strokeWidth="1.5" />
          <path d="M8 2 h -5 a 4 4 0 0 0 4 6 h 1 M24 2 h 5 a 4 4 0 0 1 -4 6 h -1" stroke="#e3b341" strokeWidth="2" fill="none" />
          <rect x="14" y="15" width="4" height="7" fill="#e3b341" />
          <rect x="9" y="22" width="14" height="4" rx="1" fill="#9c824a" />
        </g>
      )}
    </svg>
  );
}
