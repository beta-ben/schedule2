import React from 'react'
import { DAYS } from '../constants'
import DayPills from './DayPills'
import type { Shift } from '../types'
import { isValidHHMM, toMin, uid, shiftKey, shiftKeyOf } from '../lib/utils'

export default function ShiftManagerPanel({ shifts, setShifts, dark }:{
  shifts: Shift[]
  setShifts: (f:(prev:Shift[])=>Shift[])=>void
  dark: boolean
}){
  // Quick add
  const [person, setPerson] = React.useState('')
  const [daysSel, setDaysSel] = React.useState(()=> new Set<string>([DAYS[1]])) // default Mon with Sun-first DAYS
  const [start, setStart] = React.useState('09:00')
  const [end, setEnd] = React.useState('17:30')
  const [overnight, setOvernight] = React.useState(false)
  const allPeople = React.useMemo(()=>Array.from(new Set(shifts.map(s=>s.person))).sort(),[shifts])

  // Filters
  const [fPerson, setFPerson] = React.useState('')
  const [fDays, setFDays] = React.useState(()=> new Set<string>(DAYS))

  // Selection for bulk
  const [selected, setSelected] = React.useState(()=> new Set<string>())

  const rows = React.useMemo(()=>{
    const lc = (fPerson||'').toLowerCase()
    return shifts
      .filter(s=> (!lc || s.person.toLowerCase().includes(lc)) && (fDays.size===0 || fDays.has(s.day)))
      .slice()
      .sort((a,b)=> a.day.localeCompare(b.day) || toMin(a.start)-toMin(b.start) || a.person.localeCompare(b.person))
  },[shifts,fPerson,fDays])

  function addShift(){
    if(!person.trim()) return alert('Enter a person name')
    if(daysSel.size===0) return alert('Select at least one day')
    if(!isValidHHMM(start) || !isValidHHMM(end)) return alert('Times must be HH:MM (00:00–24:00) with 24:00 only as an end time')
    const sMin = toMin(start); const eMin = toMin(end)
    if(!overnight && eMin<=sMin && end!=="24:00") return alert('End must be after start (or exactly 24:00), or enable Overnight')
    const p = person.trim()
    const days = Array.from(daysSel)
    const existing = new Set(shifts.map(shiftKey))
    const toAdd: Shift[] = []
    for(const d of days){
      const k = shiftKeyOf(p, d as any, start, end)
      if(existing.has(k)) continue
      toAdd.push({ id: uid(), person: p, day: d as any, start, end })
    }
    if(toAdd.length===0) return
    setShifts(prev=> prev.concat(toAdd))
    setStart(end)
  }

  function toggleDay(d:string){ const n=new Set(daysSel); if(n.has(d)) n.delete(d); else n.add(d); setDaysSel(n) }
  function selectWeekdays(){ setDaysSel(new Set(DAYS.slice(1,6))) }
  function selectAll(){ setDaysSel(new Set(DAYS)) }
  function selectNone(){ setDaysSel(new Set()) }

  function toggleFilterDay(d:string){ const n=new Set(fDays); if(n.has(d)) n.delete(d); else n.add(d); setFDays(n) }
  function selectAllFilterDays(){ setFDays(new Set(DAYS)) }
  function clearAllFilterDays(){ setFDays(new Set()) }

  function toggle(id:string){ const n=new Set(selected); if(n.has(id)) n.delete(id); else n.add(id); setSelected(n) }
  function selectAllFiltered(){ setSelected(new Set(rows.map(r=>r.id))) }
  function clearSelection(){ setSelected(new Set()) }
  function deleteSelected(){ if(selected.size===0) return alert('Select at least one row.'); if(!confirm(`Delete ${selected.size} shift(s)?`)) return; const rm=new Set(selected); setShifts(prev=> prev.filter(s=> !rm.has(s.id))); setSelected(new Set()) }
  function dedupeExact(){ const seen=new Set<string>(); const dupIds:string[]=[]; for(const s of shifts){ const k=shiftKey(s as any); if(seen.has(k)) dupIds.push(s.id); else seen.add(k)}; if(dupIds.length===0){ alert('No exact duplicates.'); return } if(!confirm(`Remove ${dupIds.length} exact duplicate shift(s)?`)) return; const rm=new Set(dupIds); setShifts(prev=> prev.filter(s=> !rm.has(s.id))) }

  // Inline edit (single row at a time)
  const [editing, setEditing] = React.useState<string|null>(null)
  const [ePerson, setEPerson] = React.useState('')
  const [eDay, setEDay] = React.useState<Shift['day']>('Mon' as any)
  const [eStart, setEStart] = React.useState('')
  const [eEnd, setEEnd] = React.useState('')
  const [eOvernight, setEOvernight] = React.useState(false)

  function beginEdit(r: Shift){ setEditing(r.id); setEPerson(r.person); setEDay(r.day); setEStart(r.start); setEEnd(r.end); setEOvernight(toMin(r.end)<=toMin(r.start) && r.end!=="24:00") }
  function cancelEdit(){ setEditing(null) }
  function saveEdit(id:string){
    if(!ePerson.trim()) return alert('Enter a person name')
    if(!isValidHHMM(eStart) || !isValidHHMM(eEnd)) return alert('Times must be HH:MM (00:00–24:00)')
    const sMin = toMin(eStart); const eMin = toMin(eEnd)
    if(!eOvernight && eMin<=sMin && eEnd!=="24:00") return alert('End must be after start (or exactly 24:00), or enable Overnight')
    setShifts(prev=> prev.map(s=> s.id===id ? {...s, person:ePerson.trim(), day:eDay, start:eStart, end:eEnd } : s))
    setEditing(null)
  }

  return (
    <div className={["rounded-xl p-3", dark?"bg-neutral-950":"bg-neutral-50"].join(' ')}>
      {/* Add */}
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
            <DayPills value={daysSel as any} onChange={setDaysSel as any} dark={dark} />
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
          <label className="mt-2 inline-flex items-center gap-2 text-sm">
            <input type="checkbox" checked={overnight} onChange={e=>setOvernight(e.target.checked)} />
            <span>Overnight (ends next day)</span>
          </label>
        </div>
        <div className="lg:col-span-1 flex lg:block items-end lg:self-end">
          <button onClick={addShift} className={["h-[42px] rounded-xl border font-medium px-4 w-full lg:w-auto", dark?"bg-neutral-800 border-neutral-700":"bg-blue-600 border-blue-600 text-white"].join(' ')}>Add</button>
        </div>
      </div>

      {/* Filters & actions */}
      <div className="mt-4 grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
        <div className="md:col-span-3">
          <label className="text-sm flex flex-col">
            <span className="mb-1">Filter by person</span>
            <input className={["w-full border rounded-xl px-3 py-2", dark&&"bg-neutral-900 border-neutral-700"].filter(Boolean).join(' ')} value={fPerson} onChange={e=>setFPerson(e.target.value)} placeholder="Name contains…" />
          </label>
        </div>
        <div className="md:col-span-5">
          <fieldset className="text-sm">
            <legend className="mb-1">Days</legend>
            <div className="flex flex-wrap gap-2">
              {DAYS.map(d=>{
                const active = fDays.has(d)
                const base = 'px-3 py-1.5 rounded-full border text-sm leading-none'
                const activeCls = dark?'bg-neutral-800 border-neutral-600 text-white':'bg-blue-600 border-blue-600 text-white'
                const idleCls = dark?'border-neutral-700 text-neutral-200 hover:bg-neutral-900':'border-neutral-300 text-neutral-700 hover:bg-neutral-100'
                return (
                  <button key={d} type="button" onClick={()=>toggleFilterDay(d)} className={[base, active?activeCls:idleCls].join(' ')}>{d}</button>
                )
              })}
              <button onClick={selectAllFilterDays} className={["px-2 py-1 rounded-lg border text-xs", dark?"border-neutral-700":"border-neutral-300"].join(' ')}>All</button>
              <button onClick={clearAllFilterDays} className={["px-2 py-1 rounded-lg border text-xs", dark?"border-neutral-700":"border-neutral-300"].join(' ')}>None</button>
            </div>
          </fieldset>
        </div>
        <div className="md:col-span-4 flex flex-wrap gap-2">
          <button onClick={selectAllFiltered} className={["px-3 py-1.5 rounded-lg border text-sm", dark?"border-neutral-700":"border-neutral-300"].join(' ')}>Select all filtered</button>
          <button onClick={clearSelection} className={["px-3 py-1.5 rounded-lg border text-sm", dark?"border-neutral-700":"border-neutral-300"].join(' ')}>Clear selection</button>
          <button onClick={deleteSelected} className={["px-3 py-1.5 rounded-lg border text-sm", "bg-red-600 border-red-600 text-white"].join(' ')}>Delete selected ({selected.size})</button>
          <button onClick={dedupeExact} className={["px-3 py-1.5 rounded-lg border text-sm", dark?"bg-neutral-800 border-neutral-700":"bg-neutral-200 border-neutral-300"].join(' ')}>Remove exact duplicates</button>
        </div>
      </div>

      {/* Table */}
  <div className={["mt-3 border rounded-xl overflow-auto no-scrollbar", dark?"border-neutral-800":"border-neutral-300"].join(' ')}>
        <table className="min-w-full text-sm">
          <thead className={dark?"bg-neutral-900":"bg-white"}>
            <tr>
              <th className="px-3 py-2 text-left w-10">✓</th>
              <th className="px-3 py-2 text-left">Person</th>
              <th className="px-3 py-2 text-left">Day</th>
              <th className="px-3 py-2 text-left">Start</th>
              <th className="px-3 py-2 text-left">End</th>
              <th className="px-3 py-2 text-left w-28">Actions</th>
            </tr>
          </thead>
          <tbody className={dark?"divide-y divide-neutral-800":"divide-y divide-neutral-200"}>
            {rows.length===0 ? (
              <tr><td colSpan={6} className="px-3 py-6 text-center opacity-70">No shifts match the current filters.</td></tr>
            ) : rows.map(r=> (
              <tr key={r.id} className={dark?"hover:bg-neutral-900":"hover:bg-neutral-50"}>
                <td className="px-3 py-1.5"><input type="checkbox" checked={selected.has(r.id)} onChange={()=>toggle(r.id)} /></td>
                {editing===r.id ? (
                  <>
                    <td className="px-3 py-1.5"><input list="people" className={["w-full border rounded px-2 py-1", dark&&"bg-neutral-900 border-neutral-700"].filter(Boolean).join(' ')} value={ePerson} onChange={e=>setEPerson(e.target.value)} /></td>
                    <td className="px-3 py-1.5">
                      <select className={["border rounded px-2 py-1", dark&&"bg-neutral-900 border-neutral-700"].filter(Boolean).join(' ')} value={eDay} onChange={e=>setEDay(e.target.value as any)}>
                        {DAYS.map(d=> <option key={d} value={d}>{d}</option>)}
                      </select>
                    </td>
                    <td className="px-3 py-1.5"><input type="time" className={["w-full border rounded px-2 py-1", dark&&"bg-neutral-900 border-neutral-700"].filter(Boolean).join(' ')} value={eStart} onChange={e=>setEStart(e.target.value)} /></td>
                    <td className="px-3 py-1.5">
                      <div className="flex items-center gap-2">
                        <input type="time" className={["w-full border rounded px-2 py-1", dark&&"bg-neutral-900 border-neutral-700"].filter(Boolean).join(' ')} value={eEnd} onChange={e=>setEEnd(e.target.value)} />
                        <label className="inline-flex items-center gap-1 text-xs opacity-80"><input type="checkbox" checked={eOvernight} onChange={e=>setEOvernight(e.target.checked)} /> Overnight</label>
                      </div>
                    </td>
                    <td className="px-3 py-1.5">
                      <div className="flex gap-2">
                        <button onClick={()=>saveEdit(r.id)} className={["px-2 py-1 rounded border text-xs", dark?"bg-neutral-800 border-neutral-700":"bg-blue-600 border-blue-600 text-white"].join(' ')}>Save</button>
                        <button onClick={cancelEdit} className={["px-2 py-1 rounded border text-xs", dark?"border-neutral-700":"border-neutral-300"].join(' ')}>Cancel</button>
                      </div>
                    </td>
                  </>
                ) : (
                  <>
                    <td className="px-3 py-1.5 font-medium">{r.person}</td>
                    <td className="px-3 py-1.5">{r.day}</td>
                    <td className="px-3 py-1.5">{r.start}</td>
                    <td className="px-3 py-1.5">{r.end}</td>
                    <td className="px-3 py-1.5">
                      <div className="flex gap-2">
                        <button onClick={()=>beginEdit(r)} className={["px-2 py-1 rounded border text-xs", dark?"border-neutral-700":"border-neutral-300"].join(' ')}>Edit</button>
                        <button onClick={()=>{ if(confirm('Delete this shift?')) setShifts(prev=>prev.filter(s=>s.id!==r.id)) }} className={["px-2 py-1 rounded border text-xs", "bg-red-600 border-red-600 text-white"].join(' ')}>Delete</button>
                      </div>
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* datalist options for people */}
      <datalist id="people">
        {allPeople.map(p=> <option key={p} value={p} />)}
      </datalist>
    </div>
  )
}
