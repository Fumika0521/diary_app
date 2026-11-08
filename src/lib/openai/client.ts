import OpenAI from 'openai'

let _client: OpenAI | null = null

export function getOpenAIClient(): OpenAI {
  if (!_client) {
    // apiKey が空でも構築は成功する（呼び出し時に認証エラーになる）
    _client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY ?? '' })
  }
  return _client
}
