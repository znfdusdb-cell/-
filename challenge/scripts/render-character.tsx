// 캐릭터 SVG 문자열을 뽑는다 (아이콘·OG 생성용): npx tsx scripts/render-character.tsx <level>
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { Character } from "../src/components/Character";
const level = parseInt(process.argv[2] ?? "6", 10);
process.stdout.write(renderToStaticMarkup(createElement(Character, { level, size: 200 })));
