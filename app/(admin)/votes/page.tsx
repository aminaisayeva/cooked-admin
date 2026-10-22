import type { Metadata } from "next";
import Link from "next/link";
import { StatTile } from "@/components/charts";
import Pager from "@/components/Pager";
import { Select } from "@/components/SearchBar";
import {
  fetchAll,
  formatDateTime,
  fullName,
  pageParam,
  photoUrl,
  requireAdmin,
  STYLE_EMOJI,
  textParam,
  type Caption,
} from "@/lib/admin";

export const metadata: Metadata = { title: "Votes" };

const PER_PAGE = 50;

type VoteRow = {
  caption_id: string;
  user_id: string;
  value: number;
  created_at: string;
  updated_at: string;
  captions: { text: string; style: string; photo_id: string; photos: { image_path: string } | null } | null;
};

export default async function VotesPage({ searchParams }: PageProps<"/votes">) {
  const { supabase } = await requireAdmin();
  const params = await searchParams;
  const view = textParam(params.view) === "captions" ? "captions" : "votes";
  const value = ["up", "down"].includes(textParam(params.value)) ? textParam(params.value) : "all";
  const voter = /^[0-9a-f-]{36}$/i.test(textParam(params.voter)) ? textParam(params.voter) : "";
  const page = pageParam(params.page);

  const [{ count: total }, { count: ups }, { count: downs }] = await Promise.all([
    supabase.from("caption_votes").select("caption_id", { count: "exact", head: true }),
    supabase.from("caption_votes").select("caption_id", { count: "exact", head: true }).eq("value", 1),
    supabase.from("caption_votes").select("caption_id", { count: "exact", head: true }).eq("value", -1),
  ]);

  const tab = (v: string, label: string) => (
    <Link
      href={v === "votes" ? "/votes" : `/votes?view=${v}`}
      className={`rounded-md px-3 py-1.5 text-sm ${view === v ? "bg-wash font-medium text-ink" : "text-ink-2 hover:bg-wash"}`}
    >
      {label}
    </Link>
  );

  return (
    <div>
      <h1 className="text-2xl font-semibold">Votes</h1>
      <p className="mt-1 mb-5 text-sm text-ink-2">Read-only. Votes are private in cooked.ai; only superadmins can see who voted what.</p>

      <div className="grid grid-cols-3 gap-3 sm:max-w-xl">
        <StatTile label="All votes" value={total ?? 0} />
        <StatTile label="Upvotes ▲" value={ups ?? 0} detail={total ? `${Math.round(((ups ?? 0) / total) * 100)}%` : undefined} />
        <StatTile label="Downvotes ▼" value={downs ?? 0} detail={total ? `${Math.round(((downs ?? 0) / total) * 100)}%` : undefined} />
      </div>

      <div className="mt-6 mb-4 flex gap-1">
        {tab("votes", "Every vote")}
        {tab("captions", "Ratings per caption")}
      </div>

      {view === "votes" ? (
        <VoteList supabase={supabase} value={value} voter={voter} page={page} />
      ) : (
        <CaptionRatings supabase={supabase} page={page} />
      )}
    </div>
  );
}

async function voterNames(supabase: Awaited<ReturnType<typeof requireAdmin>>["supabase"], ids: string[]) {
  if (!ids.length) return new Map<string, { name: string; username: string | null }>();
  const [{ data: profiles }, { data: cooked }] = await Promise.all([
    supabase.from("profiles").select("id, email, first_name, last_name").in("id", ids),
    supabase.from("cooked_profiles").select("user_id, username, display_name").in("user_id", ids),
  ]);
  return new Map(
    ids.map((id) => {
      const p = profiles?.find((r) => r.id === id);
      const c = cooked?.find((r) => r.user_id === id);
      return [id, { name: c?.display_name ?? (fullName(p) || p?.email || "Unknown"), username: c?.username ?? null }];
    }),
  );
}

