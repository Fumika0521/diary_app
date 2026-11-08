'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect, useRef } from 'react'
import { DiaryForm } from '@/components/diary/DiaryForm'
import { DiaryCalendar } from '@/components/diary/DiaryCalendar'
import { FeedbackPanel } from '@/components/diary/FeedbackPanel'
import { DiaryCard } from '@/components/diary/DiaryCard'
import { format } from 'date-fns'
import { ja } from 'date-fns/locale'
import type { Diary } from '@/lib/types'

export default function DashboardPage() {
  const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Tokyo' })

  const [selectedDate, setSelectedDate] = useState<string>(todayStr)
  const [selectedDiary, setSelectedDiary] = useState<Diary | undefined>(undefined)
  const [loading, setLoading] = useState(true)
  const skipFetchRef = useRef(false)

  // 選択した日付の日記を取得
  const fetchDiary = async (date: string) => {
    setLoading(true)
    const month = date.slice(0, 7)
    const res = await fetch(`/api/diary?month=${month}`)
    const data = await res.json()
    if (Array.isArray(data)) {
      const diary = data.find((d: Diary) =>
        d.created_at.startsWith(date) ||
        new Date(d.created_at).toLocaleDateString('en-CA', { timeZone: 'Asia/Tokyo' }) === date
      )
      setSelectedDiary(diary)
    }
    setLoading(false)
  }

  useEffect(() => {
    if (skipFetchRef.current) {
      skipFetchRef.current = false
      return
    }
    fetchDiary(selectedDate)
  }, [selectedDate])

  // カレンダークリック：日記はすでに渡されるのでfetchしない
  const handleSelectDay = (diary: Diary | undefined, date?: string) => {
    if (date) {
      skipFetchRef.current = true
      setSelectedDate(date)
      setSelectedDiary(diary)
      setLoading(false)
    }
  }

  const dateLabel = format(new Date(selectedDate + 'T12:00:00'), 'yyyy年M月d日(E)', { locale: ja })
  const isToday = selectedDate === todayStr
  const isFuture = selectedDate > todayStr

  return (
    <div className="space-y-6">
      <DiaryCalendar onSelectDay={handleSelectDay} />

      {/* 選択日付のヘッダー（日記がない場合のみ表示） */}
      {!selectedDiary && !loading && (
        <h1 className="text-xl font-bold text-gray-900">{dateLabel}</h1>
      )}

      {loading ? (
        <div className="h-32 bg-gray-100 rounded-2xl animate-pulse" />
      ) : selectedDiary ? (
        <DiaryCard diary={selectedDiary} />
      ) : isFuture ? (
        <p className="text-sm text-gray-400 text-center py-8">その日になったら、日記を書きにきてね。</p>
      ) : (
        <DiaryForm
          date={isToday ? undefined : selectedDate}
          onSaved={() => fetchDiary(selectedDate)}
        />
      )}

      {selectedDiary && (
        <FeedbackPanel diaryId={isToday ? undefined : selectedDiary.id} />
      )}
    </div>
  )
}
