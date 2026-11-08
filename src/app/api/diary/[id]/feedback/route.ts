import { createClient } from '@/lib/supabase/server'
import { generateFeedback } from '@/lib/openai/feedback'
import { checkFeedbackLimit, recordFeedbackUsage } from '@/lib/ai/feedbackLimit'
import { NextRequest, NextResponse } from 'next/server'
import type { SimilarDiary } from '@/lib/types'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: diary, error } = await supabase
    .from('diaries')
    .select('id, content, mood_score, analysis, created_at, embedding, feedback')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (error || !diary) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  // 保存済みフィードバックがあればそのまま返す（消費なし）
  if (diary.feedback) {
    return NextResponse.json({ feedback: diary.feedback, similar_entries: [] })
  }

  // レート制限チェック
  const limitResult = await checkFeedbackLimit(supabase, user.id)
  if (!limitResult.allowed) {
    return NextResponse.json({ error: limitResult.message }, { status: 429 })
  }

  // embeddingがある場合のみ類似検索（なければ今日の内容だけでフィードバック生成）
  let past: SimilarDiary[] = []
  if (diary.embedding) {
    const { data: similarEntries, error: similarError } = await supabase.rpc('match_diaries', {
      query_embedding: diary.embedding,
      match_threshold: 0.7,
      match_count: 3,
      exclude_id: diary.id,
    })
    if (similarError) {
      console.error('Similarity search failed:', similarError)
    }
    past = (similarEntries || []) as SimilarDiary[]
  }

  // フィードバック生成（失敗しても日記保存は影響なし）
  let feedback: string
  try {
    feedback = await generateFeedback(diary as unknown as import('@/lib/types').Diary, past)
    // 成功時のみ使用回数を記録してDBに保存
    await recordFeedbackUsage(supabase, user.id)
    await supabase.from('diaries').update({ feedback }).eq('id', diary.id)
  } catch (err) {
    console.error('Feedback generation failed:', err)
    return NextResponse.json({ error: 'AIフィードバックの生成に失敗しました' }, { status: 500 })
  }

  return NextResponse.json({
    feedback,
    similar_entries: past.map((e) => ({
      id: e.id,
      content: e.content,
      mood_score: e.mood_score,
      created_at: e.created_at,
      similarity: e.similarity,
    })),
  })
}
