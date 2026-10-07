// 캐릭터 SVG 문자열 (아이콘·OG 생성용): npx tsx scripts/render-character.tsx <level> <m|f>
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { Character } from "../src/components/Character";
const level = parseInt(process.argv[2] ?? "6", 10);
const gender = (process.argv[3] === "m" ? "m" : "f") as "m" | "f";
const crop = process.argv[4]; // "x y w h" 로 viewBox 를 바꿔 일부만 (아이콘 상반신용)
let svg = renderToStaticMarkup(createElement(Character, { level, gender, size: 220 }));
if (crop) svg = svg.replace(/viewBox="[^"]+"/, `viewBox="${crop}"`);
process.stdout.write(svg);
