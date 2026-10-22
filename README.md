# cooked.ai admin

The admin area for [cooked.ai](https://github.com/aminaisayeva/will-you-give-me-an-a): stats, users, AI-generated media and votes, read straight from the same Supabase database.

## Pages

| Route | What it does |
| --- | --- |
| `/` | **Stats.** Which of the four voices cooks hardest (win share and average score), posts/votes/sign-ups per day, a weekday × hour heatmap of when campus is active, the sign-up funnel, which Gemini model answered, the best, burnt and most controversial captions, top cooks, most active voters and the harshest critic. |
| `/users` | **READ users/profiles.** Every account with its @username, email, join date, pics, score and votes cast. Search and sort. |
| `/media` | **READ AI-generated media.** Every post (photo + its AI captions). Search, sort, filter by uploader. |
| `/media/new` | **CREATE.** Upload a photo and have Gemini caption it (same system prompt and voices as the app), or write the captions by hand. |
| `/media/<id>` | **UPDATE / DELETE.** Edit the context, edit any caption's voice/text/order, add captions, delete captions, delete the whole post (row, captions, votes and the Storage file). |
| `/votes` | **READ votes/ratings.** Every vote (who, which caption, up/down, when; filter by voter or direction) and per-caption ratings (▲, ▼, score, up share). |

## Security

- **Google login wall.** `proxy.ts` runs on every route. Signed out, everything except `/login` and `/auth/callback` redirects to `/login`, which only offers *Continue with Google*. Signed in without `profiles.is_superadmin`, everything redirects to `/denied`.
- **Checked again on the server.** The admin layout, every page and every Server Action call `requireAdmin()`.
- **Enforced by the database.** The app only has the anon key, never a service-role key. Admin reads and writes are allowed by row level security policies that call `public.is_superadmin()` (`supabase/admin.sql`). Without the flag, the database refuses them even if someone gets past the app.
- **Nobody can promote themselves.** A trigger (`profiles_lock_superadmin`) drops any change to `is_superadmin` made through the API, so the flag can only be set from the Supabase SQL editor or a migration.

### "Won't I be locked out?"

Yes, if the only way to become an admin were the admin area itself. So the first admin isn't made in the app: I set the flag directly in the database as the `postgres` role (the Supabase SQL editor / a migration), which bypasses RLS and the lock trigger:

```sql
update public.profiles set is_superadmin = true where email = '<my google email>';
```

That account then signs in with Google like anyone else. More admins can be added the same way.

## Setup

1. Apply `supabase/admin.sql` to the cooked.ai Supabase project, then set your own flag (above).
2. In Supabase → Authentication → URL Configuration, add `https://<admin-domain>/auth/callback` (and `http://localhost:3000/auth/callback`) to the Redirect URLs.
3. Env vars (`.env.local` and Vercel): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and optionally `GEMINI_API_KEY` / `GEMINI_MODEL` for AI captions.

```bash
npm install
cp .env.example .env.local
npm run dev
```

Built with Next.js 16 (App Router), Tailwind CSS v4 and Supabase (`@supabase/ssr`). Charts are plain HTML/CSS, no chart library.
