// Small, dependency-free charts. Each mark has a hover/focus tooltip; text
// always uses ink colors, the colored mark beside it carries identity.

import type { ReactNode } from "react";

export function Card({ title, note, children, className = "" }: { title: string; note?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-xl border border-line bg-surface p-5 ${className}`}>
      <h2 className="text-sm font-semibold text-ink">{title}</h2>
      {note && <p className="mt-0.5 text-xs text-muted">{note}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

export function StatTile({ label, value, detail }: { label: string; value: ReactNode; detail?: ReactNode }) {
  return (
    <div className="rounded-xl border border-line bg-surface px-4 py-3">
      <p className="text-xs text-ink-2">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-ink">{value}</p>
      {detail && <p className="mt-0.5 text-xs text-muted">{detail}</p>}
    </div>
  );
}

function Tip({ children }: { children: ReactNode }) {
  return (
    <span className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 hidden -translate-x-1/2 rounded-md border border-line bg-surface px-2 py-1 text-xs whitespace-nowrap text-ink shadow-md group-hover:block group-focus:block">
      {children}
    </span>
  );
}

// One series over time. The card title names it, so no legend.
export function ColumnChart({ data, color, unit }: { data: { label: string; value: number }[]; color: string; unit: string }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const total = data.reduce((n, d) => n + d.value, 0);
  return (
    <div>
      <p className="mb-2 text-xs text-muted">
        {total.toLocaleString()} {unit} · peak {max.toLocaleString()} in a day
      </p>
      <div className="relative flex h-32 items-end gap-[2px] border-b border-axis">
        <span className="absolute top-0 left-0 right-0 border-t border-dashed border-line" aria-hidden />
        {data.map((d) => (
          <div key={d.label} tabIndex={0} className="group relative flex h-full flex-1 items-end outline-none">
            <div
              className="w-full rounded-t-[4px] transition-opacity group-hover:opacity-80"
              style={{ height: `${(d.value / max) * 100}%`, minHeight: d.value ? 2 : 0, background: color }}
            />
            <Tip>
              {d.label}: <b>{d.value}</b> {unit}
            </Tip>
          </div>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[11px] text-muted tabular-nums">
        <span>{data[0]?.label}</span>
        <span>{data[Math.floor(data.length / 2)]?.label}</span>
        <span>{data.at(-1)?.label}</span>
      </div>
    </div>
  );
}

// Horizontal bars, every bar directly labeled with its name and value.
export function BarList({
  rows,
  max,
}: {
  rows: { key: string; label: ReactNode; value: number; display: ReactNode; color: string; tip?: ReactNode }[];
  max?: number;
}) {
  const top = max ?? Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="space-y-3">
      {rows.map((r) => (
        <li key={r.key} tabIndex={0} className="group relative outline-none">
          <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
            <span className="text-ink">{r.label}</span>
            <span className="font-medium text-ink tabular-nums">{r.display}</span>
          </div>
          <div className="h-2.5 rounded-[4px] bg-wash">
            <div className="h-full rounded-[4px]" style={{ width: `${Math.max(r.value > 0 ? 1.5 : 0, (r.value / top) * 100)}%`, background: r.color }} />
          </div>
          {r.tip && <Tip>{r.tip}</Tip>}
        </li>
      ))}
    </ul>
  );
}

const SEQ = ["var(--seq-1)", "var(--seq-2)", "var(--seq-3)", "var(--seq-4)", "var(--seq-5)", "var(--seq-6)", "var(--seq-7)"];

// Weekday x hour grid on a one-hue ramp; empty cells recede to the surface.
export function Heatmap({ rows, grid, unit }: { rows: string[]; grid: number[][]; unit: string }) {
  const max = Math.max(1, ...grid.flat());
  const hourLabel = (h: number) => (h === 0 ? "12a" : h < 12 ? `${h}a` : h === 12 ? "12p" : `${h - 12}p`);
  const step = (v: number) => (v === 0 ? "var(--wash)" : SEQ[Math.min(SEQ.length - 1, Math.floor((v / max) * (SEQ.length - 1) + 0.5))]);
  return (
    <div className="overflow-x-auto">
      <div className="min-w-[560px]">
        {grid.map((row, d) => (
          <div key={rows[d]} className="flex items-center gap-[2px] py-[1px]">
            <span className="w-9 shrink-0 text-[11px] text-muted">{rows[d]}</span>
            {row.map((v, h) => (
              <div key={h} tabIndex={0} className="group relative h-5 flex-1 rounded-[3px] outline-none" style={{ background: step(v) }}>
                <Tip>
                  {rows[d]} {hourLabel(h)}–{hourLabel((h + 1) % 24)}: <b>{v}</b> {unit}
                </Tip>
              </div>
            ))}
          </div>
        ))}
        <div className="flex gap-[2px] pl-9 text-[11px] text-muted">
          {Array.from({ length: 24 }, (_, h) => (
            <span key={h} className="flex-1 text-center">
              {h % 3 === 0 ? hourLabel(h) : ""}
            </span>
          ))}
        </div>
        <div className="mt-3 flex items-center gap-2 pl-9 text-[11px] text-muted">
          <span>0</span>
          {SEQ.map((c) => (
            <span key={c} className="h-2.5 w-5 rounded-[2px]" style={{ background: c }} />
          ))}
          <span>
            {max} {unit}
          </span>
        </div>
      </div>
    </div>
  );
}
