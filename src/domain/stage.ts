import type { Shift, PTO, Override } from '../types'
import type { CalendarSegment } from '../lib/utils'

export type StageKey = { weekStart: string; tzId: string }

export type StageDoc = StageKey & {
  updatedAt: string
  baseLiveUpdatedAt?: string
  shifts: Shift[]
}

export type LiveDoc = {
  updatedAt?: string
  shifts: Shift[]
  pto: PTO[]
  overrides?: Override[]
  calendarSegs?: CalendarSegment[]
  agents?: Array<{ id: string; firstName: string; lastName: string; tzId?: string; hidden?: boolean; isSupervisor?: boolean; supervisorId?: string|null; notes?: string; meetingCohort?: string | null }>
}

export interface StageStore {
  get(key: StageKey): Promise<{ stage: StageDoc | null; live: LiveDoc | null }>
  save(doc: StageDoc, ifMatch?: string): Promise<{ ok: boolean; updatedAt?: string; conflict?: boolean }>
  reset(key: StageKey, live: LiveDoc): Promise<{ ok: boolean; stage: StageDoc }>
  publish?(doc: StageDoc, live?: LiveDoc, opts?: { force?: boolean }): Promise<{ ok: boolean; conflict?: boolean }>
  snapshot?(doc: StageDoc, title?: string): Promise<{ ok: boolean; id?: string }>
}
