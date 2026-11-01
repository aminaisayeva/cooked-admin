"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { MAX_CONTEXT, MAX_PHOTO_BYTES, PHOTO_BUCKET, requireAdmin } from "@/lib/admin";
import { CAPTION_STYLES, GeminiError } from "@/lib/gemini";
import { linkRequestToPhoto, runCaptionPipeline } from "@/lib/pipeline";

export type FormState = { error?: string; ok?: string } | null;

const TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const HAND_WRITTEN = "Captions written by hand in cooked-admin (no AI call).";

const str = (form: FormData, key: string) => {
  const v = form.get(key);
  return typeof v === "string" ? v.trim() : "";
};

function cleanCaption(style: string, text: string): string | null {
  if (!style || style.length > 40) return "Each caption needs a voice of at most 40 characters.";
  if (!text || text.length > 280) return "Each caption needs text of at most 280 characters.";
  return null;
}

// CREATE: upload a photo, then caption it with a prompt chain (the same
// pipeline, logged the same way, as the cooked.ai app) or with captions typed
// in by the admin.
export async function createMedia(_: FormState, form: FormData): Promise<FormState> {
  const { supabase, user } = await requireAdmin();

  const image = form.get("image");
  const context = str(form, "context").slice(0, MAX_CONTEXT) || null;
  const mode = str(form, "mode") === "manual" ? "manual" : "ai";
  if (!(image instanceof File) || image.size === 0) return { error: "Choose a photo first." };
  const ext = TYPES[image.type];
  if (!ext) return { error: "Photos must be JPEG, PNG or WebP." };
  if (image.size > MAX_PHOTO_BYTES) return { error: "That photo is over 4 MB." };
  const bytes = Buffer.from(await image.arrayBuffer());

  let captions: { style: string; text: string }[];
  let model: string;
  let systemPrompt: string;
  let pipeline: { requestId: string; chainId: string | null } | null = null;
  if (mode === "ai") {
    try {
      const result = await runCaptionPipeline(supabase, { image: { mimeType: image.type, base64: bytes.toString("base64") }, context, source: "admin" });
      captions = result.captions;
      model = result.model;
      systemPrompt = result.systemPrompt;
      pipeline = result;
    } catch (err) {
      console.error("captioning failed", err);
      return { error: err instanceof GeminiError ? err.message : "Couldn't caption that photo. Try again." };
    }
  } else {
    captions = CAPTION_STYLES.map(({ style }, i) => ({ style, text: str(form, `caption-${i}`) })).filter((c) => c.text);
    if (!captions.length) return { error: "Write at least one caption, or let Gemini write them." };
    const problem = captions.map((c) => cleanCaption(c.style, c.text)).find(Boolean);
    if (problem) return { error: problem };
    model = "hand-written";
    systemPrompt = HAND_WRITTEN;
  }

  // The image goes to Storage (the admin's own folder); the table stores its path.
  const path = `${user.id}/${Date.now()}.${ext}`;
  const { error: uploadError } = await supabase.storage
    .from(PHOTO_BUCKET)
    .upload(path, bytes, { contentType: image.type, cacheControl: "31536000" });
  if (uploadError) return { error: `Couldn't upload the photo: ${uploadError.message}` };

  const { data: photo, error: photoError } = await supabase
    .from("photos")
    .insert({ image_path: path, prompt: context, system_prompt: systemPrompt, model, chain_id: pipeline?.chainId ?? null })
    .select("id")
    .single();
  if (photoError || !photo) {
    await supabase.storage.from(PHOTO_BUCKET).remove([path]);
    return { error: `Couldn't save the photo: ${photoError?.message}` };
  }

  const { error: captionError } = await supabase
    .from("captions")
    .insert(captions.map((c, position) => ({ photo_id: photo.id, style: c.style, text: c.text, position })));
  if (captionError) {
    await supabase.from("photos").delete().eq("id", photo.id);
    await supabase.storage.from(PHOTO_BUCKET).remove([path]);
    return { error: `Couldn't save the captions: ${captionError.message}` };
  }

  if (pipeline) await linkRequestToPhoto(supabase, pipeline.requestId, photo.id);
  revalidatePath("/", "layout");
  redirect(`/media/${photo.id}?created=1`);
}

// UPDATE the uploader's context on a photo.
export async function updatePhoto(_: FormState, form: FormData): Promise<FormState> {
  const { supabase } = await requireAdmin();
  const id = str(form, "id");
  const prompt = str(form, "prompt");
  if (prompt.length > MAX_CONTEXT) return { error: `Context can be at most ${MAX_CONTEXT} characters.` };
  const { data, error } = await supabase.from("photos").update({ prompt: prompt || null }).eq("id", id).select("id");
  if (error) return { error: error.message };
  if (!data?.length) return { error: "That photo is gone, or you can't edit it." };
  revalidatePath(`/media/${id}`);
  return { ok: "Saved." };
}

// UPDATE one caption's voice, text or order.
export async function updateCaption(_: FormState, form: FormData): Promise<FormState> {
  const { supabase } = await requireAdmin();
  const id = str(form, "id");
  const style = str(form, "style");
  const text = str(form, "text");
  const position = Number(str(form, "position"));
  const problem = cleanCaption(style, text);
  if (problem) return { error: problem };
  if (!Number.isInteger(position) || position < 0 || position > 100) return { error: "Order must be a whole number from 0 to 100." };
  const { data, error } = await supabase.from("captions").update({ style, text, position }).eq("id", id).select("photo_id");
  if (error) return { error: error.message };
  if (!data?.length) return { error: "That caption is gone, or you can't edit it." };
  revalidatePath(`/media/${data[0].photo_id}`);
  return { ok: "Saved." };
}

// CREATE one more caption on an existing photo.
export async function addCaption(_: FormState, form: FormData): Promise<FormState> {
  const { supabase } = await requireAdmin();
  const photoId = str(form, "photo_id");
  const style = str(form, "style");
  const text = str(form, "text");
  const problem = cleanCaption(style, text);
  if (problem) return { error: problem };
  const { count } = await supabase.from("captions").select("id", { count: "exact", head: true }).eq("photo_id", photoId);
  const { error } = await supabase.from("captions").insert({ photo_id: photoId, style, text, position: count ?? 0 });
  if (error) return { error: error.message };
  revalidatePath(`/media/${photoId}`);
  return { ok: "Caption added." };
}

// DELETE one caption (its votes go with it).
export async function deleteCaption(form: FormData) {
  const { supabase } = await requireAdmin();
  const id = str(form, "id");
  const { data } = await supabase.from("captions").delete().eq("id", id).select("photo_id");
  if (data?.[0]) revalidatePath(`/media/${data[0].photo_id}`);
}

// DELETE a whole post: the row (captions and votes cascade) and its file.
export async function deletePhoto(form: FormData) {
  const { supabase } = await requireAdmin();
  const id = str(form, "id");
  const { data } = await supabase.from("photos").delete().eq("id", id).select("image_path");
  if (data?.[0]) await supabase.storage.from(PHOTO_BUCKET).remove([data[0].image_path]);
  revalidatePath("/", "layout");
  redirect("/media?deleted=1");
}
