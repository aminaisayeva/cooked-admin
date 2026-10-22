import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import GoogleButton from "./GoogleButton";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect("/");
  const { error } = await searchParams;

  return (
    <main className="grid min-h-screen place-items-center bg-page px-4">
      <div className="w-full max-w-sm rounded-2xl border border-line bg-surface p-8 shadow-sm">
        <p className="text-2xl">🔥</p>
        <h1 className="mt-3 text-xl font-semibold text-ink">cooked.ai admin</h1>
        <p className="mt-1 mb-6 text-sm text-ink-2">
          Superadmins only. Sign in with the Google account that has admin access.
        </p>
        <GoogleButton />
        {typeof error === "string" && <p className="mt-4 text-sm text-critical">Sign-in didn’t work: {error}</p>}
      </div>
    </main>
  );
}
