-- cooked-admin: superadmins. Applied to the cooked.ai Supabase project as
-- migration "superadmins". The admin app uses the anon key and the signed-in
-- admin's session (no service-role key), so everything an admin can do is
-- granted here, by row level security, only to profiles.is_superadmin = true.

alter table public.profiles
  add column is_superadmin boolean not null default false;

-- Users may update their own profile row (names, avatar). They must never be
-- able to promote themselves, so the flag can only change outside the API
-- (the SQL editor / a migration, running as postgres).
create function public.profiles_lock_superadmin()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('anon', 'authenticated') then
    new.is_superadmin := old.is_superadmin;
  end if;
  return new;
end;
$$;

create trigger profiles_lock_superadmin
  before update on public.profiles
  for each row execute function public.profiles_lock_superadmin();

-- Whether the signed-in user is a superadmin. Security definer so policies on
-- profiles itself can call it without recursing.
create function public.is_superadmin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select p.is_superadmin from public.profiles p where p.id = (select auth.uid())), false);
$$;

revoke execute on function public.is_superadmin() from public, anon;
grant execute on function public.is_superadmin() to authenticated;

-- READ users/profiles ------------------------------------------------------

create policy "Superadmins read every profile"
  on public.profiles for select to authenticated
  using ((select public.is_superadmin()));

-- READ votes (otherwise private to each voter) ----------------------------

create policy "Superadmins read every caption vote"
  on public.caption_votes for select to authenticated
  using ((select public.is_superadmin()));

-- CRUD AI-generated media (photos + their captions) -----------------------

-- Admins post into their own folder (photos_own_folder still applies) without
-- needing a cooked.ai @username.
create policy "Superadmins post photos"
  on public.photos for insert to authenticated
  with check (author_id = (select auth.uid()) and (select public.is_superadmin()));

grant update (prompt) on public.photos to authenticated;

create policy "Superadmins edit photos"
  on public.photos for update to authenticated
  using ((select public.is_superadmin()))
  with check ((select public.is_superadmin()));

create policy "Superadmins delete photos"
  on public.photos for delete to authenticated
  using ((select public.is_superadmin()));

create policy "Superadmins add captions"
  on public.captions for insert to authenticated
  with check ((select public.is_superadmin()));

grant update (style, text, position) on public.captions to authenticated;
grant delete on public.captions to authenticated;

create policy "Superadmins edit captions"
  on public.captions for update to authenticated
  using ((select public.is_superadmin()))
  with check ((select public.is_superadmin()));

create policy "Superadmins delete captions"
  on public.captions for delete to authenticated
  using ((select public.is_superadmin()));

-- Vote triggers keep photos.score in sync, but a deleted caption takes its
-- votes with it; recount the photo's score then too.
create function public.captions_recount_photo()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.photos p
     set score = coalesce((select sum(c.upvotes - c.downvotes) from public.captions c where c.photo_id = old.photo_id), 0)
   where p.id = old.photo_id;
  return null;
end;
$$;

revoke execute on function public.captions_recount_photo() from public, anon, authenticated;

create trigger captions_recount_photo
  after delete on public.captions
  for each row execute function public.captions_recount_photo();

-- Storage: admins can remove any photo file when they delete a post.
create policy "Superadmins delete any photo file"
  on storage.objects for delete to authenticated
  using (bucket_id = 'photos' and (select public.is_superadmin()));

-- Bootstrapping (the "won't you be locked out?" question): nobody can set the
-- flag through the app, so the first admin is set here, as postgres:
--   update public.profiles set is_superadmin = true where email = '<your google email>';
