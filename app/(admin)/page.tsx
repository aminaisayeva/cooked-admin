import Link from "next/link";
import { BarList, Card, ColumnChart, Heatmap, StatTile } from "@/components/charts";
import { photoUrl, requireAdmin, STYLE_EMOJI } from "@/lib/admin";
import { DAYS, loadStats, VOICES, WEEKDAYS, type Person, type Standout } from "@/lib/stats";

const VOICE_COLOR = ["var(--series-1)", "var(--series-2)", "var(--series-3)", "var(--series-4)"];
const pct = (n: number | null) => (n === null ? "–" : `${Math.round(n * 100)}%`);

export default async function StatsPage() {
  const { supabase } = await requireAdmin();
  const s = await loadStats(supabase);
  const favourite = [...s.voices].sort((a, b) => b.wins - a.wins)[0];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Who’s cooking?</h1>
        <p className="mt-1 text-sm text-ink-2">
          Live from the cooked.ai database.{" "}
          {favourite?.wins ? (
            <>
              Right now <b className="text-ink">{favourite.style}</b> {STYLE_EMOJI[favourite.style]} wins the most pics.
            </>
          ) : (
            "No voice has won a pic yet."
          )}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <StatTile label="Accounts" value={s.totals.profiles} detail={`${s.totals.admins} superadmin${s.totals.admins === 1 ? "" : "s"}`} />
        <StatTile label="@usernames" value={s.totals.cooked} detail={pct(s.totals.profiles ? s.totals.cooked / s.totals.profiles : null) + " of accounts"} />
        <StatTile label="Pics posted" value={s.totals.photos} detail={`${s.totals.withContext} with context`} />
        <StatTile label="AI captions" value={s.totals.captions} />
        <StatTile label="Votes cast" value={s.totals.votes} detail={`${s.totals.votesPerPhoto.toFixed(1)} per pic`} />
        <StatTile label="Vibe check" value={pct(s.totals.upShare)} detail="of votes are upvotes" />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card
          title="Which voice cooks hardest?"
          note={`Share of the ${s.decided} pics with a clear winner (the one caption with the top score).`}
        >
          <BarList
            max={1}
            rows={s.voices.map((v, i) => ({
              key: v.style,
              label: `${STYLE_EMOJI[v.style] ?? "💬"} ${v.style}`,
              value: v.winShare,
              display: `${pct(v.winShare)} · ${v.wins} win${v.wins === 1 ? "" : "s"}`,
              color: VOICE_COLOR[VOICES.indexOf(v.style)] ?? VOICE_COLOR[i % 4],
              tip: `${v.captions} captions · avg score ${v.avgScore.toFixed(2)} · ${pct(v.upShare)} upvoted`,
            }))}
          />
        </Card>

        <Card title="Average caption score by voice" note="Upvotes minus downvotes, averaged over every caption in that voice.">
          <BarList
            rows={s.voices.map((v, i) => ({
              key: v.style,
              label: `${STYLE_EMOJI[v.style] ?? "💬"} ${v.style}`,
              value: Math.max(0, v.avgScore),
              display: `${v.avgScore >= 0 ? "+" : ""}${v.avgScore.toFixed(2)}`,
              color: VOICE_COLOR[VOICES.indexOf(v.style)] ?? VOICE_COLOR[i % 4],
              tip: `${pct(v.upShare)} of its votes are upvotes`,
            }))}
          />
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Pics posted per day" note={`Last ${DAYS} days, New York time`}>
          <ColumnChart data={s.days.map((d) => ({ label: d.label, value: d.posts }))} color="var(--series-2)" unit="pics" />
        </Card>
        <Card title="Votes cast per day" note={`Last ${DAYS} days, New York time`}>
          <ColumnChart data={s.days.map((d) => ({ label: d.label, value: d.votes }))} color="var(--series-1)" unit="votes" />
        </Card>
        <Card title="New accounts per day" note={`Last ${DAYS} days, New York time`}>
          <ColumnChart data={s.days.map((d) => ({ label: d.label, value: d.signups }))} color="var(--series-3)" unit="sign-ups" />
        </Card>
      </div>

      <Card title="When does campus cook?" note="Posts and votes by weekday and hour, all time, New York time. Hover a cell.">
        <Heatmap rows={WEEKDAYS} grid={s.heat} unit="posts + votes" />
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="From sign-up to cooking" note="How far each account has gone. Each bar is a share of everyone who signed up.">
          <BarList
            max={Math.max(1, s.funnel[0].value)}
            rows={s.funnel.map((f) => ({
              key: f.label,
              label: f.label,
              value: f.value,
              display: `${f.value} · ${pct(s.funnel[0].value ? f.value / s.funnel[0].value : null)}`,
              color: "var(--seq-5)",
            }))}
          />
        </Card>

        <Card title="Which Gemini model answered" note="The app falls back to other models when the first is busy.">
          {s.models.length ? (
            <BarList
              rows={s.models.map(([model, count]) => ({
                key: model,
                label: <code className="font-mono text-xs">{model}</code>,
                value: count,
                display: `${count} pic${count === 1 ? "" : "s"}`,
                color: "var(--seq-4)",
              }))}
            />
          ) : (
            <Empty />
          )}
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <StandoutCard title="🏆 Cooked the hardest" note="Highest-scoring caption ever" item={s.standouts.best} />
        <StandoutCard title="⚖️ Most controversial" note="The most votes on both sides" item={s.standouts.controversial} />
        <StandoutCard title="🧯 Burnt" note="Lowest-scoring caption ever" item={s.standouts.burnt} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <PeopleCard title="Top cooks" note="Total score across their pics" people={s.topCooks} unit="pts" />
        <PeopleCard title="Most active voters" note="Votes cast" people={s.topVoters} unit="votes" />
        <Card title="Harshest critic" note="Highest share of downvotes (5+ votes cast)">
          {s.harshest ? (
            <div>
              <p className="text-3xl font-semibold">{s.harshest.value}%</p>
              <p className="mt-1 text-sm text-ink">
                {s.harshest.name} {s.harshest.username && <span className="text-muted">@{s.harshest.username}</span>}
              </p>
              <p className="text-xs text-muted">{s.harshest.detail}</p>
            </div>
          ) : (
            <Empty />
          )}
        </Card>
      </div>
    </div>
  );
}

