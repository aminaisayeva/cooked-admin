"use client";

import { useActionState, useEffect, useRef } from "react";
import { addCaption, updateCaption, updatePhoto, type FormState } from "@/app/actions/media";

export const input =
  "w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-axis";
export const primary =
  "rounded-lg bg-accent px-4 py-2 text-sm font-medium text-on-accent hover:opacity-90 disabled:opacity-60";
export const secondary = "rounded-lg border border-line bg-surface px-3 py-2 text-sm hover:bg-wash disabled:opacity-60";

export function Status({ state }: { state: FormState }) {
  if (state?.error) return <p className="text-sm text-critical">{state.error}</p>;
  if (state?.ok) return <p className="text-sm text-good">{state.ok}</p>;
  return null;
}

export function ContextForm({ id, prompt }: { id: string; prompt: string | null }) {
  const [state, action, pending] = useActionState(updatePhoto, null);
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="id" value={id} />
      <label className="block text-xs font-medium text-ink-2" htmlFor="prompt">
        Uploader’s context (sent to Gemini with the photo)
      </label>
      <div className="flex gap-2">
        <input id="prompt" name="prompt" defaultValue={prompt ?? ""} maxLength={140} placeholder="No context" className={input} />
        <button disabled={pending} className={secondary}>
          {pending ? "Saving…" : "Save"}
        </button>
      </div>
      <Status state={state} />
    </form>
  );
}

export function CaptionForm({
  caption,
}: {
  caption: { id: string; style: string; text: string; position: number };
}) {
  const [state, action, pending] = useActionState(updateCaption, null);
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="id" value={caption.id} />
      <div className="flex gap-2">
        <input name="style" defaultValue={caption.style} maxLength={40} aria-label="Voice" className={`${input} max-w-52`} />
        <input
          name="position"
          type="number"
          min={0}
          max={100}
          defaultValue={caption.position}
          aria-label="Order"
          title="Order"
          className={`${input} w-20`}
        />
      </div>
      <textarea name="text" defaultValue={caption.text} maxLength={280} rows={2} aria-label="Caption" className={input} />
      <div className="flex items-center gap-3">
        <button disabled={pending} className={secondary}>
          {pending ? "Saving…" : "Save caption"}
        </button>
        <Status state={state} />
      </div>
    </form>
  );
}

export function AddCaptionForm({ photoId }: { photoId: string }) {
  const [state, action, pending] = useActionState(addCaption, null);
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) form.current?.reset();
  }, [state]);
  return (
    <form ref={form} action={action} className="space-y-2">
      <input type="hidden" name="photo_id" value={photoId} />
      <input name="style" placeholder="Voice, e.g. Midwest Mom" maxLength={40} required className={input} />
      <textarea name="text" placeholder="Caption text" maxLength={280} rows={2} required className={input} />
      <div className="flex items-center gap-3">
        <button disabled={pending} className={primary}>
          {pending ? "Adding…" : "Add caption"}
        </button>
        <Status state={state} />
      </div>
    </form>
  );
}

// A button that asks before submitting its (server action) form.
export function ConfirmButton({ message, children, className }: { message: string; children: React.ReactNode; className?: string }) {
  return (
    <button
      className={className}
      onClick={(e) => {
        if (!confirm(message)) e.preventDefault();
      }}
    >
      {children}
    </button>
  );
}
