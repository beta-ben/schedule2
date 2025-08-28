import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { z } from 'zod'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const LIVE_URL = process.env.SEED_URL || 'https://team-schedule-api.bsteward.workers.dev/v1/schedule'
const OUT = path.resolve(__dirname, '../dev-server/dev-server/data.v1.json')

async function main(){
  console.log(`Fetching ${LIVE_URL} ...`)
  const r = await fetch(LIVE_URL)
  if(!r.ok){ throw new Error(`HTTP ${r.status}: ${r.statusText}`) }
  const legacy = await r.json()
  // Inline parse and transform
  const DayZ = z.enum(['Sun','Mon','Tue','Wed','Thu','Fri','Sat'])
  const TimeHHMMZ = z.string().regex(/^\d{2}:\d{2}$/,'HH:MM expected')
  const ISODateZ = z.string().regex(/^\d{4}-\d{2}-\d{2}$/,'YYYY-MM-DD expected')
  const LegacyShiftZ = z.object({ id: z.string(), person: z.string(), day: DayZ, start: TimeHHMMZ, end: TimeHHMMZ, endDay: DayZ.optional() })
  const LegacyPTOZ = z.object({ id: z.string(), person: z.string(), startDate: ISODateZ, endDate: ISODateZ, notes: z.string().optional() })
  const LegacyCalendarSegZ = z.object({ person: z.string(), day: DayZ, start: TimeHHMMZ, end: TimeHHMMZ, taskId: z.string() })
  const LegacyDocZ = z.object({ shifts: z.array(LegacyShiftZ), pto: z.array(LegacyPTOZ), calendarSegs: z.array(LegacyCalendarSegZ), updatedAt: z.string().optional() })
  const parsed = LegacyDocZ.parse(legacy)

  const DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
  const weekStartSunday = (d)=>{ const x=new Date(d); const day=x.getDay(); x.setDate(x.getDate()-day); x.setHours(0,0,0,0); return x }
  const addDays = (d,n)=>{ const x=new Date(d); x.setDate(x.getDate()+n); return x }
  const dateFromYMD = (ymd)=>{ const [y,m,dd]=ymd.split('-').map(Number); return new Date(Date.UTC(y,(m||1)-1,dd||1,0,0,0)) }
  const setTime = (date, hhmm)=>{ const [h,m]=hhmm.split(':').map(Number); const x=new Date(date); x.setUTCHours(h||0,m||0,0,0); return x }
  const toISO = (d)=> new Date(d.getTime()).toISOString()

  const tz = 'America/Los_Angeles'
  const orgName = 'Schedule'
  const generatedAt = new Date().toISOString()
  const week0 = weekStartSunday(new Date())
  const dayToDate = (d)=> addDays(week0, DAYS.indexOf(d))
  const people = Array.from(new Set(parsed.shifts.map(s=> s.person))).sort()
  const employees = people.map((name,i)=> ({ id: `emp-${i+1}`, displayName: name, active: true, roleIds: [] }))
  const idByName = new Map(employees.map(e=> [e.displayName, e.id]))
  const events = []
  for(const s of parsed.shifts){
    const sd = dayToDate(s.day)
    const edDay = s.endDay || s.day
    const ed = dayToDate(edDay)
    const start = setTime(sd, s.start)
    let end = setTime(ed, s.end)
    if(end <= start){ end = new Date(start.getTime() + 60*60*1000) }
    events.push({ kind:'shift', id:s.id, start:toISO(start), end:toISO(end), tz, createdAt:generatedAt, updatedAt:generatedAt, employeeId: idByName.get(s.person) || 'emp-unknown', status:'planned' })
  }
  for(const p of parsed.pto){
    const start = dateFromYMD(p.startDate)
    const end = new Date(dateFromYMD(p.endDate).getTime() + 24*60*60*1000)
    events.push({ kind:'pto', id:p.id, start:toISO(start), end:toISO(end), tz, createdAt:generatedAt, updatedAt:generatedAt, employeeId: idByName.get(p.person) || 'emp-unknown', ptoType:'vacation', state:'approved', status:'planned' })
  }
  const v1 = { schemaVersion:1, org:{ id:'org-1', name: orgName }, timezone: tz, employees, roles:[], locations:[], events, published:{ from:null, to:null }, meta:{ generatedAt, source: LIVE_URL } }
  await fs.promises.mkdir(path.dirname(OUT), { recursive: true })
  await fs.promises.writeFile(OUT, JSON.stringify(v1, null, 2), 'utf8')
  console.log(`Wrote v1 doc to ${OUT}. Events=${v1.events.length}, Employees=${v1.employees.length}`)
}

main().catch(err=>{ console.error(err); process.exit(1) })
