import type { Metadata } from "next";
import Link from "next/link";
import Pager from "@/components/Pager";
import SearchBar, { Select } from "@/components/SearchBar";
import {
  avatarUrl,
  fetchAll,
  formatDate,
  fullName,
  pageParam,
  requireAdmin,
  textParam,
  type CookedProfile,
  type Profile,
} from "@/lib/admin";

export const metadata: Metadata = { title: "Users" };

const PER_PAGE = 50;
const SORTS: [string, string][] = [
  ["new", "Newest first"],
  ["old", "Oldest first"],
  ["posts", "Most pics"],
  ["votes", "Most votes cast"],
  ["score", "Highest score"],
];

export default async function UsersPage({ searchParams }: PageProps<"/users">) {
  const { supabase } = await requireAdmin();
  const params = await searchParams;
  const q = textParam(params.q).toLowerCase();
  const sort = SORTS.some(([v]) => v === textParam(params.sort)) ? textParam(params.sort) : "new";
  const page = pageParam(params.page);

  const [profiles, cooked, photos, votes] = await Promise.all([
    fetchAll<Profile>((a, b) => supabase.from("profiles").select("id, email, first_name, last_name, is_superadmin, created_at").order("id").range(a, b)),
    fetchAll<CookedProfile>((a, b) => supabase.from("cooked_profiles").select("user_id, username, display_name, avatar_path").order("user_id").range(a, b)),
    fetchAll<{ author_id: string; score: number }>((a, b) => supabase.from("photos").select("author_id, score").order("id").range(a, b)),
    fetchAll<{ user_id: string }>((a, b) => supabase.from("caption_votes").select("user_id").order("caption_id").order("user_id").range(a, b)),
  ]);

  const cookedById = new Map(cooked.map((c) => [c.user_id, c]));
  const count = <T,>(rows: T[], key: (r: T) => string, add: (r: T) => number = () => 1) =>
    rows.reduce((m, r) => m.set(key(r), (m.get(key(r)) ?? 0) + add(r)), new Map<string, number>());
  const posts = count(photos, (p) => p.author_id);
  const score = count(photos, (p) => p.author_id, (p) => p.score);
  const cast = count(votes, (v) => v.user_id);

  const rows = profiles
    .map((p) => ({ ...p, cooked: cookedById.get(p.id), posts: posts.get(p.id) ?? 0, score: score.get(p.id) ?? 0, votes: cast.get(p.id) ?? 0 }))
    .filter(
      (u) =>
        !q ||
        [u.email, fullName(u), u.cooked?.username, u.cooked?.display_name, u.id].some((f) => f?.toLowerCase().includes(q)),
    )
    .sort((a, b) => {
      if (sort === "old") return a.created_at.localeCompare(b.created_at);
      if (sort === "posts") return b.posts - a.posts;
      if (sort === "votes") return b.votes - a.votes;
      if (sort === "score") return b.score - a.score;
      return b.created_at.localeCompare(a.created_at);
    });
  const pages = Math.max(1, Math.ceil(rows.length / PER_PAGE));
  const shown = rows.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  return (
    <div>
      <h1 className="text-2xl font-semibold">Users</h1>
      <p className="mt-1 mb-5 text-sm text-ink-2">
        {rows.length} of {profiles.length} accounts. Read-only: people edit their own profiles in cooked.ai.
      </p>
      <SearchBar placeholder="Search name, email, @username…" q={textParam(params.q)}>
        <Select name="sort" value={sort} options={SORTS} />
      </SearchBar>

      <div className="mt-5 overflow-x-auto rounded-xl border border-line bg-surface">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="border-b border-line text-xs text-ink-2">
            <tr>
              <th className="px-4 py-2.5 font-medium">Person</th>
              <th className="px-4 py-2.5 font-medium">Email</th>
              <th className="px-4 py-2.5 font-medium">Joined</th>
              <th className="px-4 py-2.5 text-right font-medium">Pics</th>
              <th className="px-4 py-2.5 text-right font-medium">Score</th>
              <th className="px-4 py-2.5 text-right font-medium">Votes cast</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {shown.map((u) => {
              const avatar = avatarUrl(u.cooked?.avatar_path ?? null);
              return (
                <tr key={u.id} className="hover:bg-wash">
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-3">
                      {avatar ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={avatar} alt="" className="size-8 rounded-full object-cover" />
                      ) : (
                        <span className="grid size-8 place-items-center rounded-full bg-wash text-xs text-ink-2">
                          {(u.cooked?.display_name ?? fullName(u) ?? u.email ?? "?").slice(0, 1).toUpperCase()}
                        </span>
                      )}
                      <div className="min-w-0">
                        <p className="truncate text-ink">
                          {u.cooked?.display_name ?? (fullName(u) || <span className="text-muted">No name yet</span>)}
                          {u.is_superadmin && (
                            <span className="ml-2 rounded bg-accent px-1.5 py-0.5 text-[10px] font-semibold text-on-accent">ADMIN</span>
                          )}
                        </p>
                        <p className="truncate text-xs text-muted">
                          {u.cooked ? `@${u.cooked.username}` : "no @username"}
                          {u.cooked && fullName(u) && fullName(u) !== u.cooked.display_name ? ` · ${fullName(u)}` : ""}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-ink-2">{u.email}</td>
                  <td className="px-4 py-2.5 whitespace-nowrap text-ink-2">{formatDate(u.created_at)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    {u.posts ? (
                      <Link href={`/media?author=${u.id}`} className="underline decoration-line underline-offset-2 hover:decoration-ink">
                        {u.posts}
                      </Link>
                    ) : (
                      0
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{u.score}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    {u.votes ? (
                      <Link href={`/votes?voter=${u.id}`} className="underline decoration-line underline-offset-2 hover:decoration-ink">
                        {u.votes}
                      </Link>
                    ) : (
                      0
                    )}
                  </td>
                </tr>
              );
            })}
            {!shown.length && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-muted">
                  Nobody matches that search.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <Pager page={page} pages={pages} params={{ q: textParam(params.q), sort }} />
    </div>
  );
}
