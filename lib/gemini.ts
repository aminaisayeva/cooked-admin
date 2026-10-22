// Server-only: Google Gemini captions, the same prompt and voices as the cooked.ai app.

export function captionUserMessage(context: string | null) {
  return context ? `Uploader's context: "${context}"` : "No context from the uploader.";
}

export function geminiModel() {
  // Google's recommended alias; it always points at the current Flash model.
  return process.env.GEMINI_MODEL || "gemini-flash-latest";
}

// Tried in order when the preferred model is overloaded (503) or unavailable.
const FALLBACK_MODELS = ["gemini-3.5-flash", "gemini-flash-lite-latest"];

// The least "thinking" each model accepts, so pages come back faster.
function thinkingConfig(model: string) {
  if (model.startsWith("gemini-2.5")) return { thinkingBudget: 0 };
  if (model === "gemini-flash-latest" || model.startsWith("gemini-3.8")) return { thinkingLevel: "low" };
  return { thinkingLevel: "minimal" };
}

export class GeminiError extends Error {}

// Overloaded (503), rate limited (429) or a server hiccup: worth another try.
class RetryableError extends GeminiError {}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type Part = { text: string } | { inlineData: { mimeType: string; data: string } };

type JsonCall = {
  systemPrompt: string;
  parts: Part[];
  schema: Record<string, unknown>;
  maxOutputTokens: number;
  timeoutMs: number;
  temperature?: number;
};

// Ask Gemini for JSON matching `schema`. Retries overloaded models, then falls
// back to the next model. Returns the parsed object and the model that answered.
async function callJson<T>(call: JsonCall): Promise<{ data: Partial<T>; model: string }> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new GeminiError("The AI isn't configured yet (missing GEMINI_API_KEY).");

  const models = [...new Set([geminiModel(), ...FALLBACK_MODELS])];
  let lastError: GeminiError = new GeminiError("The AI is busy right now. Try again in a minute.");
  for (const model of models) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        return { data: await callModel<T>(model, apiKey, call), model };
      } catch (err) {
        if (!(err instanceof RetryableError)) throw err;
        lastError = err;
        if (attempt === 0) await sleep(1500);
      }
    }
  }
  throw lastError;
}

async function callModel<T>(model: string, apiKey: string, call: JsonCall): Promise<Partial<T>> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: call.systemPrompt }] },
        contents: [{ role: "user", parts: call.parts }],
        generationConfig: {
          temperature: call.temperature ?? 1,
          maxOutputTokens: call.maxOutputTokens,
          responseMimeType: "application/json",
          responseSchema: call.schema,
          thinkingConfig: thinkingConfig(model),
        },
      }),
      cache: "no-store",
      // Leave time for a fallback model if this one stalls.
      signal: AbortSignal.timeout(call.timeoutMs),
    },
  ).catch((err: unknown) => {
    throw new RetryableError(
      err instanceof Error && err.name === "TimeoutError" ? "The AI took too long. Try again." : "Couldn't reach the AI. Try again.",
    );
  });

  if (!res.ok) {
    const body = await res.text();
    if (res.status === 429 || res.status >= 500 || res.status === 404) {
      // 404: this model isn't available to the key; move on to the next one.
      throw new RetryableError(
        res.status === 429
          ? "The AI is busy right now (rate limit). Try again in a minute."
          : "Google's AI is overloaded right now. Try again in a minute.",
      );
    }
    console.error("gemini error", res.status, body.slice(0, 500));
    throw new GeminiError(`The AI request failed (${res.status}).`);
  }

  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
    promptFeedback?: { blockReason?: string };
  };
  if (data.promptFeedback?.blockReason || data.candidates?.[0]?.finishReason === "SAFETY") {
    throw new GeminiError("The AI declined that one. Try something else.");
  }
  const candidate = data.candidates?.[0];
  const text = candidate?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  if (!text) throw new GeminiError("The AI returned nothing. Try again.");
  try {
    return JSON.parse(text) as Partial<T>;
  } catch {
    throw new GeminiError(
      candidate?.finishReason === "MAX_TOKENS" ? "The answer came out too long. Try something simpler." : "The AI returned something unexpected. Try again.",
    );
  }
}

// --- cooked.ai --------------------------------------------------------------

// The voices every photo gets captioned in, in display order. Picked for the
// course persona: a chronically online Columbia junior from the Midwest.
export const CAPTION_STYLES = [
  { style: "Chronically Online", emoji: "\u{1F480}", brief: "Gen Z internet brain: lowercase, terminally online slang, reaction-meme energy." },
  { style: "Midwest Mom", emoji: "\u{1F33D}", brief: "Supportive, slightly worried Midwestern mom texting about the photo. Casserole energy." },
  { style: "Real New Yorker", emoji: "\u{1F5FD}", brief: "Blunt, unimpressed native New Yorker who has seen it all. Short and dry." },
  { style: "Columbia Tour Guide", emoji: "\u{1F981}", brief: "Over-enthusiastic campus tour guide walking backwards, making everything sound prestigious." },
] as const;

export const CAPTION_SYSTEM_PROMPT = `You write captions for cooked.ai, where college students upload a photo and the internet votes on which caption "cooked" hardest.

Look closely at the photo and write exactly one caption for each voice below. Each caption must be specific to what is actually in the photo (objects, setting, lighting, vibe), short (under 140 characters), and funny enough that someone would screenshot it. Different jokes per voice, no repeats.

Voices:
${CAPTION_STYLES.map((c) => `- "${c.style}": ${c.brief}`).join("\n")}

Rules:
- Roast the situation, never people's bodies, race, gender, or other protected traits. Playful, not cruel. PG-13.
- If the uploader added context, use it.
- No hashtags. Emoji are fine but not required.
- Return captions in the order the voices are listed, with "style" set to the voice name exactly.`;

export type GeneratedCaption = { style: string; text: string };

export async function captionPhoto(
  image: { mimeType: string; base64: string },
  context: string | null,
): Promise<{ captions: GeneratedCaption[]; model: string }> {
  const { data, model } = await callJson<{ captions: GeneratedCaption[] }>({
    systemPrompt: CAPTION_SYSTEM_PROMPT,
    parts: [
      { inlineData: { mimeType: image.mimeType, data: image.base64 } },
      { text: captionUserMessage(context) },
    ],
    maxOutputTokens: 2000,
    timeoutMs: 60_000,
    schema: {
      type: "OBJECT",
      properties: {
        captions: {
          type: "ARRAY",
          items: {
            type: "OBJECT",
            properties: { style: { type: "STRING" }, text: { type: "STRING" } },
            required: ["style", "text"],
            propertyOrdering: ["style", "text"],
          },
        },
      },
      required: ["captions"],
    },
  });

  // Keep only the voices we asked for, one each, in our order.
  const byStyle = new Map(
    (Array.isArray(data.captions) ? data.captions : [])
      .filter((c) => c && typeof c.text === "string" && c.text.trim())
      .map((c) => [String(c.style).toLowerCase().trim(), c.text.trim().replace(/^["“]|["”]$/g, "").slice(0, 280)]),
  );
  const captions = CAPTION_STYLES.flatMap(({ style }) => {
    const text = byStyle.get(style.toLowerCase());
    return text ? [{ style, text }] : [];
  });
  if (captions.length < 2) throw new GeminiError("The AI couldn't caption that photo. Try another one.");
  return { captions, model };
}
