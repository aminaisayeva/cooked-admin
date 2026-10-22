import Link from "next/link";

export default function NotFound() {
  return (
    <main className="grid min-h-[60vh] place-items-center px-4 text-center">
      <div>
        <h1 className="text-xl font-semibold">Not found</h1>
        <p className="mt-1 text-sm text-ink-2">That page or post doesn’t exist (maybe it was deleted).</p>
        <Link href="/" className="mt-4 inline-block text-sm underline">Back to stats</Link>
      </div>
    </main>
  );
}