function Empty() {
  return <p className="text-sm text-muted">Not enough data yet.</p>;
}

function StandoutCard({ title, note, item }: { title: string; note: string; item: Standout | undefined }) {
  return (
    <Card title={title} note={note}>
      {item ? (
        <Link href={`/media/${item.caption.photo_id}`} className="flex gap-3 rounded-lg hover:bg-wash">
          {item.photo && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photoUrl(item.photo.image_path)} alt="" className="size-16 shrink-0 rounded-md object-cover" />
          )}
          <div className="min-w-0">
            <p className="text-sm text-ink">“{item.caption.text}”</p>
            <p className="mt-1 text-xs text-muted">
              {STYLE_EMOJI[item.caption.style]} {item.caption.style} · ▲ {item.caption.upvotes} ▼ {item.caption.downvotes}
            </p>
          </div>
        </Link>
      ) : (
        <Empty />
      )}
    </Card>
  );
}

function PeopleCard({ title, note, people, unit }: { title: string; note: string; people: Person[]; unit: string }) {
  return (
    <Card title={title} note={note}>
      {people.length ? (
        <ol className="space-y-2">
          {people.map((p, i) => (
            <li key={p.id} className="flex items-baseline gap-3 text-sm">
              <span className="w-4 text-muted tabular-nums">{i + 1}</span>
              <span className="min-w-0 flex-1 truncate text-ink">
                {p.name} {p.username && <span className="text-muted">@{p.username}</span>}
                <span className="block text-xs text-muted">{p.detail}</span>
              </span>
              <span className="font-medium tabular-nums">
                {p.value} <span className="text-xs font-normal text-muted">{unit}</span>
              </span>
            </li>
          ))}
        </ol>
      ) : (
        <Empty />
      )}
    </Card>
  );
}
