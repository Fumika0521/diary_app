import type { SupabaseClient } from '@supabase/supabase-js'

const USER_DAILY_LIMIT = 3
const GLOBAL_DAILY_LIMIT = 30

function getTodayJST(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Tokyo' }) // YYYY-MM-DD
}

export async function checkFeedbackLimit(
  supabase: SupabaseClient,
  userId: string
): Promise<{ allowed: boolean; message?: string }> {
  const today = getTodayJST()

  // ユーザーごとの上限チェック
  const { count: userCount } = await supabase
    .from('ai_feedback_usage')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('used_date', today)

  if ((userCount ?? 0) >= USER_DAILY_LIMIT) {
    return {
      allowed: false,
      message: '今日のAIフィードバックは上限に達しました。また明日試してください',
    }
  }

  // アプリ全体の上限チェック（SECURITY DEFINER 関数でRLSをバイパス）
  const { data: globalCount } = await supabase.rpc('get_ai_global_daily_count', {
    check_date: today,
  })

  if ((globalCount ?? 0) >= GLOBAL_DAILY_LIMIT) {
    return {
      allowed: false,
      message: '今日のAIフィードバックは上限に達しました。また明日試してください',
    }
  }

  return { allowed: true }
}

export async function recordFeedbackUsage(
  supabase: SupabaseClient,
  userId: string
): Promise<void> {
  const today = getTodayJST()
  const { error } = await supabase
    .from('ai_feedback_usage')
    .insert({ user_id: userId, used_date: today })
  if (error) {
    console.error('Failed to record feedback usage:', error)
  }
}
