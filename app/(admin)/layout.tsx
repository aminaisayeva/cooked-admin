import Nav from "@/components/Nav";
import { requireAdmin } from "@/lib/admin";

export default async function AdminLayout({ children }: LayoutProps<"/">) {
  const { user } = await requireAdmin();
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 border-b border-line bg-surface/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center gap-x-6 px-4 py-3">
          <span className="font-semibold">🔥 cooked.ai <span className="text-muted font-normal">admin</span></span>
          <div className="ml-auto flex items-center gap-3 text-sm text-ink-2">
            <span className="hidden truncate sm:inline">{user.email}</span>
            <form action="/auth/signout" method="post">
              <button className="rounded-md border border-line px-3 py-1.5 hover:bg-wash">Sign out</button>
            </form>
          </div>
        </div>
        <div className="border-t border-line px-4 py-2 lg:hidden">
          <Nav />
        </div>
      </header>
      <div className="mx-auto flex max-w-7xl gap-8 px-4">
        <aside className="hidden w-48 shrink-0 lg:block">
          <div className="sticky top-16 py-8">
            <Nav />
          </div>
        </aside>
        <main className="min-w-0 flex-1 py-8">{children}</main>
      </div>
    </div>
  );
}
