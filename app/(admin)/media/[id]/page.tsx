import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { deleteCaption, deletePhoto } from "@/app/actions/media";
import { AddCaptionForm, CaptionForm, ConfirmButton, ContextForm } from "@/components/media/forms";
import { formatDateTime, photoUrl, requireAdmin, STYLE_EMOJI, type Caption, type Photo } from "@/lib/admin";

export const metadata: Metadata = { title: "Post" };

export default async function MediaDetailPage({ params, searchParams }: PageProps<"/media/[id]">) {
  const { supabase } = await requireAdmin();
  const { id } = await params;
  const { created } = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const { data } = await supabase
    .from("photos")
    .select("id, author_id, author_name, image_path, prompt, system_prompt, model, score, created_at, captions(id, photo_id, style, text, position, upvotes, downvotes, score, created_at)")
    .eq("id", id)
    .maybeSingle();
  if (!data) notFound();
  const post = data as Photo & { captions: Caption[] };
  const captions = [...post.captions].sort((a, b) => a.position - b.position);
  const { data: author } = await supabase.from("cooked_profiles").select("username").eq("user_id", post.author_id).maybeSingle();
  const { count: votes } = await supabase
    .from("caption_votes")
    .select("caption_id", { count: "exact", head: true })
    .in("caption_id", captions.length ? captions.map((c) => c.id) : ["00000000-0000-0000-0000-000000000000"]);

  return (
    <div>
      <Link href="/media" className="text-sm text-ink-2 hover:text-ink">← All media</Link>
      {created && <p className="mt-3 rounded-lg bg-wash px-3 py-2 text-sm">Post created. It’s live in the cooked.ai feed.</p>}

      <div className="mt-4 grid gap-8 lg:grid-cols-[minmax(0,420px)_1fr]">
        <div className="space-y-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={photoUrl(post.image_path)} alt={post.prompt ?? "Uploaded photo"} className="w-full rounded-xl border border-line" />
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 rounded-xl border border-line bg-surface p-4 text-sm">
            <dt className="text-ink-2">Uploader</dt>
            <dd>
              {post.author_name ?? "Unknown"} {author && <span className="text-muted">@{author.username}</span>}
            </dd>
            <dt className="text-ink-2">Posted</dt>
            <dd>{formatDateTime(post.created_at)}</dd>
            <dt className="text-ink-2">Model</dt>
            <dd><code className="font-mono text-xs">{post.model}</code></dd>
            <dt className="text-ink-2">Score</dt>
            <dd className="tabular-nums">{post.score} from {votes ?? 0} vote{votes === 1 ? "" : "s"}</dd>
            <dt className="text-ink-2">File</dt>
            <dd className="truncate font-mono text-xs">{post.image_path}</dd>
          </dl>
          <details className="rounded-xl border border-line bg-surface p-4 text-sm">
            <summary className="cursor-pointer text-ink-2">System prompt sent to the model</summary>
            <pre className="mt-3 text-xs whitespace-pre-wrap text-ink-2">{post.system_prompt}</pre>
          </details>
          <form action={deletePhoto}>
            <input type="hidden" name="id" value={post.id} />
            <ConfirmButton
              message="Delete this post, its captions and all their votes? This can't be undone."
              className="w-full rounded-lg border border-critical px-4 py-2 text-sm font-medium text-critical hover:bg-wash"
            >
              Delete post
            </ConfirmButton>
          </form>
        </div>

        <div className="space-y-6">
          <section className="rounded-xl border border-line bg-surface p-4">
            <ContextForm id={post.id} prompt={post.prompt} />
          </section>

          <section>
            <h2 className="mb-3 text-sm font-semibold">Captions ({captions.length})</h2>
            <ul className="space-y-3">
              {captions.map((c) => (
                <li key={c.id} className="rounded-xl border border-line bg-surface p-4">
                  <div className="mb-3 flex items-center justify-between gap-3 text-xs text-muted">
                    <span>
                      {STYLE_EMOJI[c.style] ?? "💬"} ▲ {c.upvotes} ▼ {c.downvotes} · score {c.score}
                    </span>
                    <form action={deleteCaption}>
                      <input type="hidden" name="id" value={c.id} />
                      <ConfirmButton message="Delete this caption and its votes?" className="text-critical hover:underline">
                        Delete
                      </ConfirmButton>
                    </form>
                  </div>
                  <CaptionForm caption={c} />
                </li>
              ))}
            </ul>
          </section>

          <section className="rounded-xl border border-line bg-surface p-4">
            <h2 className="mb-3 text-sm font-semibold">Add a caption</h2>
            <AddCaptionForm photoId={post.id} />
          </section>
        </div>
      </div>
    </div>
  );
}
