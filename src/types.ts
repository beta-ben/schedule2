export type Day = 'Mon'|'Tue'|'Wed'|'Thu'|'Fri'|'Sat'|'Sun'

export type Shift = {
  id: string
  person: string
  day: Day
  start: string // HH:MM
  end: string   // HH:MM
  // Optional task segments within this shift (minutes relative to start)
  segments?: ShiftSegment[]
}

export type PTO = {
  id: string
  person: string
  startDate: string // YYYY-MM-DD
  endDate: string   // YYYY-MM-DD
  notes?: string
}

export type TZOpt = { id: string; label: string; offset: number }

export type Posture = 'phones' | 'chat' | 'email' | 'qa' | 'training' | 'meeting' | 'break' | 'other'

export type Task = {
  id: string
  name: string
  color: string // css color
  posture?: Posture
  archived?: boolean
}

export type ShiftSegment = {
  id: string
  shiftId: string
  taskId: string
  startOffsetMin: number
  durationMin: number
  notes?: string
}
