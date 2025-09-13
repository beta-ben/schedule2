export type Day = 'Mon'|'Tue'|'Wed'|'Thu'|'Fri'|'Sat'|'Sun'

export type Shift = {
  id: string
  person: string
  // Optional normalized reference to the agent; during transition, person remains the display fallback
  agentId?: string
  day: Day
  start: string // HH:MM
  end: string   // HH:MM
  // Optional: explicit day the shift ends (same week key). If omitted, overnight is inferred when end <= start (except 24:00)
  endDay?: Day
  // Optional task segments within this shift (minutes relative to start)
  segments?: ShiftSegment[]
}

export type PTO = {
  id: string
  person: string
  // Optional normalized reference to the agent; during transition, person remains the display fallback
  agentId?: string
  startDate: string // YYYY-MM-DD
  endDate: string   // YYYY-MM-DD
  notes?: string
}

// One-off or recurring schedule override entries (swaps, half-days, changes).
// Times optional: when provided, HH:MM; supports across-midnight via endDay.
export type Override = {
  id: string
  person: string
  agentId?: string
  startDate: string // YYYY-MM-DD
  endDate: string   // YYYY-MM-DD
  start?: string    // HH:MM
  end?: string      // HH:MM
  endDay?: Day
  kind?: string
  notes?: string
  recurrence?: { rule?: 'weekly'|'monthly'|'custom'; until?: string; count?: number; byDay?: Day[] }
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
