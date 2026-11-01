import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import StatusPill from "@/components/StatusPill";
import { formatDateTime, photoUrl, requireAdmin } from "@/lib/admin";

export const metadata: Metadata = { title: "Generation request" };

type Response = {
  id: string;
  step_order: number;
  model_name: string;
  system_prompt: string;
  user_message: string;
  response_text: string | null;
  status: string;
  http_status: number | null;
  error: string | null;
  prompt_tokens: number | null;
  output_tokens: number | null;
  duration_ms: number;
  created_at: string;
  prompt_chain_steps: { name: string } | null;
};

// READ one generation request and its LLM responses, in the order they ran.
export default async function RequestPage({ params }: PageProps<"/requests/[id]">) {
  const { supabase } = await requireAdmin();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [{ data: r }, { data: responses }] = await Promise.all([
    supabase
      .from("generation_requests")
      .select("id, source, context, status, error, caption_count, duration_ms, created_at, finished_at, photo_id, chain_id, prompt_chains(name), profiles(email), photos(image_path)")
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("llm_responses")
      .select("id, step_order, model_name, system_prompt, user_message, response_text, status, http_status, error, prompt_tokens, output_tokens, duration_ms, created_at, prompt_chain_steps(name)")
      .eq("request_id", id)
      .order("created_at"),
  ]);
  if (!r) notFound();
  const chain = r.prompt_chains as unknown as { name: string } | null;
  const who = r.profiles as unknown as { email: string | null } | null;
  const photo = r.photos as unknown as { image_path: string } | null;
  const calls = (responses ?? []) as unknown as Response[];

  return (
    <div className="space-y-8">
      <Link href="/requests" className="text-sm text-ink-2 hover:text-ink">← All requests</Link>
      <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_14rem]">
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 rounded-xl border border-line bg-surface p-4 text-sm">
          <dt className="text-ink-2">Status</dt>
          <dd><StatusPill status={r.status} /> {r.error && <span className="text-critical">{r.error}</span>}</dd>
          <dt className="text-ink-2">Chain</dt>
          <dd>{chain ? <Link href={`/chains/${r.chain_id}`} className="hover:underline">{chain.name}</Link> : "Built-in prompt"}</dd>
          <dt className="text-ink-2">Who</dt>
          <dd>{who?.email ?? "—"} <span className="text-muted">({r.source})</span></dd>
          <dt className="text-ink-2">Context</dt>
          <dd>{r.context ?? <span className="text-muted">none</span>}</dd>
          <dt className="text-ink-2">Started</dt>
          <dd>{formatDateTime(r.created_at)}</dd>
          <dt className="text-ink-2">Took</dt>
          <dd className="tabular-nums">{r.duration_ms ? `${(r.duration_ms / 1000).toFixed(1)} s` : "—"} · {calls.length} model call{calls.length === 1 ? "" : "s"} · {r.caption_count ?? 0} captions</dd>
        </dl>
        {photo ? (
          <Link href={`/media/${r.photo_id}`} className="block">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photoUrl(photo.image_path)} alt="The photo this request captioned" className="w-full rounded-xl border border-line" />
            <span className="mt-1 block text-xs text-ink-2">Open the post →</span>
          </Link>
        ) : (
          <p className="rounded-xl border border-line bg-surface p-4 text-sm text-muted">No photo was saved for this request.</p>
        )}
      </div>

      <section>
        <h2 className="mb-3 text-sm font-semibold">LLM responses</h2>
        <ol className="space-y-4">
          {calls.map((c) => (
            <li key={c.id} id={c.id} className="scroll-mt-20 rounded-xl border border-line bg-surface p-4">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                <StatusPill status={c.status} />
                <span className="font-medium">Step {c.step_order}{c.prompt_chain_steps ? `: ${c.prompt_chain_steps.name}` : ""}</span>
                <code className="font-mono text-xs">{c.model_name}</code>
                <span className="ml-auto text-xs tabular-nums text-ink-2">
                  {(c.duration_ms / 1000).toFixed(1)} s{c.http_status ? ` · HTTP ${c.http_status}` : ""}
                  {c.prompt_tokens !== null ? ` · ${c.prompt_tokens} in / ${c.output_tokens ?? 0} out tokens` : ""}
                </span>
              </div>
              {c.error && <p className="mt-2 text-sm text-critical">{c.error}</p>}
              <p className="mt-3 text-xs font-medium text-ink-2">Message</p>
              <p className="font-mono text-xs">{c.user_message}</p>
              {c.response_text && (
                <>
                  <p className="mt-3 text-xs font-medium text-ink-2">Response</p>
                  <pre className="mt-1 max-h-72 overflow-auto rounded-lg bg-wash p-3 font-mono text-xs whitespace-pre-wrap">{pretty(c.response_text)}</pre>
                </>
              )}
              <details className="mt-3">
                <summary className="cursor-pointer text-xs text-ink-2">System prompt ({c.system_prompt.length.toLocaleString()} characters)</summary>
                <pre className="mt-2 max-h-96 overflow-auto rounded-lg bg-wash p-3 font-mono text-xs whitespace-pre-wrap text-ink-2">{c.system_prompt}</pre>
              </details>
            </li>
          ))}
          {!calls.length && <p className="text-sm text-muted">No model calls were logged for this request.</p>}
        </ol>
      </section>
    </div>
  );
}

function pretty(text: string) {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}
