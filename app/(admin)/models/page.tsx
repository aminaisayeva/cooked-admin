import type { Metadata } from "next";
import CrudSection from "@/components/crud/CrudSection";
import { requireAdmin, textParam } from "@/lib/admin";

export const metadata: Metadata = { title: "Models" };

export default async function Page({ searchParams }: PageProps<"/models">) {
  const { supabase } = await requireAdmin();
  const { q } = await searchParams;
  return <CrudSection supabase={supabase} entityKey="models" q={textParam(q)} />;
}
