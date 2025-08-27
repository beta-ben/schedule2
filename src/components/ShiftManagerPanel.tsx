import React from 'react'
import { DAYS } from '../constants'
import DayPills from './DayPills'
import DayGrid from './DayGrid'
import AgentWeekGrid from './AgentWeekGrid'
import type { PTO, Shift, Task } from '../types'
import { isValidHHMM, toMin, minToHHMM, uid, shiftKey, shiftKeyOf, addDays, fmtNice, fmtYMD, shiftsForDayInTZ } from '../lib/utils'

export default function ShiftManagerPanel({ shifts, setShifts, dark, weekStartDate, pto, tz, tasks, calendarSegs }:{
  shifts: Shift[]
  setShifts: (f:(prev:Shift[])=>Shift[])=>void
  dark: boolean
  weekStartDate: Date
  pto: PTO[]
  tz: { id:string; label:string; offset:number }
  tasks: Task[]
  calendarSegs: { person:string; day:any; start:string; end:string; taskId:string }[]
}){
  // Quick add
  const [person, setPerson] = React.useState('')
  const [daysSel, setDaysSel] = React.useState(()=> new Set<string>([DAYS[1]])) // default Mon with Sun-first DAYS
  const [start, setStart] = React.useState('09:00')
  const [end, setEnd] = React.useState('17:30')
  const [endTouched, setEndTouched] = React.useState(false)
  const [endNextDay, setEndNextDay] = React.useState(false)
  const [showOtherAgentsInPreview, setShowOtherAgentsInPreview] = React.useState(true)
  const [addOpen, setAddOpen] = React.useState(true)
  const [editOpen, setEditOpen] = React.useState(true)
  const allPeople = React.useMemo(()=>Array.from(new Set(shifts.map(s=>s.person))).sort(),[shifts])

  // Helpers for overlap detection (same person)
  function normalizeInterval(startHHMM:string, endHHMM:string, forceOvernight?: boolean){
    const s = toMin(startHHMM)
    const eRaw = endHHMM==='24:00' ? 1440 : toMin(endHHMM)
    const overnight = forceOvernight ?? (eRaw<=s && endHHMM!== '24:00')
    const e = overnight ? 1440 : eRaw
    return { s, e, overnight }
  }
  function nextDay(day:string){ const i=DAYS.indexOf(day as any); return DAYS[(i+1)%7] }
  function overlaps(aS:number,aE:number,bS:number,bE:number){ return aS < bE && aE > bS }
  function segmentsFor(day:string, startHHMM:string, endHHMM:string, endDay?: string){
    const sMin = toMin(startHHMM)
    const eRaw = endHHMM==='24:00' ? 1440 : toMin(endHHMM)
    const isOver = typeof endDay==='string' ? (endDay!==day) : (eRaw<=sMin && endHHMM!=='24:00')
    if(!isOver){ return [{ day, s: sMin, e: eRaw }] }
    return [
      { day, s: sMin, e: 1440 },
      { day: nextDay(day), s: 0, e: eRaw },
    ]
  }
  function hasConflict(personName:string, day:string, sHHMM:string, eHHMM:string, endDay?: string){
    const newSegs = segmentsFor(day, sHHMM, eHHMM, endDay)
    for(const seg of newSegs){
      const existing = shifts.filter(x=> x.person===personName && x.day===seg.day)
      for(const ex of existing){
        const parts = segmentsFor(ex.day, ex.start, ex.end, (ex as any).endDay)
        for(const p of parts){ if(p.day===seg.day && overlaps(seg.s, seg.e, p.s, p.e)) return true }
      }
    }
    return false
  }

  // Auto default end = start + 8.5h unless user overrides end
  React.useEffect(()=>{
    if(!isValidHHMM(start) || endTouched) return
    const sMin = toMin(start)
    const eAbs = sMin + 510 // 8.5 hours
  if(eAbs === 1440){ setEnd('24:00'); return }
    const eMod = eAbs % 1440
    setEnd(minToHHMM(eMod))
  },[start, endTouched])
  // Auto-toggle "Ends next day" based on times
  React.useEffect(()=>{
    if(!isValidHHMM(start) || !isValidHHMM(end)) return
    if(end==='24:00'){ setEndNextDay(false); return }
    setEndNextDay(toMin(end) <= toMin(start))
  },[start, end])

  // Edit section state
  const [editAgent, setEditAgent] = React.useState('')

  // Selection for bulk
  const [selected, setSelected] = React.useState(()=> new Set<string>())
  // Results table is now always visible; no nested collapse

  const rows = React.useMemo(()=>{
    return shifts
      .filter(s=> (!editAgent || s.person===editAgent))
      .slice()
      .sort((a,b)=> a.day.localeCompare(b.day) || toMin(a.start)-toMin(b.start) || a.person.localeCompare(b.person))
  },[shifts, editAgent])

  function addShift(){
    if(!person.trim()) return alert('Enter a person name')
    if(daysSel.size===0) return alert('Select at least one day')
    if(!isValidHHMM(start) || !isValidHHMM(end)) return alert('Times must be HH:MM (00:00–24:00) with 24:00 only as an end time')
    const sMin = toMin(start); const eMin = toMin(end)
  // If end <= start and not 24:00, treat as overnight (next day)
    const p = person.trim()
    const days = Array.from(daysSel)
    const existing = new Set(shifts.map(shiftKey))
    const toAdd: Shift[] = []
    const conflicts: string[] = []
    for(const d of days){
      const k = shiftKeyOf(p, d as any, start, end)
      if(existing.has(k)) continue
      const intendedEndDay = endNextDay ? nextDay(d) : d
      if(hasConflict(p, d, start, end, intendedEndDay)) { conflicts.push(d); continue }
  toAdd.push({ id: uid(), person: p, day: d as any, start, end, endDay: intendedEndDay as any })
    }
    if(conflicts.length){ alert(`Overlaps existing shifts for ${p} on: ${conflicts.join(', ')}. Adjust times or remove conflicts.`); return }
    if(toAdd.length===0) return
  setShifts(prev=> prev.concat(toAdd))
  setStart(end)
  setEndTouched(false)
  }

  function toggleDay(d:string){ const n=new Set(daysSel); if(n.has(d)) n.delete(d); else n.add(d); setDaysSel(n) }
  function selectWeekdays(){ setDaysSel(new Set(DAYS.slice(1,6))) }
  function selectAll(){ setDaysSel(new Set(DAYS)) }
  function selectNone(){ setDaysSel(new Set()) }

  // removed day filter controls (edit is agent-focused)

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
  const [eEndDay, setEEndDay] = React.useState<Shift['day']>('Mon' as any)

  function beginEdit(r: Shift){ setEditing(r.id); setEPerson(r.person); setEDay(r.day); setEStart(r.start); setEEnd(r.end); setEEndDay((r as any).endDay || r.day) }
  function cancelEdit(){ setEditing(null) }
  function saveEdit(id:string){
    if(!ePerson.trim()) return alert('Enter a person name')
    if(!isValidHHMM(eStart) || !isValidHHMM(eEnd)) return alert('Times must be HH:MM (00:00–24:00)')
    // Overnight implied automatically if end <= start and not exactly 24:00
  const p = ePerson.trim()
  const conflicts = hasConflict(p, eDay as any, eStart, eEnd, eEndDay as any)
    if(conflicts) return alert('This shift overlaps another shift for this person. Adjust times or split shifts.')
  setShifts(prev=> prev.map(s=> s.id===id ? {...s, person:p, day:eDay, start:eStart, end:eEnd, endDay: eEndDay } : s))
    setEditing(null)
  }

  return (
  <div className={["rounded-xl p-3 space-y-4", dark?"bg-neutral-900":"bg-neutral-50"].join(' ')}>
      {/* Add Shifts section */}
  <details open={addOpen} onToggle={(e)=> setAddOpen((e.currentTarget as HTMLDetailsElement).open)} className="rounded-xl">
  <summary className={"cursor-pointer select-none px-3 py-2 text-sm font-semibold flex items-center gap-2 rounded-xl border "+(dark?"border-neutral-800":"border-neutral-200")}
     onClick={(e)=>{ e.preventDefault(); const d=(e.currentTarget.parentElement as HTMLDetailsElement); d.open=!d.open; setAddOpen(d.open) }}
                 aria-expanded={addOpen}
                 style={{ listStyle: 'none' }}
                 aria-controls="add-shifts-body"
        >
          <span className={["inline-flex items-center justify-center w-5 h-5 rounded", dark?"bg-neutral-800":"bg-neutral-100"].join(' ')} aria-hidden>
            {addOpen ? '▾' : '▸'}
          </span>
          <span>Add Shifts</span>
        </summary>
        <div id="add-shifts-body" className="px-1 pt-2">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        <div className="lg:col-span-3">
          <label className="text-sm flex flex-col">
            <span className="mb-2">Name</span>
            <input list="people" className={["w-full border rounded-xl px-3 h-10", dark&&"bg-neutral-900 border-neutral-700"].filter(Boolean).join(' ')} value={person} onChange={e=>setPerson(e.target.value)} placeholder="Agent name" />
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
        <div className="lg:col-span-4">
  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 items-end">
            <label className="text-sm flex flex-col">
              <span className="mb-1">Start</span>
              <input className={["w-full border rounded-xl px-3 h-10", dark&&"bg-neutral-900 border-neutral-700"].filter(Boolean).join(' ')} type="time" value={start} onChange={e=>{ setStart(e.target.value) }} />
            </label>
            <label className="text-sm flex flex-col">
              <span className="mb-1">End</span>
              <input className={["w-full border rounded-xl px-3 h-10", dark&&"bg-neutral-900 border-neutral-700"].filter(Boolean).join(' ')} type="time" value={end} onChange={e=>{ setEndTouched(true); setEnd(e.target.value) }} />
            </label>
            <div className="flex items-end">
              <label className="text-xs inline-flex items-center gap-2">
                <input type="checkbox" checked={endNextDay} onChange={e=>setEndNextDay(e.target.checked)} />
                <span>Ends next day</span>
              </label>
            </div>
            {/* Add button aligned with inputs */}
            <div className="flex items-end">
              <button onClick={addShift} className={["h-10 rounded-xl border font-medium px-4 w-full", dark?"bg-neutral-800 border-neutral-700":"bg-blue-600 border-blue-600 text-white"].join(' ')}>Add</button>
            </div>
          </div>
             {/* Overnight inferred automatically when End <= Start (except 24:00) */}
        </div>
        
        </div>

        {/* Preview of week with pending additions (skips exact duplicates and conflicts) */}
        <div className="mt-3">
          <div className="flex items-center justify-between">
            <div className="text-sm opacity-70">Preview of additions</div>
            <label className="text-xs inline-flex items-center gap-2 opacity-80">
              <input type="checkbox" checked={showOtherAgentsInPreview} onChange={e=>setShowOtherAgentsInPreview(e.target.checked)} />
              <span>Show other agents</span>
            </label>
          </div>
          {DAYS.map((d,i)=>{
            const dayKey=d; const date=addDays(weekStartDate,i)
            const toAdd: Shift[] = []
            if(person.trim() && daysSel.has(d)){
              const k = shiftKeyOf(person.trim(), d as any, start, end)
              const exists = new Set(shifts.map(shiftKey))
              const intendedEndDay = endNextDay ? nextDay(d) : d
              if(!exists.has(k) && !hasConflict(person.trim(), d, start, end, intendedEndDay)){
                toAdd.push({ id:`preview-${d}-${start}-${end}`, person: person.trim(), day: d as any, start, end, endDay: intendedEndDay as any })
              }
            }
            const combined = shifts.concat(toAdd)
            const dayShiftsAll=shiftsForDayInTZ(combined, dayKey as any, tz.offset).sort((a,b)=>toMin(a.start)-toMin(b.start))
            const onlyPerson = person.trim()
            const dayShifts = (!showOtherAgentsInPreview && onlyPerson)
              ? dayShiftsAll.filter(s=> s.person===onlyPerson)
              : dayShiftsAll
            const people=Array.from(new Set(dayShifts.map(s=>s.person)))
            return (
              <div key={d} className={["rounded-xl p-2 mt-2", dark?"bg-neutral-950":"bg-neutral-50"].join(' ')}>
                <div className="text-sm font-semibold mb-1">{d} <span className="opacity-60">{fmtNice(date)}</span></div>
                <DayGrid
                  date={date}
                  dayKey={dayKey}
                  people={people}
                  shifts={dayShifts}
                  pto={pto}
                  dark={dark}
                  tz={tz}
                  tasks={tasks}
                  showHeaderTitle={false}
                  compact={showOtherAgentsInPreview}
                />
              </div>
            )
          })}
        </div>
        </div>
      </details>

      {/* Edit Shifts section */}
  <details open={editOpen} onToggle={(e)=> setEditOpen((e.currentTarget as HTMLDetailsElement).open)} className="rounded-xl">
  <summary className={"cursor-pointer select-none px-3 py-2 text-sm font-semibold flex items-center gap-2 rounded-xl border "+(dark?"border-neutral-800":"border-neutral-200")}
     onClick={(e)=>{ e.preventDefault(); const d=(e.currentTarget.parentElement as HTMLDetailsElement); d.open=!d.open; setEditOpen(d.open) }}
                 aria-expanded={editOpen}
                 style={{ listStyle: 'none' }}
                 aria-controls="edit-shifts-body"
        >
          <span className={["inline-flex items-center justify-center w-5 h-5 rounded", dark?"bg-neutral-800":"bg-neutral-100"].join(' ')} aria-hidden>
            {editOpen ? '▾' : '▸'}
          </span>
          <span>Edit Shifts</span>
        </summary>
        <div id="edit-shifts-body" className="pt-2">
        <div className="flex flex-wrap gap-2 items-end mb-2">
          <label className="text-sm flex items-center gap-2">
            <span>Agent</span>
            <select className={["border rounded-xl px-2 py-1", dark&&"bg-neutral-900 border-neutral-700"].filter(Boolean).join(' ')} value={editAgent} onChange={e=>setEditAgent(e.target.value)}>
              <option value="">—</option>
              {allPeople.map(p=> <option key={p} value={p}>{p}</option>)}
            </select>
          </label>
          <div className="ml-auto flex gap-2">
            <button onClick={selectAllFiltered} className={["px-3 py-1.5 rounded-lg border text-sm", dark?"border-neutral-700":"border-neutral-300"].join(' ')}>Select all</button>
            <button onClick={clearSelection} className={["px-3 py-1.5 rounded-lg border text-sm", dark?"border-neutral-700":"border-neutral-300"].join(' ')}>Clear selection</button>
            <button onClick={deleteSelected} className={["px-3 py-1.5 rounded-lg border text-sm", "bg-red-600 border-red-600 text-white"].join(' ')}>Delete selected ({selected.size})</button>
            <button onClick={dedupeExact} className={["px-3 py-1.5 rounded-lg border text-sm", dark?"bg-neutral-800 border-neutral-700":"bg-neutral-200 border-neutral-300"].join(' ')}>Remove exact duplicates</button>
          </div>
        </div>

        {editAgent ? (
          <div className={["rounded-xl p-2", dark?"bg-neutral-950":"bg-neutral-50"].join(' ')}>
            <AgentWeekGrid
              dark={dark}
              tz={tz}
              weekStart={fmtYMD(weekStartDate)}
              agent={editAgent}
              shifts={shifts}
              pto={pto}
              tasks={tasks}
              calendarSegs={calendarSegs as any}
            />
          </div>
        ) : null}

        {/* Results (table) - static */}
        <div className="mt-2">
          <div className={"px-3 py-2 text-sm font-medium flex items-center gap-2 rounded-xl border "+(dark?"border-neutral-800":"border-neutral-200")}>
            <span>Results</span>
            <span className="opacity-60 text-xs">({rows.length})</span>
          </div>
          <div className={["mt-2 border rounded-xl overflow-auto no-scrollbar", dark?"border-neutral-800":"border-neutral-300"].join(' ')}>
            <table className="min-w-full text-sm">
              <thead className={dark?"bg-neutral-900":"bg-white"}>
                <tr>
                  <th className="px-3 py-2 text-left w-10">✓</th>
                  <th className="px-3 py-2 text-left">Person</th>
                  <th className="px-3 py-2 text-left">Day</th>
                  <th className="px-3 py-2 text-left">Start</th>
                  <th className="px-3 py-2 text-left">End</th>
                  <th className="px-3 py-2 text-left">End Day</th>
                  <th className="px-3 py-2 text-left w-28">Actions</th>
                </tr>
              </thead>
              <tbody className={dark?"divide-y divide-neutral-800":"divide-y divide-neutral-200"}>
                {rows.length===0 ? (
                  <tr><td colSpan={7} className="px-3 py-6 text-center opacity-70">{editAgent? 'No shifts for this agent.' : 'Choose an agent to edit shifts.'}</td></tr>
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
                        <td className="px-3 py-1.5"><input type="time" className={["w-full border rounded px-2 py-1", dark&&"bg-neutral-900 border-neutral-700"].filter(Boolean).join(' ')} value={eEnd} onChange={e=>setEEnd(e.target.value)} /></td>
                        <td className="px-3 py-1.5">
                          <select className={["border rounded px-2 py-1 w-full", dark&&"bg-neutral-900 border-neutral-700"].filter(Boolean).join(' ')} value={eEndDay} onChange={e=>setEEndDay(e.target.value as any)}>
                            {DAYS.map(d=> <option key={d} value={d}>{d}</option>)}
                          </select>
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
                        <td className="px-3 py-1.5">{(r as any).endDay || r.day}</td>
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
        </div>
        </div>
      </details>

      

  {/* datalist options for people */}
      <datalist id="people">
        {allPeople.map(p=> <option key={p} value={p} />)}
      </datalist>
    </div>
  )
}
