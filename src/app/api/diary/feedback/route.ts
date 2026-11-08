import { createClient } from '@/lib/supabase/server'
import { generateFeedback } from '@/lib/openai/feedback'
import { checkFeedbackLimit, recordFeedbackUsage } from '@/lib/ai/feedbackLimit'
import { NextRequest, NextResponse } from 'next/server'
import type { SimilarDiary } from '@/lib/types'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const tz = searchParams.get('tz') || 'Asia/Tokyo'

  // 今日の日記を取得（ユーザーのタイムゾーン基準）
  const now = new Date()
  const todayStart = new Date(now.toLocaleDateString('en-CA', { timeZone: tz }) + 'T00:00:00+09:00')
  const todayEnd = new Date(now.toLocaleDateString('en-CA', { timeZone: tz }) + 'T23:59:59+09:00')

  const { data: todayDiary, error: todayError } = await supabase
    .from('diaries')
    .select('id, content, mood_score, analysis, created_at, embedding, feedback')
    .eq('user_id', user.id)
    .gte('created_at', todayStart.toISOString())
    .lte('created_at', todayEnd.toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (todayError || !todayDiary) {
    return NextResponse.json(
      { error: '今日の日記がまだありません' },
      { status: 404 }
    )
  }

  // 保存済みフィードバックがあればそのまま返す（消費なし）
  if (todayDiary.feedback) {
    return NextResponse.json({
      feedback: todayDiary.feedback,
      today: { id: todayDiary.id, content: todayDiary.content, mood_score: todayDiary.mood_score, created_at: todayDiary.created_at },
      similar_entries: [],
    })
  }

  // レート制限チェック
  const limitResult = await checkFeedbackLimit(supabase, user.id)
  if (!limitResult.allowed) {
    return NextResponse.json({ error: limitResult.message }, { status: 429 })
  }

  // embeddingがある場合のみ類似検索（なければ今日の内容だけでフィードバック生成）
  let past: SimilarDiary[] = []
  if (todayDiary.embedding) {
    const { data: similarEntries, error: similarError } = await supabase.rpc(
      'match_diaries',
      {
        query_embedding: todayDiary.embedding,
        match_threshold: 0.7,
        match_count: 3,
        exclude_id: todayDiary.id,
      }
    )
    if (similarError) {
      console.error('Similarity search failed:', similarError)
    }
    past = (similarEntries || []) as SimilarDiary[]
  }

  // フィードバック生成（失敗しても日記保存は影響なし）
  let feedback: string
  try {
    feedback = await generateFeedback(todayDiary as unknown as import('@/lib/types').Diary, past)
    // 成功時のみ使用回数を記録してDBに保存
    await recordFeedbackUsage(supabase, user.id)
    await supabase.from('diaries').update({ feedback }).eq('id', todayDiary.id)
  } catch (err) {
    console.error('Feedback generation failed:', err)
    return NextResponse.json({ error: 'AIフィードバックの生成に失敗しました' }, { status: 500 })
  }

  return NextResponse.json({
    feedback,
    today: {
      id: todayDiary.id,
      content: todayDiary.content,
      mood_score: todayDiary.mood_score,
      created_at: todayDiary.created_at,
    },
    similar_entries: past.map((e) => ({
      id: e.id,
      content: e.content,
      mood_score: e.mood_score,
      created_at: e.created_at,
      similarity: e.similarity,
    })),
  })
}
