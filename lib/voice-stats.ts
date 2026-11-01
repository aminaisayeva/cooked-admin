// Who upvotes which voice, and what follows from it, for the Voices page.
import { fetchAll, type Supabase } from "@/lib/admin";
import { VOICE_NAMES } from "@/lib/voices";

export const TEAM_MIN_UPVOTES = 5; // same threshold as the app's "Your team"

type Caption = { id: string; photo_id: string; style: string; text: string; position: number; upvotes: number; downvotes: number; score: number };
type Vote = { caption_id: string; user_id: string; value: number };

export type Voter = { id: string; name: string; username: string | null; upvotes: number; downvotes: number; split: Record<string, number>; team: string | null; loyalty: number };

export async function loadVoiceStats(supabase: Supabase) {
  const [captions, votes, photos, chains, profiles, cooked, weeks] = await Promise.all([
    fetchAll<Caption>((a, b) => supabase.from("captions").select("id, photo_id, style, text, position, upvotes, downvotes, score").order("id").range(a, b)),
    fetchAll<Vote>((a, b) => supabase.from("caption_votes").select("caption_id, user_id, value").order("caption_id").order("user_id").range(a, b)),
    fetchAll<{ id: string; chain_id: string | null }>((a, b) => supabase.from("photos").select("id, chain_id").order("id").range(a, b)),
    supabase.from("prompt_chains").select("id, name").order("created_at"),
    fetchAll<{ id: string; email: string | null; first_name: string | null; last_name: string | null }>((a, b) =>
      supabase.from("profiles").select("id, email, first_name, last_name").order("id").range(a, b),
    ),
    fetchAll<{ user_id: string; username: string; display_name: string }>((a, b) => supabase.from("cooked_profiles").select("user_id, username, display_name").order("user_id").range(a, b)),
    Promise.all(Array.from({ length: 8 }, (_, w) => supabase.rpc("voice_league", { weeks_ago: w }))),
  ]);

  const voices = VOICE_NAMES;
  const captionById = new Map(captions.map((c) => [c.id, c]));
  const zero = () => Object.fromEntries(voices.map((v) => [v, 0])) as Record<string, number>;

  // Upvotes and downvotes each voice received.
  const ups = zero();
  const downs = zero();
  for (const v of votes) {
    const c = captionById.get(v.caption_id);
    if (!c || !(c.style in ups)) continue;
    if (v.value === 1) ups[c.style]++;
    else downs[c.style]++;
  }
  const totalUp = voices.reduce((s, v) => s + ups[v], 0);
  const perVoice = voices.map((v) => ({
    voice: v,
    up: ups[v],
    down: downs[v],
    upShare: totalUp ? ups[v] / totalUp : 0,
    approval: ups[v] + downs[v] ? ups[v] / (ups[v] + downs[v]) : null,
    captions: captions.filter((c) => c.style === v).length,
  }));

  // Each voter's split, team (top voice once they have enough upvotes) and
  // loyalty (the share of their upvotes that went to that voice).
  const cookedById = new Map(cooked.map((c) => [c.user_id, c]));
  const profileById = new Map(profiles.map((p) => [p.id, p]));
  const voterIds = [...new Set(votes.map((v) => v.user_id))];
  const voters: Voter[] = voterIds
    .map((id) => {
      const split = zero();
      let downvotes = 0;
      for (const v of votes) {
        if (v.user_id !== id) continue;
        const c = captionById.get(v.caption_id);
        if (v.value === -1) downvotes++;
        else if (c && c.style in split) split[c.style]++;
      }
      const upvotes = voices.reduce((s, v) => s + split[v], 0);
      const top = [...voices].sort((a, b) => split[b] - split[a])[0];
      const tied = voices.filter((v) => split[v] === split[top]).length > 1;
      const p = profileById.get(id);
      const ck = cookedById.get(id);
      return {
        id,
        name: ck?.display_name ?? ([p?.first_name, p?.last_name].filter(Boolean).join(" ") || p?.email || "Unknown"),
        username: ck?.username ?? null,
        upvotes,
        downvotes,
        split,
        team: upvotes >= TEAM_MIN_UPVOTES && !tied ? top : null,
        loyalty: upvotes ? split[top] / upvotes : 0,
      };
    })
    .sort((a, b) => b.upvotes - a.upvotes);

  const teams = voices.map((v) => ({ voice: v, members: voters.filter((x) => x.team === v).length }));
  const withTeam = voters.filter((v) => v.team);
  const loyalty = {
    loyalists: withTeam.filter((v) => v.loyalty >= 0.6).length,
    leaning: withTeam.filter((v) => v.loyalty >= 0.4 && v.loyalty < 0.6).length,
    spread: withTeam.filter((v) => v.loyalty < 0.4).length,
    average: withTeam.length ? withTeam.reduce((s, v) => s + v.loyalty, 0) / withTeam.length : null,
  };

  // Head to head: on photos with both voices, how often A's caption beat B's.
  const byPhoto = new Map<string, Caption[]>();
  for (const c of captions) byPhoto.set(c.photo_id, [...(byPhoto.get(c.photo_id) ?? []), c]);
  const h2h = voices.map((a) =>
    voices.map((b) => {
      if (a === b) return null;
      let won = 0;
      let lost = 0;
      for (const list of byPhoto.values()) {
        const ca = list.find((c) => c.style === a);
        const cb = list.find((c) => c.style === b);
        if (!ca || !cb || ca.score === cb.score) continue;
        if (ca.score > cb.score) won++;
        else lost++;
      }
      return { won, lost };
    }),
  );

  // Position bias: are captions shown first upvoted more?
  const positions = [0, 1, 2, 3].map((pos) => {
    const cs = captions.filter((c) => Math.min(c.position, 3) === pos);
    const up = cs.reduce((s, c) => s + c.upvotes, 0);
    return { label: pos === 3 ? "4th or later" : ["1st", "2nd", "3rd"][pos], captions: cs.length, upPerCaption: cs.length ? up / cs.length : 0 };
  });

  // Does length matter? Average score by caption length.
  const lengths = [
    { label: "Short (under 60 characters)", test: (n: number) => n < 60 },
    { label: "Medium (60–99)", test: (n: number) => n >= 60 && n < 100 },
    { label: "Long (100+)", test: (n: number) => n >= 100 },
  ].map(({ label, test }) => {
    const cs = captions.filter((c) => test(c.text.length));
    return { label, captions: cs.length, avgScore: cs.length ? cs.reduce((s, c) => s + c.score, 0) / cs.length : 0 };
  });

  // Which chain brings out which voice: average caption score.
  const chainOf = new Map(photos.map((p) => [p.id, p.chain_id]));
  const chainRows = [...(chains.data ?? []).map((c) => ({ id: c.id as string | null, name: c.name as string })), { id: null, name: "Built-in prompt" }].map((ch) => ({
    name: ch.name,
    cells: voices.map((v) => {
      const cs = captions.filter((c) => c.style === v && (chainOf.get(c.photo_id) ?? null) === ch.id);
      return cs.length ? { avg: cs.reduce((s, c) => s + c.score, 0) / cs.length, n: cs.length } : null;
    }),
  })).filter((r) => r.cells.some(Boolean));

  // Voice League history, newest week first.
  const history = weeks.map(({ data }, w) => {
    const rows = (data ?? []) as { voice: string; wins: number; points: number; week_start: string }[];
    const sorted = [...rows].sort((a, b) => b.wins - a.wins || b.points - a.points);
    const champ = sorted[0] && sorted[0].wins > 0 && !(sorted[1] && sorted[1].wins === sorted[0].wins && sorted[1].points === sorted[0].points) ? sorted[0].voice : null;
    return { weeksAgo: w, weekStart: rows[0]?.week_start ?? null, wins: Object.fromEntries(rows.map((r) => [r.voice, r.wins])) as Record<string, number>, champ };
  });

  return { voices, perVoice, totalUp, voters, teams, loyalty, h2h, positions, lengths, chainRows, history };
}
