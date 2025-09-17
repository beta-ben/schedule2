import React from 'react'
import { formatMinutes, TimeFormat } from '../lib/utils'

type TimeFormatContextValue = {
  timeFormat: TimeFormat
  setTimeFormat: (format: TimeFormat) => void
  formatTime: (minutes: number) => string
}

const fallback: TimeFormatContextValue = {
  timeFormat: '24h',
  setTimeFormat: () => {},
  formatTime: (minutes: number) => formatMinutes(minutes, '24h'),
}

const TimeFormatContext = React.createContext<TimeFormatContextValue>(fallback)

export function TimeFormatProvider({ value, children }: { value: TimeFormatContextValue; children: React.ReactNode }) {
  return <TimeFormatContext.Provider value={value}>{children}</TimeFormatContext.Provider>
}

export function useTimeFormat() {
  return React.useContext(TimeFormatContext)
}
