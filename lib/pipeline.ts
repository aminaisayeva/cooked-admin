// Server-only: writes a photo's captions with a prompt chain from the
// database (prompt_chains, steps, mix, models, terms, examples), and logs the
// request and every model call (generation_requests, llm_responses) for the
// admin area.
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  CAPTION_STYLES,
  CAPTION_SYSTEM_PROMPT,
  CAPTIONS_SCHEMA,
  callJson,
  captionPhoto,
  captionUserMessage,
  GeminiError,
  pickCaptions,
  type Attempt,
  type GeneratedCaption,
  type ModelChoice,
} from "@/lib/gemini";
import { reigningChampion, standingsForPrompt, voiceLeague } from "@/lib/league";

type Step = { id: string; step_order: number; name: string; instructions: string; include_image: boolean; model_id: string | null };
type Chain = { id: string; name: string; weight: number; steps: Step[] };
type Model = { id: string; api_model_id: string; priority: number; temperature: number; max_output_tokens: number; is_active: boolean; llm_providers: { slug: string; is_active: boolean } | null };

export type PipelineResult = {
  requestId: string;
  chainId: string | null;
  captions: GeneratedCaption[];
  model: string;
  // Every step's instructions as sent, for the photo's "See the prompt".
  systemPrompt: string;
};

async function loadConfig(supabase: SupabaseClient) {
  const [chains, models, terms, examples, league, champion] = await Promise.all([
    supabase
      .from("prompt_chains")
      .select("id, name, prompt_chain_mix(weight), prompt_chain_steps(id, step_order, name, instructions, include_image, model_id)")
      .eq("is_active", true),
    supabase
      .from("llm_models")
      .select("id, api_model_id, priority, temperature, max_output_tokens, is_active, llm_providers(slug, is_active)")
      .order("priority"),
    supabase.from("terms").select("term, definition").order("term"),
    supabase.from("generation_examples").select("voice, photo_description, caption").eq("is_active", true),
    voiceLeague(supabase),
    reigningChampion(supabase),
  ]);
  if (chains.error) throw new Error(chains.error.message);

  const allChains: Chain[] = (chains.data ?? []).map((c) => {
    const mix = c.prompt_chain_mix as unknown as { weight: number } | { weight: number }[] | null;
    return {
      id: c.id,
      name: c.name,
      weight: (Array.isArray(mix) ? mix[0]?.weight : mix?.weight) ?? 0,
      steps: [...((c.prompt_chain_steps ?? []) as Step[])].sort((a, b) => a.step_order - b.step_order),
    };
  });

  // Only Gemini is wired up; other providers' models are skipped.
  const usable = ((models.data ?? []) as unknown as Model[]).filter((m) => m.llm_providers?.slug === "google" && m.llm_providers.is_active);
  const choice = (m: Model): ModelChoice => ({
    id: m.id,
    apiModelId: m.api_model_id,
    temperature: Number(m.temperature),
    maxOutputTokens: m.max_output_tokens,
  });

  const voices = CAPTION_STYLES.map((c) => `- "${c.style}": ${c.brief}`).join("\n");
  const termList = (terms.data ?? []).map((t) => `- ${t.term}: ${t.definition}`).join("\n") || "(none)";
  const exampleList =
    CAPTION_STYLES.flatMap(({ style }) =>
      (examples.data ?? []).filter((e) => e.voice === style).map((e) => `- ${style}, on "${e.photo_description}": ${e.caption}`),
    ).join("\n") || "(none)";

  return {
    chains: allChains.filter((c) => c.weight > 0 && c.steps.length > 0),
    // Default order for steps that don't name a model: active ones by priority.
    defaultModels: usable.filter((m) => m.is_active).map(choice),
    modelById: new Map(usable.map((m) => [m.id, choice(m)])),
    fill: { voices, terms: termList, examples: exampleList, standings: standingsForPrompt(league, champion) },
  };
}

// Weighted random pick, so the mix decides how often each chain runs.
function pickChain(chains: Chain[]) {
  let roll = Math.random() * chains.reduce((s, c) => s + c.weight, 0);
  for (const c of chains) {
    roll -= c.weight;
    if (roll < 0) return c;
  }
  return chains[chains.length - 1];
}

function render(template: string, values: Record<string, string>) {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key: string) => values[key] ?? match);
}

const NOTES_SCHEMA = { type: "OBJECT", properties: { notes: { type: "STRING" } }, required: ["notes"] };

