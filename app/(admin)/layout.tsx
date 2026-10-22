import Nav from "@/components/Nav";
import { requireAdmin } from "@/lib/admin";

export default async function AdminLayout({ children }: LayoutProps<"/">) {
  const { user } = await requireAdmin();
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 border-b border-line bg-surface/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <span className="font-semibold">🔥 cooked.ai <span className="text-muted font-normal">admin</span></span>
          <Nav />
          <div className="ml-auto flex items-center gap-3 text-sm text-ink-2">
            <span className="hidden truncate sm:inline">{user.email}</span>
            <form action="/auth/signout" method="post">
              <button className="rounded-md border border-line px-3 py-1.5 hover:bg-wash">Sign out</button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
    </div>
  );
}
