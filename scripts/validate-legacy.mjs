import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { z } from 'zod'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const target = path.resolve(__dirname, '../dev-server/dev-server/data.json')

// Inline legacy schema to avoid TS import
const DayZ = z.enum(['Sun','Mon','Tue','Wed','Thu','Fri','Sat'])
const TimeHHMMZ = z.string().regex(/^\d{2}:\d{2}$/,'HH:MM expected')
const ISODateZ = z.string().regex(/^\d{4}-\d{2}-\d{2}$/,'YYYY-MM-DD expected')
const LegacyShiftZ = z.object({ id: z.string(), person: z.string(), day: DayZ, start: TimeHHMMZ, end: TimeHHMMZ, endDay: DayZ.optional() })
const LegacyPTOZ = z.object({ id: z.string(), person: z.string(), startDate: ISODateZ, endDate: ISODateZ, notes: z.string().optional() })
const LegacyCalendarSegZ = z.object({ person: z.string(), day: DayZ, start: TimeHHMMZ, end: TimeHHMMZ, taskId: z.string() })
const LegacyDocZ = z.object({ shifts: z.array(LegacyShiftZ), pto: z.array(LegacyPTOZ), calendarSegs: z.array(LegacyCalendarSegZ), updatedAt: z.string().optional() })

try{
  const raw = fs.readFileSync(target, 'utf8')
  const json = JSON.parse(raw)
  const parsed = LegacyDocZ.parse(json)
  console.log(`OK: shifts=${parsed.shifts.length}, pto=${parsed.pto.length}, calendarSegs=${parsed.calendarSegs.length}`)
}catch(e){
  console.error('Validation failed:', e?.errors ?? e?.message ?? e)
  process.exit(1)
}
