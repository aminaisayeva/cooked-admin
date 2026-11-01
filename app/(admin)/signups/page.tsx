import type { Metadata } from "next";
import CrudSection from "@/components/crud/CrudSection";
import { requireAdmin } from "@/lib/admin";

export const metadata: Metadata = { title: "Sign-ups" };

// Who may create a cooked.ai account. Enforced by a trigger on auth.users.
export default async function SignupsPage() {
  const { supabase } = await requireAdmin();
  const { count } = await supabase.from("allowed_signup_domains").select("id", { count: "exact", head: true });
  return (
    <div className="space-y-12">
      <div>
        <h1 className="text-2xl font-semibold">Sign-ups</h1>
        <p className="mt-3 rounded-lg bg-wash px-3 py-2 text-sm">
        {count
          ? "Sign-ups are limited: a new account needs an allowed domain or a whitelisted address."
          : "Sign-ups are open to everyone, because no domain is listed."}
        </p>
      </div>
      <CrudSection supabase={supabase} entityKey="domains" searchable={false} heading="h2" />
      <CrudSection supabase={supabase} entityKey="whitelist" searchable={false} heading="h2" />
    </div>
  );
}
