import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// The only pages a signed-out visitor can reach. Everything else, including
// Server Actions (they POST to page URLs), needs a Google sign-in, and
// everything except /denied needs profiles.is_superadmin.
const PUBLIC = ["/login", "/auth/callback"];
const SIGNED_IN_ONLY = ["/denied", "/auth/signout"];

const matches = (pathname: string, paths: string[]) =>
  paths.some((p) => pathname === p || pathname.startsWith(`${p}/`));

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Refreshes an expired session. Don't put code between createServerClient
  // and getUser().
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const redirectTo = (path: string) => {
    const url = request.nextUrl.clone();
    url.pathname = path;
    url.search = "";
    const redirect = NextResponse.redirect(url);
    response.cookies.getAll().forEach((c) => redirect.cookies.set(c));
    return redirect;
  };

  if (matches(pathname, PUBLIC)) return response;
  if (!user) return redirectTo("/login");
  if (matches(pathname, SIGNED_IN_ONLY)) return response;

  const { data: me } = await supabase.from("profiles").select("is_superadmin").eq("id", user.id).maybeSingle();
  if (!me?.is_superadmin) return redirectTo("/denied");

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
