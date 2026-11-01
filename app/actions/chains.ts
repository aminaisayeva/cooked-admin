"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin";
import type { FormState } from "@/app/actions/media";

// UPDATE the prompt chain mix: each chain's weight (0-100) when a new photo
// picks a chain at random. 0 switches a chain off.
export async function updateMix(_: FormState, form: FormData): Promise<FormState> {
  const { supabase } = await requireAdmin();
  const weights = [...form.entries()].filter(([k]) => k.startsWith("weight:"));
  const rows = weights.map(([k, v]) => ({ chain_id: k.slice(7), weight: Number(v) }));
  if (rows.some((r) => !/^[0-9a-f-]{36}$/i.test(r.chain_id) || !Number.isInteger(r.weight) || r.weight < 0 || r.weight > 100)) {
    return { error: "Each weight must be a whole number from 0 to 100." };
  }
  if (!rows.some((r) => r.weight > 0)) return { error: "At least one chain needs a weight above 0, or no chain will run." };
  for (const r of rows) {
    const { data, error } = await supabase.from("prompt_chain_mix").update({ weight: r.weight }).eq("chain_id", r.chain_id).select("chain_id");
    if (error) return { error: error.message };
    if (!data?.length) return { error: "A chain in the mix is gone. Reload the page." };
  }
  revalidatePath("/chains", "layout");
  return { ok: "Mix saved. New photos use it right away." };
}
