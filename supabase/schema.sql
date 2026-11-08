-- Enable pgvector
create extension if not exists vector with schema extensions;

-- diaries table
create table public.diaries (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  content     text not null,
  mood_score  integer not null check (mood_score between 1 and 5),
  embedding   extensions.vector(1536),
  analysis    jsonb,
  created_at  timestamptz not null default now()
);

create index diaries_user_id_created_at_idx on public.diaries(user_id, created_at desc);
create index diaries_embedding_idx on public.diaries
  using ivfflat (embedding extensions.vector_cosine_ops) with (lists = 100);

-- push_subscriptions table
create table public.push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  created_at timestamptz not null default now()
);

-- RLS
alter table public.diaries enable row level security;
alter table public.push_subscriptions enable row level security;

create policy "Users can view own diaries" on public.diaries for select using (auth.uid() = user_id);
create policy "Users can insert own diaries" on public.diaries for insert with check (auth.uid() = user_id);
create policy "Users can update own diaries" on public.diaries for update using (auth.uid() = user_id);
create policy "Users can delete own diaries" on public.diaries for delete using (auth.uid() = user_id);
create policy "Users can manage own push subscriptions" on public.push_subscriptions for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- AI feedback usage tracking (rate limiting)
create table public.ai_feedback_usage (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  used_date  date not null,
  created_at timestamptz not null default now()
);

create index ai_feedback_usage_user_date_idx on public.ai_feedback_usage(user_id, used_date);
create index ai_feedback_usage_date_idx on public.ai_feedback_usage(used_date);

alter table public.ai_feedback_usage enable row level security;

create policy "Users can view own ai usage" on public.ai_feedback_usage
  for select using (auth.uid() = user_id);
create policy "Users can insert own ai usage" on public.ai_feedback_usage
  for insert with check (auth.uid() = user_id);

create or replace function get_ai_global_daily_count(check_date date)
returns bigint
language sql stable security definer
set search_path = public
as $$
  select count(*) from public.ai_feedback_usage where used_date = check_date;
$$;

-- Similarity search function
create or replace function match_diaries(
  query_embedding extensions.vector(1536),
  match_threshold float default 0.7,
  match_count     int default 3,
  exclude_id      uuid default null
)
returns table (id uuid, content text, mood_score integer, analysis jsonb, created_at timestamptz, similarity float)
language sql stable security invoker
set search_path = public, extensions
as $$
  select d.id, d.content, d.mood_score, d.analysis, d.created_at,
         1 - (d.embedding <=> query_embedding) as similarity
  from public.diaries d
  where d.user_id = auth.uid()
    and d.id is distinct from exclude_id
    and d.embedding is not null
    and 1 - (d.embedding <=> query_embedding) > match_threshold
  order by d.embedding <=> query_embedding
  limit match_count;
$$;

revoke execute on function public.match_diaries(extensions.vector(1536), float, int, uuid) from public;
revoke execute on function public.match_diaries(extensions.vector(1536), float, int, uuid) from anon;
grant  execute on function public.match_diaries(extensions.vector(1536), float, int, uuid) to authenticated;

revoke execute on function public.get_ai_global_daily_count(date) from public;
revoke execute on function public.get_ai_global_daily_count(date) from anon;
grant  execute on function public.get_ai_global_daily_count(date) to authenticated;
