import type { TZOpt, Day } from './types'

export const DAYS: Day[] = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']

export const TZ_OPTS: TZOpt[] = [
  { id: 'America/Los_Angeles', label: 'PT', offset: 0 },
  { id: 'America/Denver',      label: 'MT', offset: 1 },
  { id: 'America/Chicago',     label: 'CT', offset: 2 },
  { id: 'America/New_York',    label: 'ET', offset: 3 },
]

export const COLS = 24
