// 카톡·SNS 링크 미리보기 이미지 생성 (1200×630): node scripts/og.mjs
import { createRequire } from "node:module";
import { readFileSync, writeFileSync } from "node:fs";
const pw = createRequire(process.env.NODE_PATH ? process.env.NODE_PATH + "/" : import.meta.url)("playwright");
const icon = readFileSync("scripts/icon.svg", "utf8");
const html = `<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Jua&display=swap" rel="stylesheet">
<style>
body{margin:0;width:1200px;height:630px;background:linear-gradient(135deg,#0b0f1c 0%,#1a0b10 60%,#3a0205 100%);color:#fff;font-family:Jua,"Apple SD Gothic Neo",sans-serif;display:flex;align-items:center;gap:60px;padding:0 90px;box-sizing:border-box;overflow:hidden}
.icon{width:300px;height:300px;flex:none;filter:drop-shadow(0 20px 40px rgba(0,0,0,.5))}
h1{font-size:96px;margin:0;line-height:1.05;font-weight:400}
p{font-size:38px;margin:18px 0 0;color:#c9ced9;line-height:1.35}
.tag{display:inline-block;margin-top:26px;background:#ef0107;color:#fff;font-size:30px;padding:10px 26px;border-radius:999px}
</style></head><body>
<img class="icon" src="data:image/svg+xml;base64,${Buffer.from(icon).toString("base64")}">
<div><h1>거너스 챌린지</h1><p>아스날 인사이드 톡방<br>다이어트 · 취미 인증하고 레벨업 🔥</p><div class="tag">매주 월요일 시작</div></div>
</body></html>`;
const browser = await pw.chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await page.setContent(html, { waitUntil: "networkidle" });
await page.waitForTimeout(500);
writeFileSync("public/og.png", await page.screenshot({ clip: { x: 0, y: 0, width: 1200, height: 630 } }));
await browser.close();
console.log("wrote public/og.png");
