import { getOpenAIClient } from './client'
import type { Diary, SimilarDiary } from '@/lib/types'
import { format } from 'date-fns'
import { ja } from 'date-fns/locale'

const FEEDBACK_PROMPT = `あなたは同じ目線で話を聞いてくれる友達です。日記を読んで、自分も一緒に経験しているような感覚でリアクションしてください。
過去の似た日記と比較しながら、対等な口調（「わかる〜」「それ○ヶ月前も書いてたよね」「あのときどうなったんだっけ？」など）で話しかけてください。
ルール：
- アドバイスや評価はしない。ただ「わかる」「そうだよね」と共感したり、一緒に不思議がったりする
- 過去の記録の日付を使って「○ヶ月前も同じ感じだったよね」と自然に触れる
- 上から目線にならないこと。答えを出さず、一緒に考えるスタンスで
- 気分スコアには絶対に触れない。スコアの高い低いも、改善の示唆もしない
- 100〜150文字程度で短くまとめる`

export async function generateFeedback(
  today: Diary,
  pastEntries: SimilarDiary[]
): Promise<string> {
  const todayDate = format(new Date(today.created_at), 'yyyy年M月d日', { locale: ja })

  if (pastEntries.length === 0) {
    const response = await getOpenAIClient().chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `あなたは同じ目線で話を聞いてくれる友達です。日記を読んで、アドバイスや評価はせず、「わかる〜」「そうだよね」と共感したり、一緒に不思議がったりするような自然なひとことをください。上から目線にならず、対等な口調で。100〜150文字程度でまとめてください。`,
        },
        {
          role: 'user',
          content: `今日の日記（${todayDate}）:\n${today.content}`,
        },
      ],
      max_tokens: 250,
      temperature: 0.85,
    })
    return response.choices[0].message.content!
  }

  const pastText = pastEntries
    .map((e) => {
      const date = format(new Date(e.created_at), 'yyyy年M月d日', { locale: ja })
      return `【${date}】\n${e.content}`
    })
    .join('\n\n')

  const userMessage = `今日の日記（${todayDate}）:
${today.content}

過去の似た記録:
${pastText}`

  const response = await getOpenAIClient().chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: FEEDBACK_PROMPT },
      { role: 'user', content: userMessage },
    ],
    max_tokens: 250,
    temperature: 0.85,
  })

  return response.choices[0].message.content!
}
