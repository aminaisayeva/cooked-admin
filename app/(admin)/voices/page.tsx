import type { Metadata } from "next";
import Link from "next/link";
import { BarList, Card, StatTile } from "@/components/charts";
import { requireAdmin } from "@/lib/admin";
import { loadVoiceStats, TEAM_MIN_UPVOTES } from "@/lib/voice-stats";
import { STYLE_EMOJI, VOICE_COLOR } from "@/lib/voices";

export const metadata: Metadata = { title: "Voices" };

const pct = (n: number | null) => (n === null ? "–" : `${Math.round(n * 100)}%`);
const signed = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(2)}`;
const weekOf = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/New_York" });

// Whose voice people upvote, and what follows from it.
export default async function VoicesPage() {
  const { supabase } = await requireAdmin();
  const s = await loadVoiceStats(supabase);
  const label = (v: string) => `${STYLE_EMOJI[v]} ${v}`;
  const favourite = [...s.perVoice].sort((a, b) => b.up - a.up)[0];
  const rated = s.perVoice.filter((v) => v.approval !== null && v.up + v.down >= 3);
  const divisive = [...rated].sort((a, b) => (a.approval ?? 1) - (b.approval ?? 1))[0];
  const withTeam = s.voters.filter((v) => v.team).length;
  const firstBias = s.positions[0].upPerCaption && s.positions[3].upPerCaption ? s.positions[0].upPerCaption / s.positions[3].upPerCaption : null;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Voices</h1>
        <p className="mt-1 max-w-3xl text-sm text-ink-2">
          Which of the four voices people upvote, who is on which team, and what else the votes say. Votes are private in the app; the profile page only shows
          each person their totals.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Most upvoted voice" value={favourite?.up ? label(favourite.voice) : "–"} detail={favourite?.up ? `${pct(favourite.upShare)} of ${s.totalUp} upvotes` : "No upvotes yet"} />
        <StatTile label="Most divisive" value={divisive ? label(divisive.voice) : "–"} detail={divisive ? `only ${pct(divisive.approval)} of its votes are upvotes` : "Needs 3+ votes per voice"} />
        <StatTile label="Voters with a team" value={`${withTeam} of ${s.voters.length}`} detail={`a team needs ${TEAM_MIN_UPVOTES}+ upvotes and a clear favourite`} />
        <StatTile label="Average loyalty" value={pct(s.loyalty.average)} detail="of a team member’s upvotes go to their team" />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Whose voice gets the upvotes" note={`Share of all ${s.totalUp} upvotes, by the voice of the caption.`}>
          <BarList
            max={1}
            rows={s.perVoice.map((v) => ({
              key: v.voice,
              label: label(v.voice),
              value: v.upShare,
              display: `${pct(v.upShare)} · ${v.up} ▲`,
              color: VOICE_COLOR[v.voice],
              tip: `${v.captions} captions · ${v.down} downvotes`,
            }))}
          />
        </Card>

        <Card title="Approval rate" note="Of the votes each voice got, how many were upvotes. Low means people disagree about it.">
          <BarList
            max={1}
            rows={s.perVoice.map((v) => ({
              key: v.voice,
              label: label(v.voice),
              value: v.approval ?? 0,
              display: v.approval === null ? "no votes" : `${pct(v.approval)} · ${v.up} ▲ ${v.down} ▼`,
              color: VOICE_COLOR[v.voice],
            }))}
          />
        </Card>

        <Card title="Teams" note={`Voters by their favourite voice (${TEAM_MIN_UPVOTES}+ upvotes, no tie). The same “Team …” people see on their profile.`}>
          <BarList
            rows={s.teams.map((t) => ({
              key: t.voice,
              label: `Team ${label(t.voice)}`,
              value: t.members,
              display: `${t.members} ${t.members === 1 ? "voter" : "voters"}`,
              color: VOICE_COLOR[t.voice],
            }))}
          />
          <p className="mt-4 text-xs text-ink-2">
            Loyalists (60%+ for their team): <b>{s.loyalty.loyalists}</b> · leaning (40–59%): <b>{s.loyalty.leaning}</b> · spread out (under 40%): <b>{s.loyalty.spread}</b>
          </p>
        </Card>

        <Card title="Do people just upvote the first caption?" note="Average upvotes per caption by where it sits on the post.">
          <BarList
            rows={s.positions.map((p) => ({
              key: p.label,
              label: `${p.label} caption`,
              value: p.upPerCaption,
              display: p.upPerCaption.toFixed(2),
              color: "var(--series-1)",
              tip: `${p.captions} captions`,
            }))}
          />
          <p className="mt-4 text-xs text-ink-2">
            {firstBias === null
              ? "Not enough votes to tell yet."
              : firstBias > 1.2
                ? `The first caption gets ${firstBias.toFixed(1)}× the upvotes of the 4th. Order matters, so the voices' order on a post isn't neutral.`
                : "No strong first-position bias: people read past the top caption."}
          </p>
        </Card>

        <Card title="Does length matter?" note="Average caption score (▲ minus ▼) by caption length.">
          <BarList
            rows={s.lengths.map((l) => ({
              key: l.label,
              label: l.label,
              value: Math.max(0, l.avgScore),
              display: signed(l.avgScore),
              color: "var(--series-1)",
              tip: `${l.captions} captions`,
            }))}
          />
        </Card>

        <Card title="Which chain brings out which voice" note="Average caption score per voice, split by the prompt chain that wrote it.">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-ink-2">
                <tr>
                  <th scope="col" className="py-1 pr-3 font-medium">Chain</th>
                  {s.voices.map((v) => (
                    <th key={v} scope="col" className="px-2 py-1 text-right font-medium" title={v}>{STYLE_EMOJI[v]}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {s.chainRows.map((r) => (
                  <tr key={r.name} className="border-t border-line">
                    <td className="py-1.5 pr-3">{r.name}</td>
                    {r.cells.map((c, i) => (
                      <td key={s.voices[i]} className="px-2 py-1.5 text-right tabular-nums" title={c ? `${c.n} captions` : undefined}>
                        {c ? signed(c.avg) : <span className="text-muted">—</span>}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      <Card title="Head to head" note="On posts where both voices have a caption, how often the row’s voice scored higher than the column’s (ties left out).">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="text-left text-xs text-ink-2">
              <tr>
                <th scope="col" className="py-1 pr-3 font-medium">Beat →</th>
                {s.voices.map((v) => (
                  <th key={v} scope="col" className="px-2 py-1 text-right font-medium">{label(v)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {s.voices.map((a, i) => (
                <tr key={a} className="border-t border-line">
                  <th scope="row" className="py-1.5 pr-3 text-left font-medium">{label(a)}</th>
                  {s.h2h[i].map((cell, j) => {
                    const games = cell ? cell.won + cell.lost : 0;
                    const rate = games ? cell!.won / games : null;
                    return (
                      <td
                        key={s.voices[j]}
                        className="px-2 py-1.5 text-right tabular-nums"
                        style={rate !== null ? { background: `color-mix(in oklab, var(--series-1) ${Math.round(rate * 35)}%, transparent)` } : undefined}
                      >
                        {cell === null ? <span className="text-muted">·</span> : games ? `${pct(rate)} (${cell.won}–${cell.lost})` : <span className="text-muted">—</span>}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="Voice League history" note="Wins per week (a win = the top caption on a pic posted that week). 👑 marks each week’s Voice of the Week.">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="text-left text-xs text-ink-2">
              <tr>
                <th scope="col" className="py-1 pr-3 font-medium">Week of</th>
                {s.voices.map((v) => (
                  <th key={v} scope="col" className="px-2 py-1 text-right font-medium">{label(v)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {s.history.map((w) => (
                <tr key={w.weeksAgo} className="border-t border-line">
                  <td className="py-1.5 pr-3 whitespace-nowrap">
                    {w.weekStart ? weekOf(w.weekStart) : w.weeksAgo === 0 ? "This week" : `${w.weeksAgo} weeks ago`}
                    {w.weeksAgo === 0 && <span className="text-muted"> (so far)</span>}
                  </td>
                  {s.voices.map((v) => (
                    <td key={v} className="px-2 py-1.5 text-right tabular-nums">
                      {w.weekStart ? (
                        <>
                          {w.champ === v && <span aria-label="Voice of the Week">👑 </span>}
                          {w.wins[v] ?? 0}
                        </>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="Voters" note="Each voter’s upvotes split by voice. Their team is their top voice once they have enough upvotes.">
        <ul className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-2" aria-label="Legend">
          {s.voices.map((v) => (
            <li key={v} className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-[2px]" style={{ background: VOICE_COLOR[v] }} aria-hidden="true" />
              {label(v)}
            </li>
          ))}
        </ul>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="text-left text-xs text-ink-2">
              <tr>
                <th scope="col" className="py-1 pr-3 font-medium">Voter</th>
                <th scope="col" className="px-2 py-1 text-right font-medium">▲</th>
                <th scope="col" className="px-2 py-1 text-right font-medium">▼</th>
                <th scope="col" className="px-2 py-1 font-medium">Upvotes by voice</th>
                <th scope="col" className="px-2 py-1 font-medium">Team</th>
                <th scope="col" className="px-2 py-1 text-right font-medium">Loyalty</th>
              </tr>
            </thead>
            <tbody>
              {s.voters.map((v) => (
                <tr key={v.id} className="border-t border-line">
                  <td className="py-1.5 pr-3">
                    <Link href={`/votes?voter=${v.id}`} className="hover:underline">{v.name}</Link>
                    {v.username && <span className="text-xs text-muted"> @{v.username}</span>}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{v.upvotes}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{v.downvotes}</td>
                  <td className="w-[40%] px-2 py-1.5">
                    {v.upvotes ? (
                      <div className="flex h-2.5 gap-[2px]" title={s.voices.map((x) => `${x}: ${v.split[x]}`).join(" · ")}>
                        {s.voices
                          .filter((x) => v.split[x])
                          .map((x) => (
                            <span key={x} className="h-full rounded-[3px]" style={{ width: `${(v.split[x] / v.upvotes) * 100}%`, background: VOICE_COLOR[x] }} />
                          ))}
                      </div>
                    ) : (
                      <span className="text-xs text-muted">no upvotes</span>
                    )}
                  </td>
                  <td className="px-2 py-1.5 whitespace-nowrap">{v.team ? label(v.team) : <span className="text-muted">—</span>}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{v.upvotes ? pct(v.loyalty) : "—"}</td>
                </tr>
              ))}
              {!s.voters.length && (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-muted">Nobody has voted yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
