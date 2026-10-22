"use client";

import { startTransition, useActionState, useState } from "react";
import { createMedia } from "@/app/actions/media";
import { input, primary, Status } from "./forms";

const VOICES = ["Chronically Online", "Midwest Mom", "Real New Yorker", "Columbia Tour Guide"];
const MAX_SIDE = 1600;

// Shrink big photos in the browser so they fit under the 4 MB upload cap.
async function resize(file: File): Promise<File> {
  if (file.size < 1.5 * 1024 * 1024 || !file.type.startsWith("image/")) return file;
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
  return blob ? new File([blob], file.name.replace(/\.\w+$/, ".jpg"), { type: "image/jpeg" }) : file;
}

export default function NewMediaForm({ aiReady }: { aiReady: boolean }) {
  const [state, action, pending] = useActionState(createMedia, null);
  const [preview, setPreview] = useState<string | null>(null);
  const [mode, setMode] = useState<"ai" | "manual">(aiReady ? "ai" : "manual");

  async function submit(form: FormData) {
    const image = form.get("image");
    if (image instanceof File && image.size) form.set("image", await resize(image));
    // After the await we're outside the form's transition; start a new one.
    startTransition(() => action(form));
  }

  return (
    <form action={submit} className="grid gap-6 md:grid-cols-[280px_1fr]">
      <label className="grid aspect-square cursor-pointer place-items-center overflow-hidden rounded-xl border border-dashed border-axis bg-wash text-sm text-ink-2 hover:border-ink-2">
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="Selected photo" className="size-full object-cover" />
        ) : (
          <span>📷 Choose a photo (JPEG, PNG, WebP)</span>
        )}
        <input
          type="file"
          name="image"
          accept="image/jpeg,image/png,image/webp"
          required
          className="sr-only"
          onChange={(e) => {
            const file = e.target.files?.[0];
            setPreview(file ? URL.createObjectURL(file) : null);
          }}
        />
      </label>

      <div className="space-y-5">
        <div>
          <label className="mb-1 block text-xs font-medium text-ink-2" htmlFor="context">
            Context (optional, 140 characters)
          </label>
          <input id="context" name="context" maxLength={140} placeholder="e.g. my dorm after midterms" className={input} />
        </div>

        <fieldset>
          <legend className="mb-2 text-xs font-medium text-ink-2">Captions</legend>
          <input type="hidden" name="mode" value={mode} />
          <div className="flex flex-wrap gap-2">
            {(
              [
                ["ai", "✨ Generate with Gemini"],
                ["manual", "✍️ Write them myself"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                disabled={value === "ai" && !aiReady}
                onClick={() => setMode(value)}
                className={`rounded-lg border px-3 py-2 text-sm disabled:opacity-50 ${
                  mode === value ? "border-ink bg-wash font-medium" : "border-line bg-surface hover:bg-wash"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {!aiReady && <p className="mt-2 text-xs text-muted">GEMINI_API_KEY isn’t set on this deployment, so only hand-written captions work.</p>}
        </fieldset>

        {mode === "ai" ? (
          <p className="text-sm text-ink-2">
            Gemini looks at the photo and writes one caption in each of the four cooked.ai voices, using the exact system prompt the main app uses.
          </p>
        ) : (
          <div className="space-y-3">
            {VOICES.map((voice, i) => (
              <div key={voice}>
                <label className="mb-1 block text-xs text-ink-2" htmlFor={`caption-${i}`}>
                  {voice}
                </label>
                <textarea id={`caption-${i}`} name={`caption-${i}`} maxLength={280} rows={2} className={input} />
              </div>
            ))}
            <p className="text-xs text-muted">Leave a voice empty to skip it.</p>
          </div>
        )}

        <div className="flex items-center gap-3">
          <button disabled={pending} className={primary}>
            {pending ? (mode === "ai" ? "Cooking…" : "Saving…") : "Create post"}
          </button>
          <Status state={state} />
        </div>
      </div>
    </form>
  );
}
