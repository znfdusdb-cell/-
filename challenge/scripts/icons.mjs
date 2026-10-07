// PNG 아이콘 재생성: npm run icons
// Playwright(Chromium)가 있으면 그걸로, 없으면 ImageMagick(rsvg 델리게이트 필요)로 그린다.
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";

const jobs = [
  ["scripts/icon.svg", 512, "public/icons/icon-512.png"],
  ["scripts/icon.svg", 192, "public/icons/icon-192.png"],
  ["scripts/icon.svg", 180, "public/icons/apple-touch-icon.png"],
  ["scripts/icon-maskable.svg", 512, "public/icons/icon-512-maskable.png"],
  ["scripts/badge.svg", 96, "public/icons/badge-96.png"],
  ["scripts/icon.svg", 48, "public/favicon.png"],
];

async function withPlaywright() {
  let pw;
  try {
    pw = createRequire(import.meta.url)("playwright");
  } catch {
    try { pw = createRequire(process.env.NODE_PATH ? process.env.NODE_PATH + "/" : "/usr/lib/node_modules/")("playwright"); } catch { return false; }
  }
  const browser = await pw.chromium.launch();
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  for (const [src, size, out] of jobs) {
    const svg = readFileSync(src, "utf8");
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(`<html><body style="margin:0;background:transparent"><img src="data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}" width="${size}" height="${size}" style="display:block"></body></html>`);
    const buf = await page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
    writeFileSync(out, buf);
    console.log("wrote", out);
  }
  await browser.close();
  return true;
}

if (!(await withPlaywright())) {
  for (const [src, size, out] of jobs) {
    execSync(`convert -background none -density 384 ${src} -resize ${size}x${size} ${out}`, { stdio: "inherit" });
    console.log("wrote", out);
  }
}
