"use client";

import { useActionState, useState } from "react";
import { updateMix } from "@/app/actions/chains";
import { input, primary, Status } from "@/components/media/forms";

// Edit the weights; the shares update as you type.
export default function MixForm({ chains }: { chains: { id: string; name: string; weight: number; active: boolean }[] }) {
  const [state, action, pending] = useActionState(updateMix, null);
  const [weights, setWeights] = useState(() => Object.fromEntries(chains.map((c) => [c.id, c.weight])));
  const total = chains.reduce((s, c) => s + (c.active ? Number(weights[c.id]) || 0 : 0), 0);

  return (
    <form action={action} className="space-y-3">
      <ul className="space-y-2">
        {chains.map((c) => {
          const w = Number(weights[c.id]) || 0;
          const share = c.active && total ? w / total : 0;
          return (
            <li key={c.id} className="grid grid-cols-[minmax(0,1fr)_5.5rem_8rem] items-center gap-3 text-sm">
              <label htmlFor={`w-${c.id}`} className="truncate">
                {c.name}
                {!c.active && <span className="text-muted"> (inactive)</span>}
              </label>
              <input
                id={`w-${c.id}`}
                name={`weight:${c.id}`}
                type="number"
                min={0}
                max={100}
                step={1}
                value={weights[c.id]}
                onChange={(e) => setWeights((ws) => ({ ...ws, [c.id]: Number(e.target.value) }))}
                className={`${input} tabular-nums`}
              />
              <span className="flex items-center gap-2">
                <span className="h-2 flex-1 overflow-hidden rounded-full bg-wash" aria-hidden="true">
                  <span className="block h-full rounded-full bg-[var(--series-1)]" style={{ width: `${share * 100}%` }} />
                </span>
                <span className="w-10 text-right tabular-nums text-ink-2">{Math.round(share * 100)}%</span>
              </span>
            </li>
          );
        })}
      </ul>
      <div className="flex items-center gap-3">
        <button disabled={pending} className={primary}>
          {pending ? "Saving…" : "Save mix"}
        </button>
        <Status state={state} />
      </div>
    </form>
  );
}
