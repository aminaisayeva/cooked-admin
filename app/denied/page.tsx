import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "No access" };

export default async function DeniedPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <main className="grid min-h-screen place-items-center bg-page px-4">
      <div className="w-full max-w-sm rounded-2xl border border-line bg-surface p-8 shadow-sm">
        <p className="text-2xl">🚫</p>
        <h1 className="mt-3 text-xl font-semibold text-ink">You’re not an admin</h1>
        <p className="mt-1 text-sm text-ink-2">
          {user?.email ?? "This account"} is signed in, but it doesn’t have <code className="font-mono text-xs">is_superadmin</code> on its
          profile, so the admin area stays locked.
        </p>
        <form action="/auth/signout" method="post" className="mt-6">
          <button className="w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-on-accent hover:opacity-90">
            Sign out and try another account
          </button>
        </form>
      </div>
    </main>
  );
}
