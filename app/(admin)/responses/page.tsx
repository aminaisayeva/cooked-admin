import type { Metadata } from "next";
import Link from "next/link";
import { StatTile } from "@/components/charts";
import Pager from "@/components/Pager";
import SearchBar, { Select } from "@/components/SearchBar";
import StatusPill from "@/components/StatusPill";
import { fetchAll, formatDateTime, pageParam, requireAdmin, textParam } from "@/lib/admin";

export const metadata: Metadata = { title: "LLM responses" };

const PER_PAGE = 50;

type Row = {
  id: string;
  request_id: string;
  step_order: number;
  model_name: string;
  response_text: string | null;
  status: string;
  http_status: number | null;
  error: string | null;
  prompt_tokens: number | null;
  output_tokens: number | null;
  duration_ms: number;
  created_at: string;
};

// READ LLM responses: every call to a model, with per-model reliability.
export default async function ResponsesPage({ searchParams }: PageProps<"/responses">) {
  const { supabase } = await requireAdmin();
  const params = await searchParams;
  const status = ["ok", "error"].includes(textParam(params.status)) ? textParam(params.status) : "all";
  const model = textParam(params.model);
  const q = textParam(params.q);
  const page = pageParam(params.page);

  let query = supabase
    .from("llm_responses")
    .select("id, request_id, step_order, model_name, response_text, status, http_status, error, prompt_tokens, output_tokens, duration_ms, created_at", { count: "exact" })
    .order("created_at", { ascending: false })
    .range((page - 1) * PER_PAGE, page * PER_PAGE - 1);
  if (status !== "all") query = query.eq("status", status);
  if (model) query = query.eq("model_name", model);
  if (q) query = query.ilike("response_text", `%${q.replace(/[%_]/g, " ")}%`);

  const [{ data, count, error }, all] = await Promise.all([
    query,
    fetchAll<{ model_name: string; status: string; duration_ms: number; prompt_tokens: number | null; output_tokens: number | null }>((a, b) =>
      supabase.from("llm_responses").select("model_name, status, duration_ms, prompt_tokens, output_tokens").range(a, b),
    ),
  ]);
  const rows = (data ?? []) as Row[];

  // Per model: calls, how many failed, median time and tokens.
  const models = [...new Set(all.map((r) => r.model_name))].sort();
  const perModel = models.map((m) => {
    const rs = all.filter((r) => r.model_name === m);
    const ok = rs.filter((r) => r.status === "ok");
    const times = ok.map((r) => r.duration_ms).sort((a, b) => a - b);
    return {
      model: m,
      calls: rs.length,
      errors: rs.length - ok.length,
      median: times.length ? times[Math.floor(times.length / 2)] : null,
      tokens: ok.reduce((s, r) => s + (r.prompt_tokens ?? 0) + (r.output_tokens ?? 0), 0),
    };
  });
  const errors = all.filter((r) => r.status === "error").length;

  return (
    <div>
      <h1 className="text-2xl font-semibold">LLM responses</h1>
      <p className="mt-1 mb-5 max-w-3xl text-sm text-ink-2">
        Read-only. Every call to a model, including retries and fallbacks after an overloaded model, with the raw answer.
      </p>
      <div className="grid grid-cols-2 gap-3 sm:max-w-md">
        <StatTile label="Calls" value={all.length} />
        <StatTile label="Errors" value={errors} detail={all.length ? `${Math.round((errors / all.length) * 100)}%` : undefined} />
      </div>

      {perModel.length > 0 && (
        <div className="mt-6 overflow-x-auto rounded-xl border border-line bg-surface">
          <table className="w-full text-sm">
            <caption className="px-3 pt-3 text-left text-sm font-semibold">By model</caption>
            <thead className="border-b border-line text-left text-xs text-ink-2">
              <tr>
                <th scope="col" className="px-3 py-2 font-medium">Model</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">Calls</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">Errors</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">Median time</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">Tokens</th>
              </tr>
            </thead>
            <tbody>
              {perModel.map((m) => (
                <tr key={m.model} className="border-b border-line last:border-0">
                  <td className="px-3 py-2"><code className="font-mono text-xs">{m.model}</code></td>
                  <td className="px-3 py-2 text-right tabular-nums">{m.calls}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{m.errors} ({Math.round((m.errors / m.calls) * 100)}%)</td>
                  <td className="px-3 py-2 text-right tabular-nums">{m.median === null ? "—" : `${(m.median / 1000).toFixed(1)} s`}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{m.tokens.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-6">
        <SearchBar placeholder="Search response text" q={q}>
          <Select name="status" value={status} options={[["all", "Any status"], ["ok", "OK"], ["error", "Errors"]]} />
          <Select name="model" value={model} options={[["", "Any model"], ...models.map((m): [string, string] => [m, m])]} />
        </SearchBar>
      </div>

      {error && <p role="alert" className="mt-4 text-sm text-critical">{error.message}</p>}
      <div className="mt-4 overflow-x-auto rounded-xl border border-line bg-surface">
        <table className="w-full text-sm">
          <thead className="border-b border-line text-left text-xs text-ink-2">
            <tr>
              <th scope="col" className="px-3 py-2 font-medium">When</th>
              <th scope="col" className="px-3 py-2 font-medium">Status</th>
              <th scope="col" className="px-3 py-2 font-medium">Model</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">Step</th>
              <th scope="col" className="px-3 py-2 font-medium">Response</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">Tokens</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">Time</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-line align-top last:border-0">
                <td className="whitespace-nowrap px-3 py-2">
                  <Link href={`/requests/${r.request_id}#${r.id}`} className="hover:underline">{formatDateTime(r.created_at)}</Link>
                </td>
                <td className="px-3 py-2"><StatusPill status={r.status} /></td>
                <td className="whitespace-nowrap px-3 py-2"><code className="font-mono text-xs">{r.model_name}</code></td>
                <td className="px-3 py-2 text-right tabular-nums">{r.step_order}</td>
                <td className="max-w-md px-3 py-2">
                  <p className="line-clamp-2 font-mono text-xs text-ink-2">{r.response_text ?? r.error ?? "—"}</p>
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{r.prompt_tokens !== null ? `${r.prompt_tokens} / ${r.output_tokens ?? 0}` : "—"}</td>
                <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{(r.duration_ms / 1000).toFixed(1)} s</td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-muted">No responses logged yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <Pager page={page} pages={Math.ceil((count ?? 0) / PER_PAGE)} params={{ status, model, q }} />
    </div>
  );
}
