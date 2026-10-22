import type { Metadata } from "next";
import Link from "next/link";
import NewMediaForm from "@/components/media/NewMediaForm";
import { requireAdmin } from "@/lib/admin";

export const metadata: Metadata = { title: "New post" };

export default async function NewMediaPage() {
  await requireAdmin();
  return (
    <div>
      <Link href="/media" className="text-sm text-ink-2 hover:text-ink">← All media</Link>
      <h1 className="mt-2 text-2xl font-semibold">New post</h1>
      <p className="mt-1 mb-6 text-sm text-ink-2">It shows up in the cooked.ai feed under your name, like any other post.</p>
      <NewMediaForm aiReady={Boolean(process.env.GEMINI_API_KEY)} />
    </div>
  );
}
