import type { Metadata } from "next";
import Link from "next/link";
import { StatTile } from "@/components/charts";
import Pager from "@/components/Pager";
import SearchBar, { Select } from "@/components/SearchBar";
import StatusPill from "@/components/StatusPill";
import { formatDateTime, pageParam, requireAdmin, textParam } from "@/lib/admin";

export const metadata: Metadata = { title: "Generation requests" };

const PER_PAGE = 50;

type Request = {
  id: string;
  user_id: string;
  source: string;
  context: string | null;
  status: string;
  error: string | null;
  caption_count: number | null;
  duration_ms: number | null;
  created_at: string;
  photo_id: string | null;
  prompt_chains: { name: string } | null;
  profiles: { email: string | null } | null;
  llm_responses: { count: number }[];
};

// READ generation requests: one per photo sent to the AI, newest first.
export default async function RequestsPage({ searchParams }: PageProps<"/requests">) {
  const { supabase } = await requireAdmin();
  const params = await searchParams;
  const status = ["running", "succeeded", "failed"].includes(textParam(params.status)) ? textParam(params.status) : "all";
  const source = ["app", "admin"].includes(textParam(params.source)) ? textParam(params.source) : "all";
  const q = textParam(params.q);
  const page = pageParam(params.page);

  let query = supabase
    .from("generation_requests")
    .select("id, user_id, source, context, status, error, caption_count, duration_ms, created_at, photo_id, prompt_chains(name), profiles(email), llm_responses(count)", { count: "exact" })
    .order("created_at", { ascending: false })
    .range((page - 1) * PER_PAGE, page * PER_PAGE - 1);
  if (status !== "all") query = query.eq("status", status);
  if (source !== "all") query = query.eq("source", source);
  if (q) query = query.ilike("context", `%${q.replace(/[%_]/g, " ")}%`);

  const [{ data, count, error }, all, failed] = await Promise.all([
    query,
    supabase.from("generation_requests").select("id", { count: "exact", head: true }),
    supabase.from("generation_requests").select("id", { count: "exact", head: true }).eq("status", "failed"),
  ]);
  const rows = (data ?? []) as unknown as Request[];

  return (
    <div>
      <h1 className="text-2xl font-semibold">Generation requests</h1>
      <p className="mt-1 mb-5 max-w-3xl text-sm text-ink-2">
        Read-only. One row each time a photo is sent to the AI (from the app or from this admin area), with the chain it ran, how it ended and how long it took.
        Open one to see every model call.
      </p>
      <div className="mb-6 grid grid-cols-2 gap-3 sm:max-w-md">
        <StatTile label="Requests" value={all.count ?? 0} />
        <StatTile label="Failed" value={failed.count ?? 0} detail={all.count ? `${Math.round(((failed.count ?? 0) / all.count) * 100)}%` : undefined} />
      </div>

      <SearchBar placeholder="Search uploader context" q={q}>
        <Select name="status" value={status} options={[["all", "Any status"], ["succeeded", "Succeeded"], ["failed", "Failed"], ["running", "Running"]]} />
        <Select name="source" value={source} options={[["all", "App and admin"], ["app", "From the app"], ["admin", "From admin"]]} />
      </SearchBar>

      {error && <p role="alert" className="mt-4 text-sm text-critical">{error.message}</p>}
      <div className="mt-4 overflow-x-auto rounded-xl border border-line bg-surface">
        <table className="w-full text-sm">
          <thead className="border-b border-line text-left text-xs text-ink-2">
            <tr>
              <th scope="col" className="px-3 py-2 font-medium">When</th>
              <th scope="col" className="px-3 py-2 font-medium">Status</th>
              <th scope="col" className="px-3 py-2 font-medium">Chain</th>
              <th scope="col" className="px-3 py-2 font-medium">Who</th>
              <th scope="col" className="px-3 py-2 font-medium">Context</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">Calls</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">Captions</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">Time</th>
              <th scope="col" className="px-3 py-2 font-medium">Photo</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-line align-top last:border-0">
                <td className="whitespace-nowrap px-3 py-2">
                  <Link href={`/requests/${r.id}`} className="hover:underline">{formatDateTime(r.created_at)}</Link>
                </td>
                <td className="px-3 py-2">
                  <StatusPill status={r.status} />
                  {r.error && <p className="mt-1 max-w-56 text-xs text-critical">{r.error}</p>}
                </td>
                <td className="whitespace-nowrap px-3 py-2">{r.prompt_chains?.name ?? <span className="text-muted">built-in</span>}</td>
                <td className="px-3 py-2">
                  <span className="block max-w-48 truncate">{r.profiles?.email ?? r.user_id}</span>
                  <span className="text-xs text-muted">{r.source}</span>
                </td>
                <td className="max-w-56 px-3 py-2 text-ink-2">{r.context ?? <span className="text-muted">—</span>}</td>
                <td className="px-3 py-2 text-right tabular-nums">{r.llm_responses[0]?.count ?? 0}</td>
                <td className="px-3 py-2 text-right tabular-nums">{r.caption_count ?? "—"}</td>
                <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{r.duration_ms ? `${(r.duration_ms / 1000).toFixed(1)} s` : "—"}</td>
                <td className="px-3 py-2">{r.photo_id ? <Link href={`/media/${r.photo_id}`} className="hover:underline">View</Link> : <span className="text-muted">—</span>}</td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={9} className="px-3 py-8 text-center text-muted">No requests yet. They’re logged from the next photo on.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <Pager page={page} pages={Math.ceil((count ?? 0) / PER_PAGE)} params={{ status, source, q }} />
    </div>
  );
}
