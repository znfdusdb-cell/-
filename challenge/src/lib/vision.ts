import "server-only";

/**
 * 식사 사진 칼로리 추정. 키가 없으면 꺼진다(업로드는 그대로 됨).
 *  - GEMINI_API_KEY   : Google AI Studio 무료 등급 (기본, 0원)
 *  - ANTHROPIC_API_KEY: Claude (유료, ANTHROPIC_MODEL 로 모델 선택)
 *  - VISION_FAKE_KCAL : 테스트용. 숫자를 넣으면 API 없이 그 값으로 답한다
 */
export type MealEstimate = { kcal: number; foods: string[]; note: string; provider: string };

const PROMPT = `이 사진은 다이어트 챌린지의 식사 인증 사진이다. 사진에 보이는 음식만 보고 이 한 끼의 총 칼로리(kcal)를 추정해라.
- 한국 가정식·분식·배달 음식·카페 메뉴에 익숙하게 판단하고, 양(그릇 수, 인분, 사이즈)도 고려한다.
- 음식이 아니거나 음식이 잘 안 보이면 kcal 0, foods 빈 배열, note 에 이유를 쓴다.
- foods 는 보이는 음식 이름 1~5개(한국어). note 는 다이어트 관점의 한 줄 코멘트(40자 이내, 한국어, 비난 없이).
JSON 으로만 답한다.`;

const JSON_SCHEMA = {
  type: "object",
  properties: { kcal: { type: "integer" }, foods: { type: "array", items: { type: "string" } }, note: { type: "string" } },
  required: ["kcal", "foods", "note"],
  additionalProperties: false,
} as const;

/** 어떤 제공자가 켜져 있는지 (관리 탭 표시용). null 이면 꺼짐 */
export function visionProvider(): "fake" | "gemini" | "claude" | null {
  if ((process.env.VISION_FAKE_KCAL ?? "").trim()) return "fake";
  if ((process.env.GEMINI_API_KEY ?? "").trim()) return "gemini";
  if ((process.env.ANTHROPIC_API_KEY ?? "").trim()) return "claude";
  return null;
}

function parseEstimate(text: string, provider: string): MealEstimate | null {
  const body = text.replace(/^```(?:json)?/m, "").replace(/```\s*$/m, "").trim();
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start < 0 || end < 0) return null;
  try {
    const j = JSON.parse(body.slice(start, end + 1)) as { kcal?: unknown; foods?: unknown; note?: unknown };
    const kcal = Math.max(0, Math.min(5000, Math.round(Number(j.kcal) || 0)));
    const foods = Array.isArray(j.foods) ? j.foods.filter((x): x is string => typeof x === "string").map((s) => s.trim()).filter(Boolean).slice(0, 5) : [];
    const note = typeof j.note === "string" ? j.note.trim().slice(0, 60) : "";
    return { kcal, foods, note, provider };
  } catch {
    return null;
  }
}

async function viaGemini(bytes: Uint8Array, mime: string): Promise<MealEstimate | null> {
  const key = (process.env.GEMINI_API_KEY ?? "").trim();
  const model = (process.env.GEMINI_MODEL ?? "").trim() || "gemini-2.5-flash";
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({
      contents: [{ parts: [{ inline_data: { mime_type: mime, data: Buffer.from(bytes).toString("base64") } }, { text: PROMPT }] }],
      generationConfig: {
        temperature: 0.2,
        responseMimeType: "application/json",
        responseSchema: { type: "OBJECT", properties: { kcal: { type: "INTEGER" }, foods: { type: "ARRAY", items: { type: "STRING" } }, note: { type: "STRING" } }, required: ["kcal", "foods", "note"] },
      },
    }),
    signal: AbortSignal.timeout(25000),
  });
  if (!res.ok) throw new Error(`gemini ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const j = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
  const text = j.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  return parseEstimate(text, "gemini");
}

async function viaClaude(bytes: Uint8Array, mime: string): Promise<MealEstimate | null> {
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic({ apiKey: (process.env.ANTHROPIC_API_KEY ?? "").trim(), timeout: 25000, maxRetries: 1 });
  const model = (process.env.ANTHROPIC_MODEL ?? "").trim() || "claude-opus-5-5";
  const res = await client.beta.messages.create({
    model,
    max_tokens: 2048,
    // 안전 분류기가 거절하면 서버가 기본 대체 모델로 다시 돌린다
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "low", format: { type: "json_schema", schema: JSON_SCHEMA as unknown as Record<string, unknown> } },
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mime as "image/jpeg" | "image/png" | "image/webp", data: Buffer.from(bytes).toString("base64") } },
          { type: "text", text: PROMPT },
        ],
      },
    ],
  });
  if (res.stop_reason === "refusal") return null;
  const text = res.content.filter((b) => b.type === "text").map((b) => b.text).join("");
  return parseEstimate(text, "claude");
}

/** 추정 실패(키 없음·네트워크·형식)는 null. 업로드를 막지 않기 위해 예외를 밖으로 내지 않는다. */
export async function estimateMeal(bytes: Uint8Array, mime: string): Promise<MealEstimate | null> {
  const provider = visionProvider();
  try {
    if (provider === "fake") {
      const kcal = parseInt(process.env.VISION_FAKE_KCAL!, 10);
      return { kcal, foods: ["테스트 음식"], note: "테스트 모드 추정", provider: "fake" };
    }
    if (provider === "gemini") return await viaGemini(bytes, mime);
    if (provider === "claude") return await viaClaude(bytes, mime);
    return null;
  } catch (e) {
    console.error("[vision]", (e as Error).message);
    return null;
  }
}
