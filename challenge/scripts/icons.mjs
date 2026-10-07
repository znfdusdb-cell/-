// 앱 아이콘·OG 이미지 재생성: npm run icons  (Playwright Chromium 사용). 픽셀이 뭉개지지 않게 정수 배율로 그린다.
import { createRequire } from "node:module";
import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";
const req = createRequire(process.env.NODE_PATH ? process.env.NODE_PATH + "/" : import.meta.url);
const pw = req("playwright");
const char = (lv, g) => execSync(`npx tsx scripts/render-character.tsx ${lv} ${g}`, { encoding: "utf8" });
const sized = (svg, w, h) => svg.replace(/width="\d+"/, `width="${w}"`).replace(/height="\d+"/, `height="${h}"`);
const f3 = char(3, "f");
const f6 = char(6, "f");
const m4 = char(4, "m");

// 44×48 스프라이트. 아이콘 안에서 픽셀 1칸 = k px (정수)
const iconHtml = (size, rounded) => {
  const k = Math.max(1, Math.floor((size * 0.9) / 48));
  const w = 44 * k, h = 48 * k;
  return `<!doctype html><html><body style="margin:0;width:${size}px;height:${size}px;overflow:hidden">
<div style="width:${size}px;height:${size}px;background:linear-gradient(160deg,#ff3b4e,#c80021);border-radius:${rounded ? Math.round(size * 0.22) : 0}px;display:flex;align-items:center;justify-content:center">
${sized(f3, w, h)}</div></body></html>`;
};

const ogHtml = `<!doctype html><html><head><meta charset="utf-8"><style>
body{margin:0;width:1200px;height:630px;background:#fff7f1;font-family:-apple-system,"Apple SD Gothic Neo","Noto Sans KR",sans-serif;display:flex;align-items:center;gap:24px;padding:0 70px;box-sizing:border-box;overflow:hidden;position:relative}
.blob{position:absolute;right:-120px;top:-140px;width:520px;height:520px;border-radius:50%;background:#ffe3e6}
.chars{display:flex;gap:0;align-items:flex-end;position:relative;flex:none}
h1{font-size:74px;margin:0;line-height:1.05;font-weight:800;color:#1a1614;letter-spacing:-.02em;position:relative}
p{font-size:33px;margin:16px 0 0;color:#5c5651;line-height:1.35;position:relative}
.tag{display:inline-block;margin-top:24px;background:#e4002b;color:#fff;font-size:28px;font-weight:700;padding:10px 24px;border-radius:999px;position:relative}
</style></head><body><div class="blob"></div>
<div class="chars">${sized(f6, 308, 336)}${sized(m4, 242, 264)}</div>
<div><h1>거너스 챌린지</h1><p>아스날 인사이드 톡방<br>다이어트 · 취미 인증하고 레벨업</p><div class="tag">실패하면 메가커피 쏘기</div></div>
</body></html>`;

const browser = await pw.chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 1 });
const shots = [
  [512, true, "public/icons/icon-512.png"], [192, true, "public/icons/icon-192.png"], [180, true, "public/icons/apple-touch-icon.png"],
  [512, false, "public/icons/icon-512-maskable.png"], [96, true, "public/icons/badge-96.png"], [48, true, "public/favicon.png"],
];
for (const [size, rounded, out] of shots) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(iconHtml(size, rounded));
  writeFileSync(out, await page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } }));
  console.log("wrote", out);
}
await page.setViewportSize({ width: 1200, height: 630 });
await page.setContent(ogHtml);
await page.waitForTimeout(300);
writeFileSync("public/og.png", await page.screenshot({ clip: { x: 0, y: 0, width: 1200, height: 630 } }));
console.log("wrote public/og.png");
await browser.close();
