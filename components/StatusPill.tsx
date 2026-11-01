// A request or response status, with a symbol so it isn't color alone.
export default function StatusPill({ status }: { status: string }) {
  const look =
    status === "succeeded" || status === "ok"
      ? { mark: "✓", cls: "text-good" }
      : status === "failed" || status === "error"
        ? { mark: "✕", cls: "text-critical" }
        : { mark: "…", cls: "text-ink-2" };
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border border-line px-2 py-0.5 text-xs font-medium ${look.cls}`}>
      <span aria-hidden="true">{look.mark}</span>
      {status}
    </span>
  );
}
