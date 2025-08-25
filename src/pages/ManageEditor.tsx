import React from 'react'
import { DAYS } from '../constants'
import DayPills from '../components/DayPills'
import DayGrid from '../components/DayGrid'
import RemoveShiftsPanel from '../components/RemoveShiftsPanel'
import { addDays, fmtNice, fmtYMD, isValidHHMM, parseYMD, shiftKey, shiftKeyOf, toMin, uid } from '../lib/utils'
import type { PTO, Shift } from '../types'
import { cloudGet, cloudPost } from '../lib/api'

export default function ManageEditor({ dark, weekStartDate, shifts, setShifts, pto, setPto, tz }:{ 
  dark: boolean
  weekStartDate: Date
  shifts: Shift[]
  setShifts: (f:(prev:Shift[])=>Shift[])=>void
  pto: PTO[]
  setPto: (f:(prev:PTO[])=>PTO[])=>void
  tz: { id:string; label:string; offset:number }
}){
  const [tab, setTab] = React.useState<'shifts'|'pto'|'remove'>('remove')

  const [person, setPerson] = React.useState('')
  const [daysSel, setDaysSel] = React.useState(()=> new Set<string>([DAYS[0]]))
  const [start, setStart] = React.useState('09:00')
  const [end, setEnd]   = React.useState('17:30')

  const [ptoPerson, setPtoPerson] = React.useState('')
  const [ptoStart, setPtoStart]   = React.useState(fmtYMD(weekStartDate))
  const [ptoEnd, setPtoEnd]       = React.useState(fmtYMD(addDays(weekStartDate, 1)))
  const [ptoNotes, setPtoNotes]   = React.useState('')

  const [notice,setNotice]=React.useState<string|null>(null)
  const allPeople = React.useMemo(()=>Array.from(new Set(shifts.map(s=>s.person))).sort(),[shifts])

  function selectWeekdays(){ setDaysSel(new Set(DAYS.slice(0,5))) }
  function selectAll(){ setDaysSel(new Set(DAYS)) }
  function selectNone(){ setDaysSel(new Set()) }

  function addShift(){
    setNotice(null)
    if(!person.trim()) return alert('Enter a person name')
    if(daysSel.size===0) return alert('Select at least one day')
    if(!isValidHHMM(start) || !isValidHHMM(end)) return alert('Times must be HH:MM (00:00–24:00) with 24:00 only as an end time')
    const sMin = toMin(start); const eMin = toMin(end)
    if(eMin<=sMin && end!=="24:00") return alert('End must be after start (or exactly 24:00)')
    const p=person.trim()
    const days=Array.from(daysSel)
    const existing = new Set(shifts.map(shiftKey))
    const dupDays = days.filter(d=> existing.has(shiftKeyOf(p,d as any,start,end)))
    const toAddDays = days.filter(d=> !existing.has(shiftKeyOf(p,d as any,start,end)))
    if(dupDays.length>0) setNotice('Duplicate shift skipped for: '+dupDays.join(', '))
    if(toAddDays.length===0) return
    const recs = toAddDays.map(day=> ({ id: uid(), person: p, day: day as any, start, end }))
    setShifts(prev=> prev.concat(recs))
    setStart(end)
  }

  function addPto(){
    if(!ptoPerson.trim()) return alert('Enter a person name')
    const sd = parseYMD(ptoStart); const ed = parseYMD(ptoEnd)
    if(!(sd instanceof Date) || isNaN(sd.getTime()) || !(ed instanceof Date) || isNaN(ed.getTime())) return alert('Invalid dates')
    if(sd>ed) return alert('End date must be on/after start date')
    const rec = { id: uid(), person: ptoPerson.trim(), startDate: ptoStart, endDate: ptoEnd, notes: ptoNotes }
    setPto(prev=> prev.concat([rec]))
  }

  function exportData(){
    const data = JSON.stringify({ shifts, pto }, null, 2)
    try{
      navigator.clipboard?.writeText(data)
      alert('Copied JSON to clipboard.')
    }catch(err){ console.warn('Copy failed', err) }
  }

  return (
    <section className={["rounded-2xl p-2 space-y-3", dark?"bg-neutral-900":"bg-white shadow-sm"].join(' ')}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-2">
          <button onClick={()=>setTab('shifts')} className={["px-3 py-1.5 rounded-lg border text-sm", tab==='shifts' ? (dark?"bg-neutral-800 border-neutral-600":"bg-blue-600 border-blue-600 text-white") : (dark?"border-neutral-700":"border-neutral-300")].join(' ')}>Shifts</button>
          <button onClick={()=>setTab('pto')} className={["px-3 py-1.5 rounded-lg border text-sm", tab==='pto' ? (dark?"bg-neutral-800 border-neutral-600":"bg-blue-600 border-blue-600 text-white") : (dark?"border-neutral-700":"border-neutral-300")].join(' ')}>PTO</button>
          <button onClick={()=>setTab('remove')} className={["px-3 py-1.5 rounded-lg border text-sm", tab==='remove' ? (dark?"bg-red-700 border-red-700 text-white":"bg-red-600 border-red-600 text-white") : (dark?"border-neutral-700":"border-neutral-300")].join(' ')}>Remove</button>
        </div>
        <div className="flex gap-2">
          <button onClick={exportData} className={["px-3 py-1.5 rounded-lg border text-sm", dark?"border-neutral-600":"border-neutral-300"].join(' ')}>Export JSON</button>
          <button onClick={async()=>{ const data=await cloudGet(); if(data){ setShifts(()=>data.shifts); setPto(()=>data.pto) } }} className={["px-3 py-1.5 rounded-lg border text-sm", dark?"border-neutral-600":"border-neutral-300"].join(' ')}>Load Cloud</button>
          <button onClick={async()=>{ await cloudPost({shifts, pto, updatedAt:new Date().toISOString()}); }} className={["px-3 py-1.5 rounded-lg border text-sm", dark?"border-neutral-600":"border-neutral-300"].join(' ')}>Save Cloud</button>
        </div>
      </div>

      {tab==='remove' ? (
        <RemoveShiftsPanel shifts={shifts} setShifts={setShifts} dark={dark} />
      ) : tab==='shifts' ? (
        <div className={["rounded-xl p-3", dark?"bg-neutral-950":"bg-neutral-50"].join(' ')}>
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start lg:items-end">
            <div className="lg:col-span-3">
              <label className="text-sm flex flex-col">
                <span className="mb-1">Name</span>
                <input list="people" className={["w-full border rounded-xl px-3 py-2", dark&&"bg-neutral-900 border-neutral-700"].filter(Boolean).join(' ')} value={person} onChange={e=>setPerson(e.target.value)} placeholder="Agent name" />
              </label>
            </div>
            <div className="lg:col-span-5">
              <fieldset className="text-sm">
                <legend className="mb-2 font-medium">Days</legend>
                <DayPills value={daysSel} onChange={setDaysSel} dark={dark} />
                <div className="mt-2 flex gap-2 text-xs">
                  <button onClick={selectWeekdays} className={["px-2 py-1 rounded-lg border", dark?"border-neutral-700":"border-neutral-300"].join(' ')}>Weekdays</button>
                  <button onClick={selectAll} className={["px-2 py-1 rounded-lg border", dark?"border-neutral-700":"border-neutral-300"].join(' ')}>All</button>
                  <button onClick={selectNone} className={["px-2 py-1 rounded-lg border", dark?"border-neutral-700":"border-neutral-300"].join(' ')}>None</button>
                </div>
              </fieldset>
            </div>
            <div className="lg:col-span-3">
              <div className="grid grid-cols-2 gap-3">
                <label className="text-sm flex flex-col">
                  <span className="mb-1">Start</span>
                  <input className={["w-full border rounded-xl px-3 py-2", dark&&"bg-neutral-900 border-neutral-700"].filter(Boolean).join(' ')} type="time" value={start} onChange={e=>setStart(e.target.value)} />
                </label>
                <label className="text-sm flex flex-col">
                  <span className="mb-1">End</span>
                  <input className={["w-full border rounded-xl px-3 py-2", dark&&"bg-neutral-900 border-neutral-700"].filter(Boolean).join(' ')} type="time" value={end} onChange={e=>setEnd(e.target.value)} />
                </label>
              </div>
            </div>
            <div className="lg:col-span-1 flex lg:block items-end lg:self-end">
              <button onClick={addShift} className={["h-[42px] rounded-xl border font-medium px-4 w-full lg:w-auto", dark?"bg-neutral-800 border-neutral-700":"bg-blue-600 border-blue-600 text-white"].join(' ')}>Add</button>
            </div>
          </div>
          <div className="mt-2 space-y-2">
            <div className="text-[11px] opacity-60">Use 24:00 for end if someone works to midnight.</div>
            {notice && (
              <div className={["rounded-md px-3 py-2 text-sm border", dark?"bg-yellow-950/40 border-yellow-700 text-yellow-200":"bg-yellow-50 border-yellow-300 text-yellow-800"].join(' ')}>{notice}</div>
            )}
          </div>
        </div>
      ) : (
        <div className={["rounded-xl p-3", dark?"bg-neutral-950":"bg-neutral-50"].join(' ')}>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 items-start">
            <label className="text-sm flex flex-col">
              <span className="mb-1">Name</span>
              <input list="people" className={["w-full border rounded-xl px-3 py-2", dark&&"bg-neutral-900 border-neutral-700"].filter(Boolean).join(' ')} value={ptoPerson} onChange={e=>setPtoPerson(e.target.value)} placeholder="Agent name" />
            </label>
            <label className="text-sm flex flex-col">
              <span className="mb-1">Start date</span>
              <input className={["w-full border rounded-xl px-3 py-2", dark&&"bg-neutral-900 border-neutral-700"].filter(Boolean).join(' ')} type="date" value={ptoStart} onChange={e=>setPtoStart(e.target.value)} />
            </label>
            <label className="text-sm flex flex-col">
              <span className="mb-1">End date</span>
              <input className={["w-full border rounded-xl px-3 py-2", dark&&"bg-neutral-900 border-neutral-700"].filter(Boolean).join(' ')} type="date" value={ptoEnd} onChange={e=>setPtoEnd(e.target.value)} />
            </label>
            <label className="text-sm flex flex-col md:col-span-1">
              <span className="mb-1">Notes</span>
              <input className={["w-full border rounded-xl px-3 py-2", dark&&"bg-neutral-900 border-neutral-700"].filter(Boolean).join(' ')} value={ptoNotes} onChange={e=>setPtoNotes(e.target.value)} placeholder="Vacation, Appt, etc" />
            </label>
            <div className="flex items-end">
              <button onClick={addPto} className={["h-10 rounded-xl border font-medium px-3", dark?"bg-neutral-800 border-neutral-700":"bg-blue-600 border-blue-600 text-white"].join(' ')}>Add PTO</button>
            </div>
          </div>
        </div>
      )}

      {/* Week preview */}
      <div className="text-sm opacity-70">Preview</div>
      {DAYS.map((d,i)=>{
        const dayKey=d; const date=addDays(weekStartDate,i)
        const dayShifts=shifts.filter(s=>s.day===dayKey).sort((a,b)=>toMin(a.start)-toMin(b.start))
        const people=Array.from(new Set(dayShifts.map(s=>s.person)))
        return (
          <div key={d} className={["rounded-xl p-2", dark?"bg-neutral-950":"bg-neutral-50"].join(' ')}>
            <div className="text-sm font-semibold mb-1">{d} <span className="opacity-60">{fmtNice(date)}</span></div>
            <DayGrid date={date} dayKey={dayKey} people={people} shifts={dayShifts} pto={pto} dark={dark} tz={tz} />
          </div>
        )
      })}
    </section>
  )
}
