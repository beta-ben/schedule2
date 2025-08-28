import { LegacyDocZ, type LegacyDoc } from './legacy'
import { ScheduleDocZ, type V1ScheduleDoc, type Event } from './schema'

const DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'] as const
type DayKey = typeof DAYS[number]

function weekStartSunday(d: Date){
  const out = new Date(d)
  const day = out.getDay()
  out.setDate(out.getDate() - day)
  out.setHours(0,0,0,0)
  return out
}

function addDays(d: Date, n: number){ const x = new Date(d); x.setDate(x.getDate()+n); return x }
function pad2(n:number){ return n.toString().padStart(2,'0') }

function toISO(date: Date){ return new Date(date.getTime()).toISOString() }

function dateFromYMD(ymd: string){ const [y,m,d] = ymd.split('-').map(Number); return new Date(Date.UTC(y, (m||1)-1, d||1, 0,0,0)) }

function setTime(date: Date, hhmm: string){
  const [h,m] = hhmm.split(':').map(Number)
  const x = new Date(date)
  x.setUTCHours(h||0, m||0, 0, 0)
  return x
}

export function transformLegacyToV1(legacy: unknown, opts?: { orgName?: string; tz?: string; source?: string; refWeekStart?: Date }): V1ScheduleDoc {
  const parsed: LegacyDoc = LegacyDocZ.parse(legacy)
  const tz = opts?.tz || 'America/Los_Angeles'
  const orgName = opts?.orgName || 'Schedule'
  const generatedAt = new Date().toISOString()
  const week0 = weekStartSunday(opts?.refWeekStart || new Date())

  const dayToDate = (d: DayKey)=> addDays(week0, DAYS.indexOf(d))

  // Employees: unique names from shifts
  const people = Array.from(new Set(parsed.shifts.map(s=> s.person))).sort()
  const employees = people.map((name,i)=> ({ id: `emp-${i+1}`, displayName: name, active: true, roleIds: [] as string[] }))
  const idByName = new Map(employees.map(e=> [e.displayName, e.id] as const))

  const events: Event[] = []
  for(const s of parsed.shifts){
    const sd = dayToDate(s.day as DayKey)
    const edDay = (s as any).endDay as DayKey | undefined
    const ed = edDay ? dayToDate(edDay) : sd
    const start = setTime(sd, s.start)
    let end = setTime(ed, s.end)
    if(end <= start){ end = new Date(start.getTime() + 60*60*1000) } // ensure end>start
    events.push({
      kind: 'shift',
      id: s.id,
      start: toISO(start),
      end: toISO(end),
      tz,
      createdAt: generatedAt,
      updatedAt: generatedAt,
      employeeId: idByName.get(s.person) || `emp-unknown`,
      status: 'planned',
    })
  }

  for(const p of parsed.pto){
    const startDate = dateFromYMD(p.startDate)
    const endDate = dateFromYMD(p.endDate)
    const start = startDate
    const end = new Date(endDate.getTime() + 24*60*60*1000) // inclusive end day
    events.push({
      kind: 'pto',
      id: p.id,
      start: toISO(start),
      end: toISO(end),
      tz,
      createdAt: generatedAt,
      updatedAt: generatedAt,
      employeeId: idByName.get(p.person) || `emp-unknown`,
      ptoType: 'vacation',
      state: 'approved',
      status: 'planned',
    })
  }

  const doc: V1ScheduleDoc = {
    schemaVersion: 1,
    org: { id: 'org-1', name: orgName },
    timezone: tz,
    employees,
    roles: [],
    locations: [],
    events,
    published: { from: null, to: null },
    meta: { generatedAt, source: opts?.source },
  }
  return ScheduleDocZ.parse(doc)
}
