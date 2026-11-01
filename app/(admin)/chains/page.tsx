import type { Metadata } from "next";
import Link from "next/link";
import MixForm from "@/components/MixForm";
import { fetchAll, requireAdmin } from "@/lib/admin";

export const metadata: Metadata = { title: "Prompt chains" };

type Chain = {
  id: string;
  name: string;
  description: string;
  is_active: boolean;
  prompt_chain_mix: { weight: number } | null;
  prompt_chain_steps: { id: string }[];
};

const pct = (n: number) => `${Math.round(n * 100)}%`;

// READ prompt chains, READ/UPDATE the mix, and how each chain performs.
export default async function ChainsPage() {
  const { supabase } = await requireAdmin();
  const [{ data, error }, photos, requests] = await Promise.all([
    supabase.from("prompt_chains").select("id, name, description, is_active, prompt_chain_mix(weight), prompt_chain_steps(id)").order("created_at"),
    fetchAll<{ chain_id: string | null; score: number }>((a, b) => supabase.from("photos").select("chain_id, score").range(a, b)),
    fetchAll<{ chain_id: string | null; status: string; duration_ms: number | null }>((a, b) =>
      supabase.from("generation_requests").select("chain_id, status, duration_ms").range(a, b),
    ),
  ]);
  if (error) return <p role="alert" className="text-critical">Couldn’t load chains: {error.message}</p>;
  const chains = (data ?? []) as unknown as Chain[];

  const stats = (id: string | null) => {
    const ps = photos.filter((p) => p.chain_id === id);
    const rs = requests.filter((r) => r.chain_id === id);
    const done = rs.filter((r) => r.status !== "running");
    const ok = done.filter((r) => r.status === "succeeded");
    const durations = ok.map((r) => r.duration_ms ?? 0).sort((a, b) => a - b);
    return {
      photos: ps.length,
      avgScore: ps.length ? ps.reduce((s, p) => s + p.score, 0) / ps.length : null,
      requests: rs.length,
      success: done.length ? ok.length / done.length : null,
      median: durations.length ? durations[Math.floor(durations.length / 2)] : null,
    };
  };
  const legacy = stats(null);

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-2xl font-semibold">Prompt chains</h1>
        <p className="mt-1 max-w-3xl text-sm text-ink-2">
          A chain is a way of writing a photo’s captions: ordered steps, each a call to the model, the last one returning one caption per voice. Every new photo
          picks one active chain at random, weighted by the mix. Chains and steps are defined in the database (<code className="font-mono text-xs">supabase/pipeline.sql</code>).
        </p>
      </div>

      <section className="rounded-xl border border-line bg-surface p-4">
        <h2 className="text-sm font-semibold">Prompt chain mix</h2>
        <p className="mb-4 mt-1 text-sm text-ink-2">How often each chain is picked for a new photo. A weight of 0 switches a chain off.</p>
        <MixForm chains={chains.map((c) => ({ id: c.id, name: c.name, weight: c.prompt_chain_mix?.weight ?? 0, active: c.is_active }))} />
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold">Chains and how they do</h2>
        <div className="overflow-x-auto rounded-xl border border-line bg-surface">
          <table className="w-full text-sm">
            <thead className="border-b border-line text-left text-xs text-ink-2">
              <tr>
                <th scope="col" className="px-3 py-2 font-medium">Chain</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">Steps</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">Weight</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">Photos</th>
                <th scope="col" className="px-3 py-2 text-right font-medium" title="Average net caption votes per photo">Avg score / photo</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">Requests</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">Succeeded</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">Median time</th>
              </tr>
            </thead>
            <tbody>
              {chains.map((c) => {
                const s = stats(c.id);
                return (
                  <tr key={c.id} className="border-b border-line last:border-0">
                    <td className="px-3 py-2">
                      <Link href={`/chains/${c.id}`} className="font-medium hover:underline">{c.name}</Link>
                      {!c.is_active && <span className="ml-2 text-xs text-muted">inactive</span>}
                      <p className="text-xs text-muted">{c.description}</p>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{c.prompt_chain_steps.length}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{c.prompt_chain_mix?.weight ?? 0}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{s.photos}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{s.avgScore === null ? "—" : s.avgScore.toFixed(2)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{s.requests}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{s.success === null ? "—" : pct(s.success)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{s.median === null ? "—" : `${(s.median / 1000).toFixed(1)} s`}</td>
                  </tr>
                );
              })}
              <tr className="text-ink-2">
                <td className="px-3 py-2">
                  Single built-in prompt
                  <p className="text-xs text-muted">Photos posted before chains existed, or when the chain tables couldn’t be read.</p>
                </td>
                <td className="px-3 py-2 text-right tabular-nums">1</td>
                <td className="px-3 py-2 text-right">—</td>
                <td className="px-3 py-2 text-right tabular-nums">{legacy.photos}</td>
                <td className="px-3 py-2 text-right tabular-nums">{legacy.avgScore === null ? "—" : legacy.avgScore.toFixed(2)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{legacy.requests}</td>
                <td className="px-3 py-2 text-right tabular-nums">{legacy.success === null ? "—" : pct(legacy.success)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{legacy.median === null ? "—" : `${(legacy.median / 1000).toFixed(1)} s`}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
