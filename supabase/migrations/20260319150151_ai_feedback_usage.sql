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

-- SECURITY DEFINER: global count per date (bypasses RLS for counting only)
create or replace function get_ai_global_daily_count(check_date date)
returns bigint
language sql stable security definer as $$
  select count(*) from public.ai_feedback_usage where used_date = check_date;
$$;