async function VoteList({
  supabase,
  value,
  voter,
  page,
}: {
  supabase: Awaited<ReturnType<typeof requireAdmin>>["supabase"];
  value: string;
  voter: string;
  page: number;
}) {
  let query = supabase
    .from("caption_votes")
    .select("caption_id, user_id, value, created_at, updated_at, captions(text, style, photo_id, photos(image_path))", { count: "exact" });
  if (value !== "all") query = query.eq("value", value === "up" ? 1 : -1);
  if (voter) query = query.eq("user_id", voter);
  const { data, count, error } = await query.order("created_at", { ascending: false }).range((page - 1) * PER_PAGE, page * PER_PAGE - 1);
  const votes = (data ?? []) as unknown as VoteRow[];
  const names = await voterNames(supabase, [...new Set(votes.map((v) => v.user_id))]);
  const pages = Math.max(1, Math.ceil((count ?? 0) / PER_PAGE));

  return (
    <>
      <form className="flex flex-wrap items-center gap-2">
        {voter && <input type="hidden" name="voter" value={voter} />}
        <Select
          name="value"
          value={value}
          options={[
            ["all", "Up and down"],
            ["up", "Upvotes only"],
            ["down", "Downvotes only"],
          ]}
        />
        <button className="rounded-lg border border-line bg-surface px-3 py-2 text-sm hover:bg-wash">Apply</button>
        {voter && (
          <span className="text-sm text-ink-2">
            Votes by {names.get(voter)?.name ?? "one person"} · <Link href="/votes" className="underline">everyone</Link>
          </span>
        )}
      </form>
      {error && <p className="mt-4 text-sm text-critical">{error.message}</p>}

      <div className="mt-4 overflow-x-auto rounded-xl border border-line bg-surface">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="border-b border-line text-xs text-ink-2">
            <tr>
              <th className="px-4 py-2.5 font-medium">Vote</th>
              <th className="px-4 py-2.5 font-medium">Voter</th>
              <th className="px-4 py-2.5 font-medium">Caption</th>
              <th className="px-4 py-2.5 font-medium">When</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {votes.map((v) => {
              const who = names.get(v.user_id);
              return (
                <tr key={`${v.caption_id}-${v.user_id}`} className="hover:bg-wash">
                  <td className="px-4 py-2.5 font-medium whitespace-nowrap">
                    {v.value === 1 ? <span className="text-good">▲ Up</span> : <span className="text-critical">▼ Down</span>}
                  </td>
                  <td className="px-4 py-2.5">
                    <Link href={`/votes?voter=${v.user_id}`} className="hover:underline">
                      {who?.name}
                    </Link>
                    {who?.username && <span className="block text-xs text-muted">@{who.username}</span>}
                  </td>
                  <td className="px-4 py-2.5">
                    {v.captions ? (
                      <Link href={`/media/${v.captions.photo_id}`} className="flex items-center gap-3 hover:underline">
                        {v.captions.photos && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={photoUrl(v.captions.photos.image_path)} alt="" className="size-9 shrink-0 rounded object-cover" />
                        )}
                        <span className="line-clamp-2">
                          {STYLE_EMOJI[v.captions.style] ?? "💬"} {v.captions.text}
                        </span>
                      </Link>
                    ) : (
                      <span className="text-muted">Deleted caption</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 whitespace-nowrap text-ink-2">
                    {formatDateTime(v.created_at)}
                    {v.updated_at !== v.created_at && <span className="block text-xs text-muted">changed {formatDateTime(v.updated_at)}</span>}
                  </td>
                </tr>
              );
            })}
            {!votes.length && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-muted">No votes match.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <Pager page={page} pages={pages} params={{ value, ...(voter ? { voter } : {}) }} />
    </>
  );
}

async function CaptionRatings({ supabase, page }: { supabase: Awaited<ReturnType<typeof requireAdmin>>["supabase"]; page: number }) {
  const captions = await fetchAll<Caption & { photos: { image_path: string } | null }>((a, b) =>
    supabase
      .from("captions")
      .select("id, photo_id, style, text, position, upvotes, downvotes, score, created_at, photos(image_path)")
      .order("id")
      .range(a, b),
  );
  const sorted = captions
    .filter((c) => c.upvotes + c.downvotes > 0)
    .sort((a, b) => b.upvotes + b.downvotes - (a.upvotes + a.downvotes) || b.score - a.score);
  const pages = Math.max(1, Math.ceil(sorted.length / PER_PAGE));
  const shown = sorted.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  return (
    <>
      <p className="text-sm text-ink-2">{sorted.length} captions have at least one vote, most-voted first.</p>
      <div className="mt-4 overflow-x-auto rounded-xl border border-line bg-surface">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="border-b border-line text-xs text-ink-2">
            <tr>
              <th className="px-4 py-2.5 font-medium">Caption</th>
              <th className="px-4 py-2.5 text-right font-medium">▲</th>
              <th className="px-4 py-2.5 text-right font-medium">▼</th>
              <th className="px-4 py-2.5 text-right font-medium">Score</th>
              <th className="px-4 py-2.5 font-medium">Up share</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {shown.map((c) => {
              const share = c.upvotes / (c.upvotes + c.downvotes);
              return (
                <tr key={c.id} className="hover:bg-wash">
                  <td className="px-4 py-2.5">
                    <Link href={`/media/${c.photo_id}`} className="flex items-center gap-3 hover:underline">
                      {c.photos && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={photoUrl(c.photos.image_path)} alt="" className="size-9 shrink-0 rounded object-cover" />
                      )}
                      <span className="line-clamp-2">
                        {STYLE_EMOJI[c.style] ?? "💬"} {c.text}
                      </span>
                    </Link>
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{c.upvotes}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{c.downvotes}</td>
                  <td className="px-4 py-2.5 text-right font-medium tabular-nums">{c.score}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <div className="flex h-2 w-24 overflow-hidden rounded-[3px] bg-wash" title={`${Math.round(share * 100)}% upvotes`}>
                        <div style={{ width: `${share * 100}%`, background: "var(--series-1)" }} />
                      </div>
                      <span className="text-xs text-ink-2 tabular-nums">{Math.round(share * 100)}%</span>
                    </div>
                  </td>
                </tr>
              );
            })}
            {!shown.length && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-muted">No votes yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <Pager page={page} pages={pages} params={{ view: "captions" }} />
    </>
  );
}
