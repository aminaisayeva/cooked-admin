// The Voice League: the four voices ranked by wins this week (a win is having
// the top-scoring caption on a photo). Resets every Monday, New York time.
import type { SupabaseClient } from "@supabase/supabase-js";
import { STYLE_EMOJI } from "@/lib/voices";

export const VOICE_NAMES = Object.keys(STYLE_EMOJI);

export type LeagueRow = { voice: string; emoji: string; rank: number; wins: number; captions: number; points: number };
export type League = { weekStart: string | null; rows: LeagueRow[] };

type Raw = { voice: string; wins: number; captions: number; points: number; week_start: string };

async function week(supabase: SupabaseClient, weeksAgo: number): Promise<League> {
  const { data } = await supabase.rpc("voice_league", { weeks_ago: weeksAgo });
  const raw = new Map(((data ?? []) as Raw[]).map((r) => [r.voice, r]));
  // Every voice is listed, even before it has a caption this week.
  const rows = VOICE_NAMES.map((voice) => {
    const r = raw.get(voice);
    return { voice, emoji: STYLE_EMOJI[voice], rank: 0, wins: r?.wins ?? 0, captions: r?.captions ?? 0, points: r?.points ?? 0 };
  }).sort((a, b) => b.wins - a.wins || b.points - a.points);
  // Equal wins and points share a rank.
  rows.forEach((r, i) => {
    const prev = rows[i - 1];
    r.rank = prev && prev.wins === r.wins && prev.points === r.points ? prev.rank : i + 1;
  });
  return { weekStart: ((data ?? []) as Raw[])[0]?.week_start ?? null, rows };
}

export const voiceLeague = (supabase: SupabaseClient) => week(supabase, 0);

// Last week's winner, "Voice of the Week": its captions wear a crown all week.
export async function reigningChampion(supabase: SupabaseClient): Promise<string | null> {
  const { rows } = await week(supabase, 1);
  const top = rows[0];
  return top && top.wins > 0 && rows.filter((r) => r.rank === 1).length === 1 ? top.voice : null;
}

// One line per voice for the caption prompt, so the voices know where they stand.
export function standingsForPrompt(league: League, champion: string | null): string {
  const played = league.rows.some((r) => r.captions > 0);
  const lines = league.rows.map(
    (r) => `${r.rank}. ${r.voice}: ${r.wins} win${r.wins === 1 ? "" : "s"}, ${r.points} net votes${r.voice === champion ? " (last week's Voice of the Week)" : ""}`,
  );
  return `The voices compete in the cooked.ai Voice League: every week, a voice gets a win for each photo where its caption gets the most votes. ${
    played ? "This week's standings so far:" : "A new week just started, so the standings are:"
  }
${lines.join("\n")}

The voices know these standings. In one caption (two at most), let a voice nod to its rank if it fits the photo naturally: the leader can be smug, last place defensive or in denial, a voice on a streak can gloat. Never let the rivalry replace the joke about the photo.`;
}

export type Taste = { voice: string; emoji: string; upvotes: number; share: number }[];

// Which voices someone upvotes, most first. Only totals leave the database.
export async function voiceTaste(supabase: SupabaseClient, userId: string): Promise<Taste> {
  const { data } = await supabase.rpc("voice_taste", { target: userId });
  const rows = (data ?? []) as { voice: string; upvotes: number }[];
  const total = rows.reduce((s, r) => s + r.upvotes, 0);
  if (!total) return [];
  return VOICE_NAMES.map((voice) => {
    const upvotes = rows.find((r) => r.voice === voice)?.upvotes ?? 0;
    return { voice, emoji: STYLE_EMOJI[voice], upvotes, share: upvotes / total };
  }).sort((a, b) => b.upvotes - a.upvotes);
}

// Your team shows once you've upvoted a few captions.
export const TEAM_MIN_UPVOTES = 5;
