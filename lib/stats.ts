import { fetchAll, TIME_ZONE, type Caption, type CookedProfile, type Photo, type Profile, type Supabase, type Vote } from "@/lib/admin";

export const VOICES = ["Chronically Online", "Midwest Mom", "Real New Yorker", "Columbia Tour Guide"];
export const DAYS = 30;

type Day = { date: string; label: string; posts: number; votes: number; signups: number };

export type VoiceStat = {
  style: string;
  captions: number;
  wins: number;
  winShare: number;
  avgScore: number;
  upShare: number | null;
};

export type Standout = { caption: Caption; photo: Photo | undefined };

export type Person = { id: string; name: string; username: string | null; value: number; detail: string };

const dayKey = new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" });
const dayLabel = new Intl.DateTimeFormat("en-US", { timeZone: TIME_ZONE, month: "short", day: "numeric" });
const weekdayHour = new Intl.DateTimeFormat("en-US", { timeZone: TIME_ZONE, weekday: "short", hour: "numeric", hourCycle: "h23" });
export const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function whenInNewYork(iso: string) {
  const parts = weekdayHour.formatToParts(new Date(iso));
  const weekday = parts.find((p) => p.type === "weekday")!.value;
  const hour = Number(parts.find((p) => p.type === "hour")!.value) % 24;
  return { day: WEEKDAYS.indexOf(weekday), hour };
}

