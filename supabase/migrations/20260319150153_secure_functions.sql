-- Security Advisor 対応: 関数の権限とセキュリティモデルを修正

-- 旧 match_diaries を削除（引数が変わるため）
drop function if exists public.match_diaries(extensions.vector(1536), uuid, float, int, uuid);

-- match_diaries: SECURITY INVOKER に変更（RLS が効く）
-- match_user_id 引数をなくし、内部で auth.uid() を使う
create or replace function public.match_diaries(
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

-- match_diaries: anon・public から EXECUTE 権限を剥奪、authenticated のみ許可
revoke execute on function public.match_diaries(extensions.vector(1536), float, int, uuid) from public;
revoke execute on function public.match_diaries(extensions.vector(1536), float, int, uuid) from anon;
grant  execute on function public.match_diaries(extensions.vector(1536), float, int, uuid) to authenticated;

-- get_ai_global_daily_count: anon・public から EXECUTE 権限を剥奪、authenticated のみ許可
revoke execute on function public.get_ai_global_daily_count(date) from public;
revoke execute on function public.get_ai_global_daily_count(date) from anon;
grant  execute on function public.get_ai_global_daily_count(date) to authenticated;
