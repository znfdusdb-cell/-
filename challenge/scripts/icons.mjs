// 앱 아이콘·OG 이미지 재생성: npm run icons  (Playwright Chromium 사용). 픽셀이 뭉개지지 않게 정수 배율로 그린다.
import { createRequire } from "node:module";
import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";
const req = createRequire(process.env.NODE_PATH ? process.env.NODE_PATH + "/" : import.meta.url);
const pw = req("playwright");
const char = (lv, g, crop = "") => execSync(`npx tsx scripts/render-character.tsx ${lv} ${g} ${crop ? `"${crop}"` : ""}`, { encoding: "utf8" });
const sized = (svg, w, h) => svg.replace(/width="\d+"/, `width="${w}"`).replace(/height="\d+"/, `height="${h}"`);
// 아이콘: 만렙 여자 상반신 (왕관 ~ 가슴 엠블럼, 머플러·완장 포함)
const ICON_VB = { x: 7, y: 0, w: 30, h: 30 };
const f10top = char(10, "f", `${ICON_VB.x} ${ICON_VB.y} ${ICON_VB.w} ${ICON_VB.h}`);
// OG: 만렙 남녀 상반신, 글자 없이 단색 배경
const OG_VB = "7 0 30 30";
const noAura = (svg) => svg.replace(/<ellipse[^>]*px-aura[^>]*><\/ellipse>|<ellipse[^>]*px-aura[^>]*\/>/g, "");
const f10 = noAura(char(10, "f", OG_VB));
const m10 = noAura(char(10, "m", OG_VB));

// 44×48 스프라이트. 아이콘 안에서 픽셀 1칸 = k px (정수)
const iconHtml = (size, rounded) => {
  const k = Math.max(1, Math.floor((size * 0.96) / ICON_VB.h));
  const w = ICON_VB.w * k, h = ICON_VB.h * k;
  return `<!doctype html><html><body style="margin:0;width:${size}px;height:${size}px;overflow:hidden">
<div style="width:${size}px;height:${size}px;background:linear-gradient(160deg,#ff3b4e,#c80021);border-radius:${rounded ? Math.round(size * 0.22) : 0}px;display:flex;align-items:flex-end;justify-content:center;overflow:hidden">
<div style="margin-bottom:${-Math.round(k * 2)}px">${sized(f10top, w, h)}</div></div></body></html>`;
};

const ogHtml = `<!doctype html><html><head><meta charset="utf-8"><style>
body{margin:0;width:1200px;height:630px;background:#ffe3e6;display:flex;align-items:flex-end;justify-content:center;gap:40px;overflow:hidden}
svg{display:block}
</style></head><body>${sized(f10, 540, 540)}${sized(m10, 540, 540)}</body></html>`;

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