export async function loadStats(supabase: Supabase) {
  const [profiles, cooked, photos, captions, votes] = await Promise.all([
    fetchAll<Profile>((a, b) => supabase.from("profiles").select("id, email, first_name, last_name, is_superadmin, created_at").order("id").range(a, b)),
    fetchAll<CookedProfile>((a, b) => supabase.from("cooked_profiles").select("user_id, username, display_name, avatar_path").order("user_id").range(a, b)),
    fetchAll<Photo>((a, b) => supabase.from("photos").select("id, author_id, author_name, image_path, prompt, system_prompt, model, score, created_at").order("id").range(a, b)),
    fetchAll<Caption>((a, b) => supabase.from("captions").select("id, photo_id, style, text, position, upvotes, downvotes, score, created_at").order("id").range(a, b)),
    fetchAll<Vote>((a, b) => supabase.from("caption_votes").select("caption_id, user_id, value, created_at, updated_at").order("caption_id").order("user_id").range(a, b)),
  ]);

  const photoById = new Map(photos.map((p) => [p.id, p]));
  const cookedById = new Map(cooked.map((c) => [c.user_id, c]));
  const profileById = new Map(profiles.map((p) => [p.id, p]));
  const nameOf = (id: string) =>
    cookedById.get(id)?.display_name ?? ([profileById.get(id)?.first_name, profileById.get(id)?.last_name].filter(Boolean).join(" ") || profileById.get(id)?.email || "Unknown");

  const upvotes = votes.filter((v) => v.value === 1).length;

  // Which voice cooks hardest: a voice "wins" a photo when its caption has
  // the photo's single highest score (ties and all-zero photos don't count).
  const byPhoto = new Map<string, Caption[]>();
  for (const c of captions) byPhoto.set(c.photo_id, [...(byPhoto.get(c.photo_id) ?? []), c]);
  const wins = new Map<string, number>();
  let decided = 0;
  for (const list of byPhoto.values()) {
    const top = Math.max(...list.map((c) => c.score));
    const leaders = list.filter((c) => c.score === top);
    if (top > 0 && leaders.length === 1) {
      decided++;
      wins.set(leaders[0].style, (wins.get(leaders[0].style) ?? 0) + 1);
    }
  }
  const styles = [...VOICES, ...new Set(captions.map((c) => c.style).filter((s) => !VOICES.includes(s)))];
  const voices: VoiceStat[] = styles
    .map((style) => {
      const mine = captions.filter((c) => c.style === style);
      const up = mine.reduce((n, c) => n + c.upvotes, 0);
      const down = mine.reduce((n, c) => n + c.downvotes, 0);
      return {
        style,
        captions: mine.length,
        wins: wins.get(style) ?? 0,
        winShare: decided ? (wins.get(style) ?? 0) / decided : 0,
        avgScore: mine.length ? mine.reduce((n, c) => n + c.score, 0) / mine.length : 0,
        upShare: up + down ? up / (up + down) : null,
      };
    })
    .filter((v) => v.captions > 0 || VOICES.includes(v.style));

  // Daily activity, last 30 days in New York time.
  const today = new Date();
  const days: Day[] = Array.from({ length: DAYS }, (_, i) => {
    const d = new Date(today.getTime() - (DAYS - 1 - i) * 86_400_000);
    return { date: dayKey.format(d), label: dayLabel.format(d), posts: 0, votes: 0, signups: 0 };
  });
  const dayIndex = new Map(days.map((d, i) => [d.date, i]));
  const bump = (iso: string, field: "posts" | "votes" | "signups") => {
    const i = dayIndex.get(dayKey.format(new Date(iso)));
    if (i !== undefined) days[i][field]++;
  };
  photos.forEach((p) => bump(p.created_at, "posts"));
  votes.forEach((v) => bump(v.created_at, "votes"));
  profiles.forEach((p) => bump(p.created_at, "signups"));

  // When campus cooks: posts + votes by weekday and hour.
  const heat = WEEKDAYS.map(() => Array.from({ length: 24 }, () => 0));
  for (const iso of [...photos.map((p) => p.created_at), ...votes.map((v) => v.created_at)]) {
    const { day, hour } = whenInNewYork(iso);
    if (day >= 0) heat[day][hour]++;
  }

  // Signup funnel.
  const posters = new Set(photos.map((p) => p.author_id));
  const voters = new Set(votes.map((v) => v.user_id));
  const funnel = [
    { label: "Signed up", value: profiles.length },
    { label: "Added their name", value: profiles.filter((p) => p.first_name && p.last_name).length },
    { label: "Picked a @username", value: cooked.length },
    { label: "Voted on a caption", value: profiles.filter((p) => voters.has(p.id)).length },
    { label: "Posted a pic", value: profiles.filter((p) => posters.has(p.id)).length },
  ];

  // Standout captions.
  const withPhoto = (c: Caption): Standout => ({ caption: c, photo: photoById.get(c.photo_id) });
  const voted = captions.filter((c) => c.upvotes + c.downvotes > 0);
  const best = [...voted].sort((a, b) => b.score - a.score || b.upvotes - a.upvotes)[0];
  const burnt = [...voted].sort((a, b) => a.score - b.score || b.downvotes - a.downvotes)[0];
  const controversial = [...voted]
    .filter((c) => c.upvotes > 0 && c.downvotes > 0)
    .sort((a, b) => Math.min(b.upvotes, b.downvotes) - Math.min(a.upvotes, a.downvotes) || b.upvotes + b.downvotes - (a.upvotes + a.downvotes))[0];

  // People.
  const cookScore = new Map<string, number>();
  photos.forEach((p) => cookScore.set(p.author_id, (cookScore.get(p.author_id) ?? 0) + p.score));
  const topCooks: Person[] = [...cookScore]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([id, score]) => ({
      id,
      name: nameOf(id),
      username: cookedById.get(id)?.username ?? null,
      value: score,
      detail: `${photos.filter((p) => p.author_id === id).length} pics`,
    }));

  const ballots = new Map<string, { up: number; down: number }>();
  for (const v of votes) {
    const b = ballots.get(v.user_id) ?? { up: 0, down: 0 };
    if (v.value === 1) b.up++;
    else b.down++;
    ballots.set(v.user_id, b);
  }
  const person = (id: string, value: number, detail: string): Person => ({
    id,
    name: nameOf(id),
    username: cookedById.get(id)?.username ?? null,
    value,
    detail,
  });
  const topVoters = [...ballots]
    .sort((a, b) => b[1].up + b[1].down - (a[1].up + a[1].down))
    .slice(0, 5)
    .map(([id, b]) => person(id, b.up + b.down, `${b.up} up · ${b.down} down`));
  const harshest = [...ballots]
    .filter(([, b]) => b.up + b.down >= 5)
    .sort((a, b) => b[1].down / (b[1].up + b[1].down) - a[1].down / (a[1].up + a[1].down))
    .slice(0, 1)
    .map(([id, b]) => person(id, Math.round((100 * b.down) / (b.up + b.down)), `${b.down} of ${b.up + b.down} votes were down`))[0];

  const models = [...photos.reduce((m, p) => m.set(p.model, (m.get(p.model) ?? 0) + 1), new Map<string, number>())].sort((a, b) => b[1] - a[1]);
  const withContext = photos.filter((p) => p.prompt).length;

  return {
    totals: {
      profiles: profiles.length,
      cooked: cooked.length,
      admins: profiles.filter((p) => p.is_superadmin).length,
      photos: photos.length,
      captions: captions.length,
      votes: votes.length,
      upShare: votes.length ? upvotes / votes.length : null,
      votesPerPhoto: photos.length ? votes.length / photos.length : 0,
      withContext,
    },
    voices,
    decided,
    days,
    heat,
    funnel,
    standouts: {
      best: best && withPhoto(best),
      burnt: burnt && burnt.score < 0 ? withPhoto(burnt) : undefined,
      controversial: controversial && withPhoto(controversial),
    },
    topCooks,
    topVoters,
    harshest,
    models,
  };
}
