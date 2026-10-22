import type { Metadata } from "next";
import Link from "next/link";
import Pager from "@/components/Pager";
import SearchBar, { Select } from "@/components/SearchBar";
import { formatDateTime, pageParam, photoUrl, requireAdmin, STYLE_EMOJI, textParam, type Caption, type Photo } from "@/lib/admin";

export const metadata: Metadata = { title: "Media" };

const PER_PAGE = 24;
const SORTS: [string, string][] = [
  ["new", "Newest first"],
  ["old", "Oldest first"],
  ["top", "Highest score"],
  ["burnt", "Lowest score"],
];

export default async function MediaPage({ searchParams }: PageProps<"/media">) {
  const { supabase } = await requireAdmin();
  const params = await searchParams;
  const q = textParam(params.q);
  const author = textParam(params.author);
  const sort = SORTS.some(([v]) => v === textParam(params.sort)) ? textParam(params.sort) : "new";
  const page = pageParam(params.page);

  let query = supabase
    .from("photos")
    .select("id, author_id, author_name, image_path, prompt, model, score, created_at, captions(id, style, text, position, upvotes, downvotes, score)", {
      count: "exact",
    });
  // Characters that would break PostgREST's or() syntax are dropped.
  const safe = q.replace(/[,()%*\\]/g, " ").trim();
  if (safe) query = query.or(`prompt.ilike.*${safe}*,author_name.ilike.*${safe}*,model.ilike.*${safe}*`);
  if (/^[0-9a-f-]{36}$/i.test(author)) query = query.eq("author_id", author);
  if (sort === "top") query = query.order("score", { ascending: false });
  if (sort === "burnt") query = query.order("score", { ascending: true });
  query = query.order("created_at", { ascending: sort === "old" });

  const { data, count, error } = await query.range((page - 1) * PER_PAGE, page * PER_PAGE - 1);
  const posts = (data ?? []) as (Photo & { captions: Caption[] })[];
  const pages = Math.max(1, Math.ceil((count ?? 0) / PER_PAGE));

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">AI-generated media</h1>
          <p className="mt-1 text-sm text-ink-2">
            {count ?? 0} posts. Each is a photo plus the captions Gemini wrote for it.
            {author && (
              <>
                {" "}
                Showing one uploader · <Link href="/media" className="underline">show everyone</Link>
              </>
            )}
          </p>
        </div>
        <Link href="/media/new" className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-on-accent hover:opacity-90">
          + New post
        </Link>
      </div>

      {params.deleted && <p className="mt-4 rounded-lg bg-wash px-3 py-2 text-sm">Post deleted.</p>}

      <div className="mt-5">
        <SearchBar placeholder="Search context, author, model…" q={q}>
          {author && <input type="hidden" name="author" value={author} />}
          <Select name="sort" value={sort} options={SORTS} />
        </SearchBar>
      </div>

      {error && <p className="mt-4 text-sm text-critical">{error.message}</p>}

      <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {posts.map((p) => {
          const captions = [...p.captions].sort((a, b) => a.position - b.position);
          const top = [...captions].sort((a, b) => b.score - a.score)[0];
          return (
            <Link key={p.id} href={`/media/${p.id}`} className="overflow-hidden rounded-xl border border-line bg-surface transition hover:border-axis">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photoUrl(p.image_path)} alt={p.prompt ?? "Uploaded photo"} className="aspect-[4/3] w-full object-cover" loading="lazy" />
              <div className="space-y-1.5 p-3">
                <div className="flex items-center justify-between gap-2 text-xs text-muted">
                  <span className="truncate">{p.author_name ?? "Unknown"} · {formatDateTime(p.created_at)}</span>
                  <span className="shrink-0 font-medium text-ink tabular-nums">{p.score >= 0 ? `+${p.score}` : p.score}</span>
                </div>
                {top ? (
                  <p className="line-clamp-2 text-sm text-ink">
                    {STYLE_EMOJI[top.style] ?? "💬"} {top.text}
                  </p>
                ) : (
                  <p className="text-sm text-muted">No captions</p>
                )}
                <p className="text-xs text-muted">
                  {captions.length} caption{captions.length === 1 ? "" : "s"} · <code className="font-mono">{p.model}</code>
                </p>
              </div>
            </Link>
          );
        })}
      </div>
      {!posts.length && !error && <p className="mt-10 text-center text-sm text-muted">No posts match.</p>}
      <Pager page={page} pages={pages} params={{ q, sort, ...(author ? { author } : {}) }} />
    </div>
  );
}
