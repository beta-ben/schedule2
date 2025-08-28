import { z } from 'zod'

export const DayZ = z.enum(['Sun','Mon','Tue','Wed','Thu','Fri','Sat'])
export type Day = z.infer<typeof DayZ>

export const TimeHHMMZ = z.string().regex(/^\d{2}:\d{2}$/,'HH:MM expected')
export const ISODateZ = z.string().regex(/^\d{4}-\d{2}-\d{2}$/,'YYYY-MM-DD expected')

export const LegacyShiftZ = z.object({
  id: z.string(),
  person: z.string(),
  day: DayZ,
  start: TimeHHMMZ,
  end: TimeHHMMZ,
  endDay: DayZ.optional(),
})
export type LegacyShift = z.infer<typeof LegacyShiftZ>

export const LegacyPTOZ = z.object({
  id: z.string(),
  person: z.string(),
  startDate: ISODateZ,
  endDate: ISODateZ,
  notes: z.string().optional(),
})
export type LegacyPTO = z.infer<typeof LegacyPTOZ>

export const LegacyCalendarSegZ = z.object({
  person: z.string(),
  day: DayZ,
  start: TimeHHMMZ,
  end: TimeHHMMZ,
  taskId: z.string(),
})
export type LegacyCalendarSeg = z.infer<typeof LegacyCalendarSegZ>

export const LegacyDocZ = z.object({
  shifts: z.array(LegacyShiftZ),
  pto: z.array(LegacyPTOZ),
  calendarSegs: z.array(LegacyCalendarSegZ),
  updatedAt: z.string().optional(),
})
export type LegacyDoc = z.infer<typeof LegacyDocZ>
