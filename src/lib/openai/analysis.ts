import { getOpenAIClient } from './client'
import type { Analysis } from '@/lib/types'

const SYSTEM_PROMPT = `あなたは感情分析AIです。日記の内容を分析し、必ずJSON形式で返してください。

返すJSONの形式:
{
  "tags": ["タグ1", "タグ2", "タグ3"],
  "summary": "1文の要約",
  "emotions": {
    "primary": "主要な感情（例: 疲れ、喜び、不安、達成感）",
    "secondary": "副次的な感情（なければ省略）",
    "intensity": 0.8
  }
}`

export async function analyzeDiary(content: string): Promise<Analysis> {
  const response = await getOpenAIClient().chat.completions.create({
    model: 'gpt-4o-mini',
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: `日記:\n${content}` },
    ],
    max_tokens: 300,
  })

  return JSON.parse(response.choices[0].message.content!) as Analysis
}
