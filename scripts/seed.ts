/**
 * 시드 데이터를 Supabase에 넣거나(upsert) SQL 파일로 뽑는다.
 *   npx tsx scripts/seed.ts --sql     → supabase/seed.sql 생성 (SQL Editor에 붙여넣기용)
 *   npx tsx scripts/seed.ts           → .env.local 의 Supabase에 직접 upsert
 * 같은 데이터가 src/lib/seed-data.ts 에 있어 사이트의 시드 모드와 항상 일치한다.
 */
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { RULES } from "../src/lib/constants";
import {
  SEED_STOCKS, SEED_STAGE_LOG, SEED_THESES, SEED_SETUPS, SEED_POSITIONS, SEED_ORDERS, SEED_EVENTS, SEED_PREDICTIONS, SEED_REGIME, SEED_CANDLES,
} from "../src/lib/seed-data";

type Row = Record<string, unknown>;
const strip = <T extends Row>(rows: T[], keys: string[]) => rows.map((r) => Object.fromEntries(Object.entries(r).filter(([k]) => !keys.includes(k))));

const TABLES: { table: string; rows: Row[]; conflict: string }[] = [
  { table: "sb_rules", rows: RULES as unknown as Row[], conflict: "rule_id" },
  { table: "sb_stocks", rows: SEED_STOCKS as unknown as Row[], conflict: "code" },
  { table: "sb_stage_log", rows: strip(SEED_STAGE_LOG as unknown as Row[], ["id"]), conflict: "" },
  { table: "sb_theses", rows: strip(SEED_THESES as unknown as Row[], ["id"]), conflict: "" },
  { table: "sb_setups", rows: strip(SEED_SETUPS as unknown as Row[], ["id"]), conflict: "code,as_of" },
  { table: "sb_positions", rows: strip(SEED_POSITIONS as unknown as Row[], ["id"]), conflict: "" },
  { table: "sb_orders_log", rows: strip(SEED_ORDERS as unknown as Row[], ["id"]), conflict: "" },
  { table: "sb_events", rows: strip(SEED_EVENTS as unknown as Row[], ["id"]), conflict: "" },
  { table: "sb_predictions", rows: strip(SEED_PREDICTIONS as unknown as Row[], ["id"]), conflict: "" },
  { table: "sb_market_regime", rows: SEED_REGIME as unknown as Row[], conflict: "as_of" },
  { table: "sb_candles", rows: SEED_CANDLES as unknown as Row[], conflict: "code,date" },
];

function lit(v: unknown): string {
  if (v === null || v === undefined) return "null";
  if (typeof v === "number") return String(v);
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "object") return `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`;
  return `'${String(v).replace(/'/g, "''")}'`;
}

function toSQL(): string {
  const out: string[] = ["-- 자동 생성: npx tsx scripts/seed.ts --sql  (수정은 src/lib/seed-data.ts 에서)", "begin;"];
  // 시드 종목 재실행 시 중복 방지: 시드 종목의 하위 행을 먼저 지운다 (cascade).
  out.push(`delete from sb_stocks where code in (${SEED_STOCKS.map((s) => lit(s.code)).join(",")});`);
  for (const t of TABLES) {
    if (!t.rows.length) continue;
    const cols = Object.keys(t.rows[0]);
    const values = t.rows.map((r) => `(${cols.map((c) => lit(r[c])).join(",")})`).join(",\n");
    const onConflict = t.conflict ? ` on conflict (${t.conflict}) do update set ${cols.filter((c) => !t.conflict.split(",").includes(c)).map((c) => `${c}=excluded.${c}`).join(", ")}` : "";
    out.push(`insert into ${t.table} (${cols.join(",")}) values\n${values}${onConflict};`);
  }
  out.push("commit;");
  return out.join("\n\n") + "\n";
}

async function main() {
  if (process.argv.includes("--sql")) {
    writeFileSync("supabase/seed.sql", toSQL());
    console.log("supabase/seed.sql 생성. 행 수:", TABLES.map((t) => `${t.table}=${t.rows.length}`).join(", "));
    return;
  }
  if (existsSync(".env.local")) {
    for (const line of readFileSync(".env.local", "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 필요 (.env.local)");
  const db = createClient(url, key, { auth: { persistSession: false } });
  const del = await db.from("sb_stocks").delete().in("code", SEED_STOCKS.map((s) => s.code));
  if (del.error) throw del.error;
  for (const t of TABLES) {
    const q = t.conflict ? db.from(t.table).upsert(t.rows, { onConflict: t.conflict }) : db.from(t.table).insert(t.rows);
    const { error } = await q;
    if (error) throw new Error(`${t.table}: ${error.message}`);
    console.log(`${t.table}: ${t.rows.length}행`);
  }
  // read-back 검증
  const { count } = await db.from("sb_stocks").select("*", { count: "exact", head: true });
  console.log("검증: sb_stocks 행 수 =", count);
}

main().catch((e) => { console.error(e); process.exit(1); });
