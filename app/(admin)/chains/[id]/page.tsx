import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import StatusPill from "@/components/StatusPill";
import { formatDateTime, requireAdmin } from "@/lib/admin";

export const metadata: Metadata = { title: "Prompt chain" };

type Step = {
  id: string;
  step_order: number;
  name: string;
  instructions: string;
  include_image: boolean;
  updated_at: string;
  llm_models: { name: string; api_model_id: string } | null;
};

// READ one prompt chain and its steps (prompt chain steps), with recent runs.
export default async function ChainPage({ params }: PageProps<"/chains/[id]">) {
  const { supabase } = await requireAdmin();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [{ data: chain }, { data: steps }, { data: runs }] = await Promise.all([
    supabase.from("prompt_chains").select("id, name, description, is_active, created_at, prompt_chain_mix(weight)").eq("id", id).maybeSingle(),
    supabase
      .from("prompt_chain_steps")
      .select("id, step_order, name, instructions, include_image, updated_at, llm_models(name, api_model_id)")
      .eq("chain_id", id)
      .order("step_order"),
    supabase.from("generation_requests").select("id, status, duration_ms, created_at, photo_id").eq("chain_id", id).order("created_at", { ascending: false }).limit(10),
  ]);
  if (!chain) notFound();
  const mix = chain.prompt_chain_mix as unknown as { weight: number } | null;

  return (
    <div className="space-y-8">
      <div>
        <Link href="/chains" className="text-sm text-ink-2 hover:text-ink">← All chains</Link>
        <h1 className="mt-3 text-2xl font-semibold">{chain.name}</h1>
        <p className="mt-1 text-sm text-ink-2">{chain.description}</p>
        <p className="mt-2 text-xs text-muted">
          {chain.is_active ? "Active" : "Inactive"} · mix weight {mix?.weight ?? 0} · created {formatDateTime(chain.created_at)}
        </p>
      </div>

      <section>
        <h2 className="mb-3 text-sm font-semibold">Steps ({steps?.length ?? 0})</h2>
        <ol className="space-y-4">
          {((steps ?? []) as unknown as Step[]).map((s, i, all) => (
            <li key={s.id} className="rounded-xl border border-line bg-surface p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="font-medium">
                  {s.step_order}. {s.name}
                </h3>
                <p className="text-xs text-muted">
                  {s.include_image ? "sees the photo" : "text only"} · {s.llm_models ? `pinned to ${s.llm_models.name}` : "default model order"} ·{" "}
                  {i === all.length - 1 ? "returns the captions" : "returns notes for the next step"}
                </p>
              </div>
              <pre className="mt-3 max-h-96 overflow-auto rounded-lg bg-wash p-3 font-mono text-xs whitespace-pre-wrap text-ink-2">{s.instructions}</pre>
              <p className="mt-2 text-xs text-muted">
                Placeholders filled in at run time: {"{{voices}} {{standings}} {{terms}} {{examples}} {{previous}}"} · updated {formatDateTime(s.updated_at)}
              </p>
            </li>
          ))}
        </ol>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold">Recent runs</h2>
        {runs?.length ? (
          <ul className="divide-y divide-line rounded-xl border border-line bg-surface text-sm">
            {runs.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-3 px-3 py-2">
                <StatusPill status={r.status} />
                <Link href={`/requests/${r.id}`} className="hover:underline">{formatDateTime(r.created_at)}</Link>
                <span className="ml-auto tabular-nums text-ink-2">{r.duration_ms ? `${(r.duration_ms / 1000).toFixed(1)} s` : "—"}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">This chain hasn’t run yet.</p>
        )}
      </section>
    </div>
  );
}
