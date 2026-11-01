"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin";
import { entity, parseForm } from "@/lib/crud";

export type CrudState = { error?: string; ok?: string; at?: number } | null;

// Postgres errors people can act on, in plain words.
function friendly(message: string, code?: string) {
  if (code === "23505") return "That one already exists.";
  if (code === "23503") return "Other rows still use this one. Change or delete those first.";
  if (code === "23514") return "The database rejected a value. Check the format.";
  return message;
}

const id = (form: FormData) => {
  const v = form.get("id");
  return typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v) ? v : null;
};

// CREATE (no id) or UPDATE (id) a row of one of the simple tables.
export async function saveRow(key: string, _: CrudState, form: FormData): Promise<CrudState> {
  const { supabase } = await requireAdmin();
  const e = entity(key);
  const parsed = parseForm(e, form);
  if ("error" in parsed) return { error: parsed.error };
  const rowId = id(form);
  const { data, error } = rowId
    ? await supabase.from(e.table).update(parsed.values).eq("id", rowId).select("id")
    : await supabase.from(e.table).insert(parsed.values).select("id");
  if (error) return { error: friendly(error.message, error.code) };
  if (!data?.length) return { error: "Nothing was saved. The row may be gone, or you can't edit it." };
  revalidatePath(e.path);
  return { ok: rowId ? "Saved." : `Added the ${e.singular}.`, at: Date.now() };
}

// DELETE a row.
export async function deleteRow(key: string, _: CrudState, form: FormData): Promise<CrudState> {
  const { supabase } = await requireAdmin();
  const e = entity(key);
  const rowId = id(form);
  if (!rowId) return { error: "Missing id." };
  const { data, error } = await supabase.from(e.table).delete().eq("id", rowId).select("id");
  if (error) return { error: friendly(error.message, error.code) };
  if (!data?.length) return { error: "Nothing was deleted. The row may already be gone." };
  revalidatePath(e.path);
  return { ok: "Deleted.", at: Date.now() };
}
