-- cooked-admin week 7: the caption pipeline lives in the database, so the
-- admin area can see and steer it. Applied to the cooked.ai Supabase project
-- as migration "caption_pipeline" (after admin.sql).
--
--   llm_providers ─┐
--   llm_models ────┤  which models answer, in what order
--   prompt_chains ─┤  ways of writing captions, made of ordered steps
--   prompt_chain_steps
--   prompt_chain_mix   how often each chain is picked for a new photo
--   terms              campus glossary pasted into every prompt
--   generation_examples  example captions per voice (few-shot)
--   generation_requests  one row per photo sent to the AI
--   llm_responses        one row per model call, with the prompt and answer
--   allowed_signup_domains / whitelisted_emails  who may create an account
--
-- The cooked.ai app reads the configuration with the anon key (the prompt is
-- already public through "See the prompt"). Only superadmins change it.

-- Providers and models ------------------------------------------------------

create table public.llm_providers (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (char_length(name) between 1 and 60),
  -- The app knows how to call these; anything else is skipped and logged.
  slug text not null unique check (slug ~ '^[a-z0-9-]{2,40}$'),
  api_base_url text check (api_base_url is null or api_base_url ~ '^https://'),
  -- Name of the server env var that holds the key. Never the key itself.
  api_key_env text check (api_key_env is null or api_key_env ~ '^[A-Z][A-Z0-9_]{1,63}$'),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.llm_models (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.llm_providers (id) on delete restrict,
  name text not null check (char_length(name) between 1 and 80),
  -- The id sent to the provider's API, e.g. gemini-flash-latest.
  api_model_id text not null check (char_length(api_model_id) between 1 and 120),
  is_active boolean not null default true,
  -- Tried in this order (lowest first) when a step doesn't name a model.
  priority smallint not null default 0 check (priority between 0 and 1000),
  temperature numeric(3, 2) not null default 1 check (temperature between 0 and 2),
  max_output_tokens integer not null default 2000 check (max_output_tokens between 64 and 32000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider_id, api_model_id)
);

create index llm_models_provider_idx on public.llm_models (provider_id);

-- Prompt chains -------------------------------------------------------------

create table public.prompt_chains (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (char_length(name) between 1 and 80),
  description text not null default '' check (char_length(description) <= 500),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Steps run in order. Each step's answer is handed to the next as
-- {{previous}}; the last step must return the captions.
create table public.prompt_chain_steps (
  id uuid primary key default gen_random_uuid(),
  chain_id uuid not null references public.prompt_chains (id) on delete cascade,
  step_order smallint not null check (step_order between 1 and 10),
  name text not null check (char_length(name) between 1 and 80),
  -- System instructions. Placeholders: {{voices}} {{standings}} {{terms}}
  -- {{examples}} {{previous}}.
  instructions text not null check (char_length(instructions) between 1 and 20000),
  include_image boolean not null default true,
  -- null = the default model order (llm_models.priority).
  model_id uuid references public.llm_models (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (chain_id, step_order)
);

create index prompt_chain_steps_model_idx on public.prompt_chain_steps (model_id);

-- One row per chain: its weight when a new photo picks a chain at random.
-- 0 switches the chain off without deleting it.
create table public.prompt_chain_mix (
  chain_id uuid primary key references public.prompt_chains (id) on delete cascade,
  weight smallint not null default 0 check (weight between 0 and 100),
  updated_at timestamptz not null default now()
);

create function public.prompt_chains_add_mix()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.prompt_chain_mix (chain_id) values (new.id) on conflict do nothing;
  return null;
end;
$$;

revoke execute on function public.prompt_chains_add_mix() from public, anon, authenticated;

create trigger prompt_chains_add_mix
  after insert on public.prompt_chains
  for each row execute function public.prompt_chains_add_mix();

-- Terms and examples --------------------------------------------------------

create table public.terms (
  id uuid primary key default gen_random_uuid(),
  term text not null unique check (char_length(term) between 1 and 60),
  definition text not null check (char_length(definition) between 1 and 300),
  example text check (example is null or char_length(example) <= 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.generation_examples (
  id uuid primary key default gen_random_uuid(),
  -- The voice this example is for (one of the four on cooked.ai).
  voice text not null check (char_length(voice) between 1 and 40),
  photo_description text not null check (char_length(photo_description) between 1 and 300),
  caption text not null check (char_length(caption) between 1 and 280),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Logs ----------------------------------------------------------------------

create table public.generation_requests (
  -- Made by the app, so it can log responses without reading the row back.
  id uuid primary key,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  chain_id uuid references public.prompt_chains (id) on delete set null,
  photo_id uuid references public.photos (id) on delete set null,
  source text not null default 'app' check (source in ('app', 'admin')),
  context text check (context is null or char_length(context) <= 140),
  status text not null default 'running' check (status in ('running', 'succeeded', 'failed')),
  error text check (error is null or char_length(error) <= 1000),
  caption_count smallint,
  duration_ms integer,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);

create index generation_requests_created_idx on public.generation_requests (created_at desc);
create index generation_requests_user_idx on public.generation_requests (user_id);
create index generation_requests_chain_idx on public.generation_requests (chain_id);
create index generation_requests_photo_idx on public.generation_requests (photo_id);

create table public.llm_responses (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.generation_requests (id) on delete cascade,
  step_id uuid references public.prompt_chain_steps (id) on delete set null,
  step_order smallint not null,
  model_id uuid references public.llm_models (id) on delete set null,
  model_name text not null check (char_length(model_name) <= 120),
  system_prompt text not null,
  user_message text not null,
  response_text text,
  status text not null check (status in ('ok', 'error')),
  http_status smallint,
  error text check (error is null or char_length(error) <= 1000),
  prompt_tokens integer,
  output_tokens integer,
  duration_ms integer not null,
  created_at timestamptz not null default now()
);

create index llm_responses_request_idx on public.llm_responses (request_id, created_at);
create index llm_responses_created_idx on public.llm_responses (created_at desc);
create index llm_responses_step_idx on public.llm_responses (step_id);
create index llm_responses_model_idx on public.llm_responses (model_id);

-- Which chain wrote each photo's captions, for comparing chains.
alter table public.photos add column chain_id uuid references public.prompt_chains (id) on delete set null;
create index photos_chain_idx on public.photos (chain_id);
grant insert (chain_id) on public.photos to authenticated;

-- Who may sign up -----------------------------------------------------------

create table public.allowed_signup_domains (
  id uuid primary key default gen_random_uuid(),
  domain text not null unique check (domain ~ '^[a-z0-9-]+(\.[a-z0-9-]+)+$'),
  created_at timestamptz not null default now()
);

create table public.whitelisted_emails (
  id uuid primary key default gen_random_uuid(),
  email text not null unique check (email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' and email = lower(email)),
  note text check (note is null or char_length(note) <= 200),
  created_at timestamptz not null default now()
);

-- Open to everyone while no domain is listed; otherwise only listed domains
-- and whitelisted addresses.
create function public.signup_allowed(email text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not exists (select 1 from public.allowed_signup_domains)
      or exists (select 1 from public.whitelisted_emails w where w.email = lower(trim(signup_allowed.email)))
      or exists (select 1 from public.allowed_signup_domains d where d.domain = split_part(lower(trim(signup_allowed.email)), '@', 2));
$$;

grant execute on function public.signup_allowed(text) to anon, authenticated;

-- Enforced where accounts are made, for email and Google sign-ups alike.
-- Existing accounts are untouched.
create function public.auth_users_check_signup()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.email is not null and not public.signup_allowed(new.email) then
    raise exception 'cooked.ai sign-ups are limited to approved email addresses'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

revoke execute on function public.auth_users_check_signup() from public, anon, authenticated;

create trigger auth_users_check_signup
  before insert on auth.users
  for each row execute function public.auth_users_check_signup();

-- updated_at ----------------------------------------------------------------

create trigger llm_providers_touch before update on public.llm_providers for each row execute function public.touch_updated_at();
create trigger llm_models_touch before update on public.llm_models for each row execute function public.touch_updated_at();
create trigger prompt_chains_touch before update on public.prompt_chains for each row execute function public.touch_updated_at();
create trigger prompt_chain_steps_touch before update on public.prompt_chain_steps for each row execute function public.touch_updated_at();
create trigger prompt_chain_mix_touch before update on public.prompt_chain_mix for each row execute function public.touch_updated_at();
create trigger terms_touch before update on public.terms for each row execute function public.touch_updated_at();
create trigger generation_examples_touch before update on public.generation_examples for each row execute function public.touch_updated_at();

-- Row level security --------------------------------------------------------

alter table public.llm_providers enable row level security;
alter table public.llm_models enable row level security;
alter table public.prompt_chains enable row level security;
alter table public.prompt_chain_steps enable row level security;
alter table public.prompt_chain_mix enable row level security;
alter table public.terms enable row level security;
alter table public.generation_examples enable row level security;
alter table public.generation_requests enable row level security;
alter table public.llm_responses enable row level security;
alter table public.allowed_signup_domains enable row level security;
alter table public.whitelisted_emails enable row level security;

-- Configuration: anyone reads, superadmins write.
create policy "Anyone reads providers" on public.llm_providers for select to anon, authenticated using (true);
create policy "Anyone reads models" on public.llm_models for select to anon, authenticated using (true);
create policy "Anyone reads chains" on public.prompt_chains for select to anon, authenticated using (true);
create policy "Anyone reads chain steps" on public.prompt_chain_steps for select to anon, authenticated using (true);
create policy "Anyone reads the chain mix" on public.prompt_chain_mix for select to anon, authenticated using (true);
create policy "Anyone reads terms" on public.terms for select to anon, authenticated using (true);
create policy "Anyone reads examples" on public.generation_examples for select to anon, authenticated using (true);

create policy "Superadmins add providers" on public.llm_providers for insert to authenticated with check ((select public.is_superadmin()));
create policy "Superadmins edit providers" on public.llm_providers for update to authenticated using ((select public.is_superadmin())) with check ((select public.is_superadmin()));
create policy "Superadmins delete providers" on public.llm_providers for delete to authenticated using ((select public.is_superadmin()));

create policy "Superadmins add models" on public.llm_models for insert to authenticated with check ((select public.is_superadmin()));
create policy "Superadmins edit models" on public.llm_models for update to authenticated using ((select public.is_superadmin())) with check ((select public.is_superadmin()));
create policy "Superadmins delete models" on public.llm_models for delete to authenticated using ((select public.is_superadmin()));

create policy "Superadmins edit the chain mix" on public.prompt_chain_mix for update to authenticated using ((select public.is_superadmin())) with check ((select public.is_superadmin()));

create policy "Superadmins add terms" on public.terms for insert to authenticated with check ((select public.is_superadmin()));
create policy "Superadmins edit terms" on public.terms for update to authenticated using ((select public.is_superadmin())) with check ((select public.is_superadmin()));
create policy "Superadmins delete terms" on public.terms for delete to authenticated using ((select public.is_superadmin()));

create policy "Superadmins add examples" on public.generation_examples for insert to authenticated with check ((select public.is_superadmin()));
create policy "Superadmins edit examples" on public.generation_examples for update to authenticated using ((select public.is_superadmin())) with check ((select public.is_superadmin()));
create policy "Superadmins delete examples" on public.generation_examples for delete to authenticated using ((select public.is_superadmin()));

revoke insert, update, delete on public.llm_providers, public.llm_models, public.prompt_chains, public.prompt_chain_steps,
  public.prompt_chain_mix, public.terms, public.generation_examples from anon;
-- Chains and steps are read-only from the API; the mix only changes weight.
revoke insert, update, delete on public.prompt_chains, public.prompt_chain_steps, public.prompt_chain_mix from authenticated;
grant update (weight) on public.prompt_chain_mix to authenticated;

-- Logs: users write their own while their photo is captioned; superadmins read all.
create policy "Users log their own requests" on public.generation_requests for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "Users finish their own requests" on public.generation_requests for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
-- Updating (and the responses' check) reads the row, so owners see their own.
create policy "Users read their own requests" on public.generation_requests for select to authenticated
  using (user_id = (select auth.uid()));
create policy "Superadmins read requests" on public.generation_requests for select to authenticated
  using ((select public.is_superadmin()));

create policy "Users log responses to their own requests" on public.llm_responses for insert to authenticated
  with check (exists (select 1 from public.generation_requests r where r.id = request_id and r.user_id = (select auth.uid())));
create policy "Superadmins read responses" on public.llm_responses for select to authenticated
  using ((select public.is_superadmin()));

revoke all on public.generation_requests, public.llm_responses from anon;
revoke insert, update, delete on public.generation_requests, public.llm_responses from authenticated;
grant insert (id, chain_id, source, context) on public.generation_requests to authenticated;
grant update (status, error, photo_id, caption_count, duration_ms, finished_at) on public.generation_requests to authenticated;
grant insert (request_id, step_id, step_order, model_id, model_name, system_prompt, user_message, response_text, status,
  http_status, error, prompt_tokens, output_tokens, duration_ms) on public.llm_responses to authenticated;

-- Sign-up lists: superadmins only.
create policy "Superadmins read domains" on public.allowed_signup_domains for select to authenticated using ((select public.is_superadmin()));
create policy "Superadmins add domains" on public.allowed_signup_domains for insert to authenticated with check ((select public.is_superadmin()));
create policy "Superadmins edit domains" on public.allowed_signup_domains for update to authenticated using ((select public.is_superadmin())) with check ((select public.is_superadmin()));
create policy "Superadmins delete domains" on public.allowed_signup_domains for delete to authenticated using ((select public.is_superadmin()));

create policy "Superadmins read the whitelist" on public.whitelisted_emails for select to authenticated using ((select public.is_superadmin()));
create policy "Superadmins add to the whitelist" on public.whitelisted_emails for insert to authenticated with check ((select public.is_superadmin()));
create policy "Superadmins edit the whitelist" on public.whitelisted_emails for update to authenticated using ((select public.is_superadmin())) with check ((select public.is_superadmin()));
create policy "Superadmins delete from the whitelist" on public.whitelisted_emails for delete to authenticated using ((select public.is_superadmin()));

revoke all on public.allowed_signup_domains, public.whitelisted_emails from anon;

-- Voice League --------------------------------------------------------------

-- Standings for one week (Monday 00:00 New York time). weeks_ago = 0 is this
-- week. A voice wins a photo when its caption has the photo's top score
-- (above 0; ties all win).
create function public.voice_league(weeks_ago integer default 0)
returns table (voice text, wins integer, captions integer, points integer, week_start timestamptz)
language sql
stable
set search_path = ''
as $$
  with bounds as (
    select (date_trunc('week', now() at time zone 'America/New_York') - make_interval(weeks => weeks_ago))
             at time zone 'America/New_York' as since
  ), scored as (
    select c.style, c.score, max(c.score) over (partition by c.photo_id) as top
      from public.captions c
      join public.photos p on p.id = c.photo_id, bounds b
     where p.created_at >= b.since and p.created_at < b.since + interval '7 days'
  )
  select s.style,
         (count(*) filter (where s.score = s.top and s.top > 0))::integer,
         count(*)::integer,
         coalesce(sum(s.score), 0)::integer,
         (select since from bounds)
    from scored s
   group by s.style;
$$;

grant execute on function public.voice_league(integer) to anon, authenticated;

-- Someone's taste: how many captions of each voice they upvoted. Votes stay
-- private; only these totals are shared (on their public profile).
create function public.voice_taste(target uuid)
returns table (voice text, upvotes integer)
language sql
stable
security definer
set search_path = ''
as $$
  select c.style, count(*)::integer
    from public.caption_votes v
    join public.captions c on c.id = v.caption_id
   where v.user_id = target and v.value = 1
   group by c.style;
$$;

grant execute on function public.voice_taste(uuid) to anon, authenticated;

-- Starting data -------------------------------------------------------------

insert into public.llm_providers (name, slug, api_base_url, api_key_env) values
  ('Google Gemini', 'google', 'https://generativelanguage.googleapis.com/v1beta', 'GEMINI_API_KEY');

insert into public.llm_models (provider_id, name, api_model_id, priority, temperature, max_output_tokens)
select p.id, m.name, m.api_model_id, m.priority, 1, 2000
  from public.llm_providers p,
       (values ('Gemini Flash (latest)', 'gemini-flash-latest', 0),
               ('Gemini 3.5 Flash', 'gemini-3.5-flash', 10),
               ('Gemini Flash-Lite (latest)', 'gemini-flash-lite-latest', 20)) as m (name, api_model_id, priority)
 where p.slug = 'google';

insert into public.prompt_chains (name, description) values
  ('Straight to the roast', 'One call: look at the photo and write every voice''s caption.'),
  ('Look, then roast', 'Two calls: first list the most roastable details in the photo, then write the captions from those notes.');

update public.prompt_chain_mix m set weight = case c.name when 'Straight to the roast' then 70 else 30 end
  from public.prompt_chains c where c.id = m.chain_id;

insert into public.prompt_chain_steps (chain_id, step_order, name, instructions, include_image)
select c.id, s.step_order, s.name, s.instructions, true
  from public.prompt_chains c
  join (values
    ('Straight to the roast', 1, 'Write the captions', $p$You write captions for cooked.ai, where college students upload a photo and the internet votes on which caption "cooked" hardest.

Look closely at the photo and write exactly one caption for each voice below. Each caption must be specific to what is actually in the photo (objects, setting, lighting, vibe), short (under 140 characters), and funny enough that someone would screenshot it. Different jokes per voice, no repeats.

Voices:
{{voices}}

{{standings}}

Campus words you can use when they fit:
{{terms}}

Examples of each voice on other photos (match the voice, never reuse the joke):
{{examples}}

Rules:
- Roast the situation, never people's bodies, race, gender, or other protected traits. Playful, not cruel. PG-13.
- If the uploader added context, use it.
- No hashtags. Emoji are fine but not required.
- Return captions in the order the voices are listed, with "style" set to the voice name exactly.$p$),
    ('Look, then roast', 1, 'Spot the details', $p$You help write captions for cooked.ai, where college students upload a photo and the internet votes on the funniest caption.

Before anyone writes a joke, study the photo. List the 6 to 10 most specific, roastable details you can actually see: objects, brands, mess, lighting, setting, what is clearly going on, anything that says "college student in New York". Add the uploader's context if there is any.

Campus words that might apply:
{{terms}}

Plain notes only, one per line, no jokes yet. Never comment on people's bodies, race, gender or other protected traits.$p$),
    ('Look, then roast', 2, 'Write the captions', $p$You write captions for cooked.ai, where college students upload a photo and the internet votes on which caption "cooked" hardest.

A first look at the photo produced these notes:
{{previous}}

Using the photo and the notes, write exactly one caption for each voice below. Build each caption on a different specific detail. Short (under 140 characters) and funny enough that someone would screenshot it.

Voices:
{{voices}}

{{standings}}

Campus words you can use when they fit:
{{terms}}

Examples of each voice on other photos (match the voice, never reuse the joke):
{{examples}}

Rules:
- Roast the situation, never people's bodies, race, gender, or other protected traits. Playful, not cruel. PG-13.
- No hashtags. Emoji are fine but not required.
- Return captions in the order the voices are listed, with "style" set to the voice name exactly.$p$)
  ) as s (chain, step_order, name, instructions) on s.chain = c.name;

insert into public.terms (term, definition, example) values
  ('Butler', 'Butler Library, where people pull all-nighters (the 24-hour room is always full).', 'Another night in Butler, another existential crisis.'),
  ('Ferris', 'Ferris Booth Commons, a dining hall in Lerner.', 'Ferris pasta again.'),
  ('JJ''s', 'JJ''s Place, the late-night dining spot in John Jay.', 'JJ''s at 1am is a lifestyle.'),
  ('John Jay', 'First-year dorm and dining hall on the south side of campus.', null),
  ('Carman', 'First-year dorm known for small doubles and shared bathrooms.', null),
  ('Low Steps', 'The steps in front of Low Library where everyone sits when it''s nice out.', 'Low Steps season is back.'),
  ('the 1', 'The 1 train, the subway line along Broadway that stops at 116th St–Columbia.', 'The 1 was delayed again.'),
  ('the Core', 'The Core Curriculum: Lit Hum, CC, Frontiers, Art Hum and Music Hum.', 'Reading 300 pages of Lit Hum tonight.'),
  ('Koronet', 'Koronet Pizza on Broadway, famous for slices bigger than your face.', null),
  ('Westside', 'Westside Market, the grocery store on Broadway everyone goes to.', null),
  ('Morningside', 'Morningside Heights, the neighborhood around Columbia.', null),
  ('Barnard', 'Barnard College, across Broadway from Columbia.', null);

insert into public.generation_examples (voice, photo_description, caption) values
  ('Chronically Online', 'A messy dorm desk with three empty energy drink cans and a laptop open to a blank essay.', 'the blank google doc is giving "main character in a horror movie" 💀 three monsters deep and zero words'),
  ('Chronically Online', 'A plate of dining hall pasta that looks gray.', 'pasta said "i am not a vibe" and honestly respect the honesty'),
  ('Midwest Mom', 'A messy dorm desk with three empty energy drink cans and a laptop open to a blank essay.', 'Sweetie I see THREE cans. Did you eat a vegetable today? I''m mailing you a casserole and a water bottle 🌽'),
  ('Midwest Mom', 'A tiny dorm room with a bed lofted to the ceiling.', 'Oh honey it''s so cozy! Is there a rail on that? Please send me a picture of the rail.'),
  ('Real New Yorker', 'A messy dorm desk with three empty energy drink cans and a laptop open to a blank essay.', 'Three cans, no essay. I''ve seen raccoons with better time management.'),
  ('Real New Yorker', 'Someone posing proudly with a $9 iced coffee.', 'Nine bucks for brown ice. Welcome to the city, kid.'),
  ('Columbia Tour Guide', 'A messy dorm desk with three empty energy drink cans and a laptop open to a blank essay.', 'And here we see a student engaged in our renowned tradition of Deadline-Based Learning, a pillar of the Core since 1919!'),
  ('Columbia Tour Guide', 'A long line out the door of a dining hall.', 'Fun fact: this line is longer than our acceptance rate is short, and we are VERY proud of both!');

-- Sign-ups: Columbia and Barnard addresses. Delete every domain to open it up.
insert into public.allowed_signup_domains (domain) values ('columbia.edu'), ('barnard.edu');
