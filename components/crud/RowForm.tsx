"use client";

import { useActionState, useEffect, useRef } from "react";
import { deleteRow, saveRow, type CrudState } from "@/app/actions/crud";
import { input, primary, secondary } from "@/components/media/forms";
import { entity, type Values } from "@/lib/crud";

function Status({ state }: { state: CrudState }) {
  if (state?.error) return <p role="alert" className="text-sm text-critical">{state.error}</p>;
  if (state?.ok) return <p role="status" className="text-sm text-good">{state.ok}</p>;
  return null;
}

// Add a row (no `row`) or edit one, for any table in lib/crud.ts.
export function RowForm({ entityKey, row, options = {} }: { entityKey: string; row?: Values & { id: string }; options?: Record<string, [string, string][]> }) {
  const e = entity(entityKey);
  const [state, action, pending] = useActionState(saveRow.bind(null, entityKey), null);
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (!row && state?.ok) form.current?.reset();
  }, [row, state]);

  return (
    <form ref={form} action={action} className="grid gap-3 sm:grid-cols-2">
      {row && <input type="hidden" name="id" value={row.id} />}
      {e.fields.map((f) => {
        const id = `${entityKey}-${row?.id ?? "new"}-${f.name}`;
        const value = row ? row[f.name] : f.defaultValue;
        if (f.kind === "boolean") {
          return (
            <label key={f.name} htmlFor={id} className="flex items-center gap-2 self-end text-sm">
              <input id={id} name={f.name} type="checkbox" defaultChecked={Boolean(value)} className="h-4 w-4 accent-[var(--accent)]" />
              {f.label}
            </label>
          );
        }
        const opts = f.options ?? options[f.name] ?? [];
        return (
          <div key={f.name} className={f.kind === "textarea" ? "sm:col-span-2" : undefined}>
            <label htmlFor={id} className="mb-1 block text-xs font-medium text-ink-2">
              {f.label}
              {!f.required && <span className="font-normal text-muted"> (optional)</span>}
            </label>
            {f.kind === "textarea" ? (
              <textarea id={id} name={f.name} defaultValue={String(value ?? "")} maxLength={f.max} required={f.required} rows={2} placeholder={f.placeholder} className={input} />
            ) : f.kind === "select" ? (
              <select id={id} name={f.name} defaultValue={String(value ?? "")} required={f.required} className={input}>
                <option value="" disabled>
                  Choose…
                </option>
                {opts.map(([v, label]) => (
                  <option key={v} value={v}>
                    {label}
                  </option>
                ))}
              </select>
            ) : (
              <input
                id={id}
                name={f.name}
                type={f.kind === "number" ? "number" : "text"}
                defaultValue={value === null || value === undefined ? "" : String(value)}
                maxLength={f.kind === "text" ? f.max : undefined}
                min={f.kind === "number" ? f.min : undefined}
                max={f.kind === "number" ? f.max : undefined}
                step={f.kind === "number" ? f.step : undefined}
                required={f.required}
                placeholder={f.placeholder}
                className={input}
              />
            )}
            {f.help && <p className="mt-1 text-xs text-muted">{f.help}</p>}
          </div>
        );
      })}
      <div className="flex items-center gap-3 sm:col-span-2">
        <button disabled={pending} className={row ? secondary : primary}>
          {pending ? "Saving…" : row ? "Save changes" : `Add ${e.singular}`}
        </button>
        <Status state={state} />
      </div>
    </form>
  );
}

export function DeleteRow({ entityKey, id, label }: { entityKey: string; id: string; label: string }) {
  const [state, action, pending] = useActionState(deleteRow.bind(null, entityKey), null);
  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="id" value={id} />
      <button
        disabled={pending}
        onClick={(ev) => {
          if (!confirm(`Delete ${label}? This can't be undone.`)) ev.preventDefault();
        }}
        className="text-sm text-critical hover:underline disabled:opacity-60"
      >
        {pending ? "Deleting…" : "Delete"}
      </button>
      {state?.error && <span role="alert" className="text-xs text-critical">{state.error}</span>}
    </form>
  );
}
