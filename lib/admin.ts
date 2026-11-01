import { redirect } from "next/navigation";
import { supabaseEnv } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

export const PHOTO_BUCKET = "photos";
export const MAX_PHOTO_BYTES = 4 * 1024 * 1024;
export const MAX_CONTEXT = 140;
export const TIME_ZONE = "America/New_York";

export type Profile = {
  id: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  is_superadmin: boolean;
  created_at: string;
};

export type CookedProfile = { user_id: string; username: string; display_name: string; avatar_path: string | null };

export type Caption = {
  id: string;
  photo_id: string;
  style: string;
  text: string;
  position: number;
  upvotes: number;
  downvotes: number;
  score: number;
  created_at: string;
};

export type Photo = {
  id: string;
  author_id: string;
  author_name: string | null;
  image_path: string;
  prompt: string | null;
  system_prompt: string;
  model: string;
  score: number;
  created_at: string;
};

export type Vote = { caption_id: string; user_id: string; value: number; created_at: string; updated_at: string };

export type Supabase = Awaited<ReturnType<typeof createClient>>;

// The signed-in superadmin, or a redirect. The proxy already gates every
// route; pages and Server Actions check again because actions are their own
// POST endpoints. Row level security is the last line: without the flag the
// database refuses these reads and writes anyway.
export async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: me } = await supabase
    .from("profiles")
    .select("id, email, first_name, last_name, is_superadmin, created_at")
    .eq("id", user.id)
    .maybeSingle<Profile>();
  if (!me?.is_superadmin) redirect("/denied");
  return { supabase, user, me };
}

// PostgREST caps a response at 1000 rows; page through everything. The
// client is untyped (no generated schema), so the caller names the row type.
export async function fetchAll<T>(
  page: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>,
  size = 1000,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += size) {
    const { data, error } = await page(from, from + size - 1);
    if (error) throw new Error(error.message);
    rows.push(...((data ?? []) as T[]));
    if (!data || data.length < size) return rows;
  }
}

export function photoUrl(path: string) {
  return `${supabaseEnv().url}/storage/v1/object/public/${PHOTO_BUCKET}/${path}`;
}

export function avatarUrl(path: string | null) {
  return path ? `${supabaseEnv().url}/storage/v1/object/public/avatars/${path}` : null;
}

export function fullName(p: Pick<Profile, "first_name" | "last_name"> | null | undefined) {
  return [p?.first_name, p?.last_name].filter(Boolean).join(" ");
}

export { STYLE_EMOJI } from "@/lib/voices";

const dateTime = new Intl.DateTimeFormat("en-US", { timeZone: TIME_ZONE, dateStyle: "medium", timeStyle: "short" });
const dateOnly = new Intl.DateTimeFormat("en-US", { timeZone: TIME_ZONE, dateStyle: "medium" });

export const formatDateTime = (iso: string) => dateTime.format(new Date(iso));
export const formatDate = (iso: string) => dateOnly.format(new Date(iso));

export function pageParam(raw: string | string[] | undefined) {
  const n = Number(Array.isArray(raw) ? raw[0] : raw);
  return Number.isInteger(n) && n > 0 ? n : 1;
}

export function textParam(raw: string | string[] | undefined) {
  return (Array.isArray(raw) ? raw[0] : raw)?.trim() ?? "";
}
