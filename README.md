# cooked.ai admin

**Live:** https://cooked-admin-inky.vercel.app (superadmins only)

The admin area for [cooked.ai](https://github.com/aminaisayeva/will-you-give-me-an-a): stats, the four voices, users, images and captions, votes, and the whole AI caption pipeline (prompt chains, models, providers, terms, examples, every request and model response), plus who may sign up. All of it reads straight from the same Supabase database.

## Pages

| Route | What it does |
| --- | --- |
| `/` | **Stats.** Which of the four voices cooks hardest (win share and average score), posts/votes/sign-ups per day, a weekday × hour heatmap of when campus is active, the sign-up funnel, which Gemini model answered, the best, burnt and most controversial captions, top cooks, most active voters and the harshest critic. |
| `/users` | **READ users/profiles.** Every account with its @username, email, join date, pics, score and votes cast. Search and sort. |
| `/media` | **READ AI-generated media.** Every post (photo + its AI captions). Search, sort, filter by uploader. |
| `/media/new` | **CREATE.** Upload a photo and have Gemini caption it (same system prompt and voices as the app), or write the captions by hand. |
| `/media/<id>` | **UPDATE / DELETE.** Edit the context, edit any caption's voice/text/order, add captions, delete captions, delete the whole post (row, captions, votes and the Storage file). |
| `/votes` | **READ votes/ratings.** Every vote (who, which caption, up/down, when; filter by voter or direction) and per-caption ratings (▲, ▼, score, up share). |
| `/voices` | **Voice stats.** Whose voice gets the upvotes, approval rate per voice (most divisive), teams (each voter's favourite voice) and loyalty, head-to-head win rates, first-caption bias, caption length vs score, chain × voice scores, Voice League history and every voter's upvote split. |
| `/chains` | **READ prompt chains, READ/UPDATE the mix.** Each chain's steps, weight, photos, average score, success rate and median time; edit the mix weights. |
| `/chains/<id>` | **READ prompt chain steps.** Each step's full instructions, whether it sees the photo, its pinned model, and recent runs. |
| `/requests`, `/requests/<id>` | **READ generation requests.** One per photo sent to the AI: chain, who, context, status, time, captions; open one for every model call. |
| `/responses` | **READ LLM responses.** Every model call (retries and fallbacks too) with the raw answer, HTTP status, tokens and time, plus per-model reliability. |
| `/models` | **CRUD LLM models** (API id, priority, temperature, max tokens, active). |
| `/providers` | **CRUD LLM providers** (slug, base URL, the *name* of the key's env var). |
| `/terms` | **CRUD terms**: the campus glossary pasted into every caption prompt. |
| `/examples` | **CRUD AI generation examples**: few-shot captions per voice. |
| `/signups` | **CRUD allowed sign-up domains and whitelisted email addresses.** Enforced by a trigger on `auth.users`, for email and Google sign-ups. |

### How the pipeline uses these tables

When someone posts a photo (in the app, or at `/media/new` here), the app picks an active prompt chain at random by the **mix** weights and runs its **steps** in order. Each step's instructions get `{{voices}}`, `{{terms}}`, `{{examples}}`, `{{previous}}` (the last step's notes) and `{{standings}}` (this week's Voice League, so the voices can trash-talk) filled in. The **models** are tried by priority, moving on when one is overloaded. Every photo gets a **generation request** row, and every model call gets an **LLM response** row with the full prompt and answer.

Images: `/media/new` uploads (CREATE), `/media` lists (READ), `/media/<id>` edits the context and captions (UPDATE) and deletes the post and its file (DELETE).

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

1. Apply `supabase/admin.sql`, then `supabase/pipeline.sql`, to the cooked.ai Supabase project, then set your own flag (above).
2. In Supabase → Authentication → URL Configuration, add `https://<admin-domain>/auth/callback` (and `http://localhost:3000/auth/callback`) to the Redirect URLs.
3. Env vars (`.env.local` and Vercel): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and optionally `GEMINI_API_KEY` / `GEMINI_MODEL` for AI captions.

```bash
npm install
cp .env.example .env.local
npm run dev
```

Built with Next.js 16 (App Router), Tailwind CSS v4 and Supabase (`@supabase/ssr`). Charts are plain HTML/CSS, no chart library.
