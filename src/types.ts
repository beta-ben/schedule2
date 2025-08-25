export type Day = 'Mon'|'Tue'|'Wed'|'Thu'|'Fri'|'Sat'|'Sun'

export type Shift = {
  id: string
  person: string
  day: Day
  start: string // HH:MM
  end: string   // HH:MM
}

export type PTO = {
  id: string
  person: string
  startDate: string // YYYY-MM-DD
  endDate: string   // YYYY-MM-DD
  notes?: string
}

export type TZOpt = { id: string; label: string; offset: number }
