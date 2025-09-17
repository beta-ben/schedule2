import type { TZOpt, Day, MeetingCohort } from './types'

export const DAYS: Day[] = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']

export const TZ_OPTS: TZOpt[] = [
  { id: 'America/Los_Angeles', label: 'PT', offset: 0, name: 'Pacific Time' },
  { id: 'America/Denver',      label: 'MT', offset: 1, name: 'Mountain Time' },
  { id: 'America/Chicago',     label: 'CT', offset: 2, name: 'Central Time' },
  { id: 'America/New_York',    label: 'ET', offset: 3, name: 'Eastern Time' },
]

export const COLS = 24

export const MEETING_COHORTS: readonly MeetingCohort[] = ['Morning Meeting','Midday Meeting','Afternoon Meeting'] as const