export async function runCaptionPipeline(
  supabase: SupabaseClient,
  input: { image: { mimeType: string; base64: string }; context: string | null; source: "app" | "admin" },
): Promise<PipelineResult> {
  const started = Date.now();
  const requestId = crypto.randomUUID();
  const config = await loadConfig(supabase).catch((err: unknown) => {
    console.error("couldn't load the prompt chains", err);
    return null;
  });
  const chain = config?.chains.length ? pickChain(config.chains) : null;

  // Logging never blocks captioning: failures are only reported.
  const log = async (write: PromiseLike<{ error: { message: string } | null }>) => {
    const { error } = await write;
    if (error) console.error("pipeline log failed", error.message);
  };
  await log(supabase.from("generation_requests").insert({ id: requestId, chain_id: chain?.id ?? null, source: input.source, context: input.context }));
  const finish = (fields: Record<string, unknown>) =>
    log(supabase.from("generation_requests").update({ ...fields, duration_ms: Date.now() - started, finished_at: new Date().toISOString() }).eq("id", requestId));

  try {
    if (!config || !chain) {
      // No usable chain (or the tables are unreachable): the built-in prompt.
      const result = await captionPhoto(input.image, input.context);
      await finish({ status: "succeeded", caption_count: result.captions.length });
      return { requestId, chainId: null, ...result, systemPrompt: CAPTION_SYSTEM_PROMPT };
    }

    const message = captionUserMessage(input.context);
    const sent: string[] = [];
    let previous = "";
    let final: { captions: GeneratedCaption[]; model: string } | null = null;

    for (const [i, step] of chain.steps.entries()) {
      const last = i === chain.steps.length - 1;
      const systemPrompt = render(step.instructions, { ...config.fill, previous: previous || "(nothing yet)" });
      sent.push(chain.steps.length > 1 ? `Step ${step.step_order}: ${step.name}\n\n${systemPrompt}` : systemPrompt);
      const pinned = step.model_id ? config.modelById.get(step.model_id) : undefined;
      const models = pinned ? [pinned, ...config.defaultModels.filter((m) => m.id !== pinned.id)] : config.defaultModels;

      const onAttempt = (a: Attempt) =>
        log(
          supabase.from("llm_responses").insert({
            request_id: requestId,
            step_id: step.id,
            step_order: step.step_order,
            model_id: a.model.id ?? null,
            model_name: a.model.apiModelId,
            system_prompt: systemPrompt,
            user_message: (step.include_image ? "[photo] " : "") + message,
            response_text: a.text,
            status: a.ok ? "ok" : "error",
            http_status: a.httpStatus,
            error: a.error?.slice(0, 1000) ?? null,
            prompt_tokens: a.promptTokens,
            output_tokens: a.outputTokens,
            duration_ms: a.durationMs,
          }),
        );

      const parts = [
        ...(step.include_image ? [{ inlineData: { mimeType: input.image.mimeType, data: input.image.base64 } }] : []),
        { text: message },
      ];
      if (last) {
        const { data, model } = await callJson<{ captions: GeneratedCaption[] }>({
          systemPrompt,
          parts,
          schema: CAPTIONS_SCHEMA,
          maxOutputTokens: 2000,
          timeoutMs: 60_000,
          models,
          onAttempt,
        });
        final = { captions: pickCaptions(data), model };
      } else {
        const { data } = await callJson<{ notes: string }>({
          systemPrompt,
          parts,
          schema: NOTES_SCHEMA,
          maxOutputTokens: 1500,
          timeoutMs: 45_000,
          models,
          onAttempt,
        });
        previous = String(data.notes ?? "").trim().slice(0, 4000);
      }
    }

    await finish({ status: "succeeded", caption_count: final!.captions.length });
    return {
      requestId,
      chainId: chain.id,
      ...final!,
      systemPrompt: `Prompt chain: ${chain.name}\n\n${sent.join("\n\n---\n\n")}`,
    };
  } catch (err) {
    await finish({ status: "failed", error: (err instanceof Error ? err.message : String(err)).slice(0, 1000) });
    throw err instanceof GeminiError ? err : new GeminiError("Couldn't cook that pic. Try again.");
  }
}

// Point the request at the photo it produced.
export async function linkRequestToPhoto(supabase: SupabaseClient, requestId: string, photoId: string) {
  const { error } = await supabase.from("generation_requests").update({ photo_id: photoId }).eq("id", requestId);
  if (error) console.error("pipeline log failed", error.message);
}
