// 캐릭터 SVG 문자열 (아이콘·OG 생성용): npx tsx scripts/render-character.tsx <level> <m|f>
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { Character } from "../src/components/Character";
const level = parseInt(process.argv[2] ?? "6", 10);
const gender = (process.argv[3] === "m" ? "m" : "f") as "m" | "f";
process.stdout.write(renderToStaticMarkup(createElement(Character, { level, gender, size: 220 })));
