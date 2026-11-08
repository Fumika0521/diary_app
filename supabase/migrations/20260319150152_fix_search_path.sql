-- Security Advisor 対応: search_path を明示的に設定

create or replace function public.match_diaries(
  query_embedding extensions.vector(1536),
  match_user_id   uuid,
  match_threshold float default 0.7,
  match_count     int default 3,
  exclude_id      uuid default null
)
returns table (id uuid, content text, mood_score integer, analysis jsonb, created_at timestamptz, similarity float)
language sql stable security definer
set search_path = public, extensions
as $$
  select d.id, d.content, d.mood_score, d.analysis, d.created_at,
         1 - (d.embedding <=> query_embedding) as similarity
  from public.diaries d
  where d.user_id = match_user_id
    and d.id is distinct from exclude_id
    and d.embedding is not null
    and 1 - (d.embedding <=> query_embedding) > match_threshold
  order by d.embedding <=> query_embedding
  limit match_count;
$$;

create or replace function public.get_ai_global_daily_count(check_date date)
returns bigint
language sql stable security definer
set search_path = public
as $$
  select count(*) from public.ai_feedback_usage where used_date = check_date;
$$;
