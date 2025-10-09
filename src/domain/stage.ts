import type { Shift, PTO, Override } from '../types'
import type { CalendarSegment } from '../lib/utils'

export type StageKey = { weekStart: string; tzId: string }

export type StageAgent = {
  id: string
  firstName: string
  lastName: string
  tzId?: string
  hidden?: boolean
  isSupervisor?: boolean
  supervisorId?: string | null
  notes?: string
  meetingCohort?: string | null
}

export type StageDoc = StageKey & {
  updatedAt: string
  baseLiveUpdatedAt?: string
  shifts: Shift[]
  pto: PTO[]
  overrides: Override[]
  calendarSegs: CalendarSegment[]
  agents?: StageAgent[]
}

export type LiveDoc = {
  updatedAt?: string
  shifts: Shift[]
  pto: PTO[]
  overrides?: Override[]
  calendarSegs?: CalendarSegment[]
  agents?: StageAgent[]
}

export interface StageStore {
  get(key: StageKey): Promise<{ stage: StageDoc | null; live: LiveDoc | null }>
  save(doc: StageDoc, opts?: { ifMatch?: string } | string): Promise<{ ok: boolean; updatedAt?: string; conflict?: boolean; stage?: StageDoc; status?: number; unsupported?: boolean; error?: string }>
  reset(key: StageKey, live: LiveDoc): Promise<{ ok: boolean; stage: StageDoc; status?: number; unsupported?: boolean; error?: string }>
  publish?(doc: StageDoc, live?: LiveDoc, opts?: { force?: boolean }): Promise<{ ok: boolean; conflict?: boolean; status?: number; unsupported?: boolean; error?: string }>
  snapshot?(doc: StageDoc, title?: string): Promise<{ ok: boolean; id?: string; status?: number; unsupported?: boolean; error?: string }>
}
