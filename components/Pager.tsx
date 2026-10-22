import Link from "next/link";

// Previous / next links that keep the current filters.
export default function Pager({ page, pages, params }: { page: number; pages: number; params: Record<string, string> }) {
  if (pages <= 1) return null;
  const href = (p: number) => `?${new URLSearchParams({ ...params, page: String(p) })}`;
  const link = "rounded-lg border border-line bg-surface px-3 py-1.5 text-sm hover:bg-wash";
  return (
    <div className="mt-6 flex items-center justify-center gap-3 text-sm text-ink-2">
      {page > 1 ? <Link href={href(page - 1)} className={link}>← Previous</Link> : <span className={`${link} opacity-40`}>← Previous</span>}
      <span className="tabular-nums">
        Page {page} of {pages}
      </span>
      {page < pages ? <Link href={href(page + 1)} className={link}>Next →</Link> : <span className={`${link} opacity-40`}>Next →</span>}
    </div>
  );
}
