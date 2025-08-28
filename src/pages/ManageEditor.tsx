import React from 'react'
import { DAYS } from '../constants'
import DayGrid from '../components/DayGrid'
import ShiftManagerPanel from '../components/ShiftManagerPanel'
import { addDays, fmtNice, fmtYMD, parseYMD, toMin, uid, shiftsForDayInTZ, mergeSegments, sha256Hex } from '../lib/utils'
import type { PTO, Shift, Task, ShiftSegment } from '../types'
import { cloudGet, cloudPost } from '../lib/api'
import TaskConfigPanel from '../components/TaskConfigPanel'
import Legend from '../components/Legend'

export default function ManageEditor({ dark, weekStartDate, shifts, setShifts, pto, setPto, tasks, setTasks, calendarSegs, setCalendarSegs, tz, isDraft=false, agents }:{ 
  dark: boolean
  weekStartDate: Date
  shifts: Shift[]
  setShifts: (f:(prev:Shift[])=>Shift[])=>void
  pto: PTO[]
  setPto: (f:(prev:PTO[])=>PTO[])=>void
  tasks: Task[]
  setTasks: (f:(prev:Task[])=>Task[])=>void
  calendarSegs: { person:string; day: any; start:string; end:string; taskId:string }[]
  setCalendarSegs: (f:(prev:{ person:string; day:any; start:string; end:string; taskId:string }[])=>{ person:string; day:any; start:string; end:string; taskId:string }[])=>void
  tz: { id:string; label:string; offset:number }
  isDraft?: boolean
  agents?: Array<{ id?: string; firstName?: string; lastName?: string }>
}){
  const [tab, setTab] = React.useState<'shifts'|'pto'|'tasks'>('shifts')

  const [ptoPerson, setPtoPerson] = React.useState('')
  const [ptoStart, setPtoStart]   = React.useState(fmtYMD(weekStartDate))
  const [ptoEnd, setPtoEnd]       = React.useState(fmtYMD(addDays(weekStartDate, 1)))
  const [ptoNotes, setPtoNotes]   = React.useState('')
  const [ptoFilter, setPtoFilter] = React.useState('')
  const [ptoSelected, setPtoSelected] = React.useState(()=> new Set<string>())
  const [filterOpen, setFilterOpen] = React.useState(true)

  const ptoRows = React.useMemo(()=>{
    const lc = (ptoFilter||'').toLowerCase()
    return pto
      .filter(r => !lc || r.person.toLowerCase().includes(lc))
      .slice()
      .sort((a,b)=> a.startDate.localeCompare(b.startDate) || a.person.localeCompare(b.person))
  },[pto, ptoFilter])

  function togglePto(id:string){ const n=new Set(ptoSelected); if(n.has(id)) n.delete(id); else n.add(id); setPtoSelected(n) }
  function selectAllPtoFiltered(){ setPtoSelected(new Set(ptoRows.map(r=>r.id))) }
  function clearPtoSelection(){ setPtoSelected(new Set()) }
  function deleteSelectedPto(){ if(ptoSelected.size===0) return alert('Select at least one PTO row.'); if(!confirm(`Delete ${ptoSelected.size} PTO entr${ptoSelected.size===1?'y':'ies'}?`)) return; const rm=new Set(ptoSelected); setPto(prev=> prev.filter(r=> !rm.has(r.id))); setPtoSelected(new Set()) }
  function deleteAllFilteredPto(){ if(ptoRows.length===0) return alert('No PTO rows match the current filter.'); if(!confirm(`Delete ALL ${ptoRows.length} filtered PTO entr${ptoRows.length===1?'y':'ies'}? This cannot be undone.`)) return; const rm=new Set(ptoRows.map(r=>r.id)); setPto(prev=> prev.filter(r=> !rm.has(r.id))); setPtoSelected(new Set()) }

  const allPeople = React.useMemo(()=>Array.from(new Set(shifts.map(s=>s.person))).sort(),[shifts])
  const [notice,setNotice]=React.useState<string|null>(null)

  // Auto-sync posture assignments (calendarSegs) to cloud when they change
  const lastCalHashRef = React.useRef<string|null>(null)
  React.useEffect(()=>{
    if(isDraft) return // never push draft changes to cloud
    // Debounce to coalesce rapid changes
    const timer = setTimeout(async()=>{
      try{
        const h = await sha256Hex(JSON.stringify(calendarSegs))
        if(h === lastCalHashRef.current) return
        const ok = await cloudPost({ shifts, pto, calendarSegs, updatedAt: new Date().toISOString() })
        if(ok){ lastCalHashRef.current = h }
      }catch{}
    }, 600)
    return ()=> clearTimeout(timer)
    // Only trigger on posture assignment changes (not shifts/PTO)
  }, [calendarSegs, isDraft])

  // Posture assignment (calendar-style) — allow any active posture
  const activeTasks = React.useMemo(()=> tasks.filter(t=>!t.archived),[tasks])
  const [assignee, setAssignee] = React.useState('')
  const [assignDay, setAssignDay] = React.useState<typeof DAYS[number]>('Mon' as any)
  const [assignStart, setAssignStart] = React.useState('09:00')
  const [assignEnd, setAssignEnd] = React.useState('10:00')
  const [assignTaskId, setAssignTaskId] = React.useState<string>('support')
  React.useEffect(()=>{
    if(!activeTasks.find(t=>t.id===assignTaskId)){
      setAssignTaskId(activeTasks[0]?.id || '')
    }
  },[activeTasks, assignTaskId])

  function addPto(){
    if(!ptoPerson.trim()) return alert('Enter a person name')
    const sd = parseYMD(ptoStart); const ed = parseYMD(ptoEnd)
    if(!(sd instanceof Date) || isNaN(sd.getTime()) || !(ed instanceof Date) || isNaN(ed.getTime())) return alert('Invalid dates')
    if(sd>ed) return alert('End date must be on/after start date')
    const rec = { id: uid(), person: ptoPerson.trim(), startDate: ptoStart, endDate: ptoEnd, notes: ptoNotes }
    setPto(prev=> prev.concat([rec]))
  }

  function exportData(){
    const data = JSON.stringify({ shifts, pto, calendarSegs }, null, 2)
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
          <button onClick={()=>setTab('tasks')} className={["px-3 py-1.5 rounded-lg border text-sm", tab==='tasks' ? (dark?"bg-neutral-800 border-neutral-600":"bg-blue-600 border-blue-600 text-white") : (dark?"border-neutral-700":"border-neutral-300")].join(' ')}>Postures</button>
        </div>
        <div className="flex gap-2">
          <button onClick={exportData} className={["px-3 py-1.5 rounded-lg border text-sm", dark?"border-neutral-600":"border-neutral-300"].join(' ')}>Export JSON</button>
          <button onClick={async()=>{ const data=await cloudGet(); if(data){ setShifts(()=>data.shifts); setPto(()=>data.pto); if(Array.isArray(data.calendarSegs)) setCalendarSegs(()=>data.calendarSegs as any) } }} className={["px-3 py-1.5 rounded-lg border text-sm", dark?"border-neutral-600":"border-neutral-300"].join(' ')}>Load Cloud</button>
          <button
            disabled={isDraft}
            title={isDraft ? 'Disabled in Draft mode. Use Publish to update live.' : 'Save to cloud (live).'}
            onClick={async()=>{ if(isDraft) return; await cloudPost({shifts, pto, calendarSegs, updatedAt:new Date().toISOString()}); }}
            className={["px-3 py-1.5 rounded-lg border text-sm", isDraft?"opacity-50 cursor-not-allowed":(dark?"border-neutral-600":"border-neutral-300")].join(' ')}
          >Save Cloud</button>
        </div>
      </div>

      {tab==='shifts' ? (
        <ShiftManagerPanel
          shifts={shifts}
          setShifts={setShifts}
          dark={dark}
          weekStartDate={weekStartDate}
          pto={pto}
          tz={tz}
          tasks={tasks}
          calendarSegs={calendarSegs}
          agents={agents}
        />
      ) : (
        tab==='pto' ? (
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
          {/* PTO list with removal */}
          <div className="mt-4">
            <details
              className={["rounded-xl border", dark?"bg-neutral-900 border-neutral-800":"bg-white border-neutral-200"].join(' ')}
              open={filterOpen}
              onToggle={(e)=> setFilterOpen((e.target as HTMLDetailsElement).open)}
            >
              <summary className="cursor-pointer select-none px-3 py-2 text-sm font-medium flex items-center gap-2">
                <span className={["inline-flex items-center justify-center w-5 h-5 rounded", dark?"bg-neutral-800":"bg-neutral-100"].join(' ')} aria-hidden>
                  {filterOpen ? '▾' : '▸'}
                </span>
                <span>Filter by person</span>
                <span className="opacity-60 text-xs">(click to {filterOpen ? 'collapse' : 'expand'})</span>
              </summary>
              <div className="px-3 pb-3">
                <label className="text-sm flex flex-col">
                  <input className={["w-64 border rounded-xl px-3 py-2", dark&&"bg-neutral-900 border-neutral-700"].filter(Boolean).join(' ')} value={ptoFilter} onChange={e=>setPtoFilter(e.target.value)} placeholder="Name contains…" />
                </label>
              </div>
            </details>
            <div className="mt-2 flex flex-wrap gap-2">
              <button onClick={selectAllPtoFiltered} className={["px-3 py-1.5 rounded-lg border text-sm", dark?"border-neutral-700":"border-neutral-300"].join(' ')}>Select all filtered</button>
              <button onClick={clearPtoSelection} className={["px-3 py-1.5 rounded-lg border text-sm", dark?"border-neutral-700":"border-neutral-300"].join(' ')}>Clear selection</button>
              <button onClick={deleteSelectedPto} className={["px-3 py-1.5 rounded-lg border text-sm", "bg-red-600 border-red-600 text-white"].join(' ')}>Delete selected ({ptoSelected.size})</button>
              <button onClick={deleteAllFilteredPto} className={["px-3 py-1.5 rounded-lg border text-sm", "bg-red-700 border-red-700 text-white"].join(' ')}>Delete ALL filtered ({ptoRows.length})</button>
            </div>
            <div className={["mt-3 border rounded-xl overflow-auto no-scrollbar", dark?"border-neutral-800":"border-neutral-300"].join(' ')}>
              <table className="min-w-full text-sm">
                <thead className={dark?"bg-neutral-900":"bg-white"}>
                  <tr>
                    <th className="px-3 py-2 text-left w-10">✓</th>
                    <th className="px-3 py-2 text-left">Person</th>
                    <th className="px-3 py-2 text-left">Start</th>
                    <th className="px-3 py-2 text-left">End</th>
                    <th className="px-3 py-2 text-left">Notes</th>
                    <th className="px-3 py-2 text-left w-20">Actions</th>
                  </tr>
                </thead>
                <tbody className={dark?"divide-y divide-neutral-800":"divide-y divide-neutral-200"}>
                  {ptoRows.length===0 ? (
                    <tr><td colSpan={6} className="px-3 py-6 text-center opacity-70">No PTO entries.</td></tr>
                  ) : ptoRows.map(r => (
                    <tr key={r.id} className={dark?"hover:bg-neutral-900":"hover:bg-neutral-50"}>
                      <td className="px-3 py-1.5"><input type="checkbox" checked={ptoSelected.has(r.id)} onChange={()=>togglePto(r.id)} /></td>
                      <td className="px-3 py-1.5 font-medium">{r.person}</td>
                      <td className="px-3 py-1.5">{r.startDate}</td>
                      <td className="px-3 py-1.5">{r.endDate}</td>
                      <td className="px-3 py-1.5">{r.notes}</td>
                      <td className="px-3 py-1.5">
                        <button onClick={()=>{ if(confirm('Delete this PTO entry?')) setPto(prev=>prev.filter(p=>p.id!==r.id)) }} className={["px-2 py-1 rounded border text-xs", "bg-red-600 border-red-600 text-white"].join(' ')}>Delete</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
        ) : (
          <div className="space-y-4">
          <TaskConfigPanel
            tasks={tasks}
            onCreate={(t)=> setTasks(prev=> prev.concat([{ ...t, id: uid() }]))}
            onUpdate={(t)=> setTasks(prev=> prev.map(x=> x.id===t.id ? t : x))}
            onArchive={(id)=> setTasks(prev=> prev.map(x=> x.id===id ? {...x, archived:true} : x))}
            onDelete={(id)=>{ setTasks(prev=> prev.filter(x=> x.id!==id)); setCalendarSegs(prev=> prev.filter(cs=> cs.taskId!==id)) }}
            dark={dark}
          />
          {/* Assignment form */}
          <div className={["rounded-xl p-3", dark?"bg-neutral-950":"bg-neutral-50"].join(' ')}>
            <div className="text-sm font-medium mb-2">Assign posture to agent</div>
            <div className="grid grid-cols-1 md:grid-cols-6 gap-3 items-end">
              <label className="text-sm flex flex-col">
                <span className="mb-1">Agent</span>
                <select className={["w-full border rounded-xl px-3 py-2", dark&&"bg-neutral-900 border-neutral-700"].filter(Boolean).join(' ')} value={assignee} onChange={e=>setAssignee(e.target.value)}>
                  <option value="">—</option>
                  {allPeople.map(p=> <option key={p} value={p}>{p}</option>)}
                </select>
              </label>
              <label className="text-sm flex flex-col">
                <span className="mb-1">Day</span>
                <select className={["w-full border rounded-xl px-3 py-2", dark&&"bg-neutral-900 border-neutral-700"].filter(Boolean).join(' ')} value={assignDay} onChange={e=>setAssignDay(e.target.value as any)}>
                  {DAYS.map(d=> <option key={d} value={d}>{d}</option>)}
                </select>
              </label>
              <label className="text-sm flex flex-col">
                <span className="mb-1">Start</span>
                <input type="time" className={["w-full border rounded-xl px-3 py-2", dark&&"bg-neutral-900 border-neutral-700"].filter(Boolean).join(' ')} value={assignStart} onChange={e=>setAssignStart(e.target.value)} />
              </label>
              <label className="text-sm flex flex-col">
                <span className="mb-1">End</span>
                <input type="time" className={["w-full border rounded-xl px-3 py-2", dark&&"bg-neutral-900 border-neutral-700"].filter(Boolean).join(' ')} value={assignEnd} onChange={e=>setAssignEnd(e.target.value)} />
              </label>
              <label className="text-sm flex flex-col">
                <span className="mb-1">Task</span>
                <select className={["w-full border rounded-xl px-3 py-2", dark&&"bg-neutral-900 border-neutral-700"].filter(Boolean).join(' ')} value={assignTaskId} onChange={e=>setAssignTaskId(e.target.value)}>
                  {activeTasks.map(t=> <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </label>
              <div>
                <button
                  onClick={()=>{
                    if(!assignee) return alert('Choose an agent')
                    if(!assignTaskId) return alert('Choose a posture')
                    // Validate time
                    const aS = toMin(assignStart)
                    const aE = toMin(assignEnd)
                    if(!(aE > aS)) return alert('End must be after start')
                    // Ensure it overlaps an existing shift for the agent/day so it appears in the preview
                    const dayShiftsLocal = shiftsForDayInTZ(shifts, assignDay as any, tz.offset).filter(s=>s.person===assignee)
                    const overlaps = dayShiftsLocal.some(s=>{
                      const sS = toMin(s.start)
                      const sE = s.end==='24:00' ? 1440 : toMin(s.end)
                      return aS < sE && aE > sS
                    })
                    if(!overlaps){
                      alert('No shift overlaps that time for this agent on that day. This posture will not show in the preview until it overlaps a shift.')
                      return
                    }
                    setCalendarSegs(prev=> prev.concat([{ person: assignee, day: assignDay, start: assignStart, end: assignEnd, taskId: assignTaskId }]))
                  }}
                  className={["h-10 rounded-xl border font-medium px-4", dark?"bg-neutral-800 border-neutral-700":"bg-blue-600 border-blue-600 text-white"].join(' ')}
                >Add</button>
              </div>
            </div>
          </div>

          {/* Assigned postures list */}
          <AssignedPosturesList
            dark={dark}
            calendarSegs={calendarSegs}
            setCalendarSegs={setCalendarSegs}
            tasks={tasks}
            allPeople={allPeople}
            tz={tz}
            shifts={shifts}
          />
        </div>
        )
      )}

      {/* Week preview (not shown in Postures tab) */}
      {tab!== 'tasks' && (
        <>
          <div className="text-sm opacity-70">Preview</div>
          {DAYS.map((d,i)=>{
            const dayKey=d; const date=addDays(weekStartDate,i)
            const base=shiftsForDayInTZ(shifts, dayKey as any, tz.offset).sort((a,b)=>toMin(a.start)-toMin(b.start))
            const dayShifts=base.map(s=>{
              const cal = calendarSegs
                .filter(cs=> cs.person===s.person && cs.day===dayKey)
                .map(cs=> ({ taskId: cs.taskId, start: cs.start, end: cs.end }))
              const segments = mergeSegments(s, cal)
              return segments && segments.length>0 ? { ...s, segments } : s
            })
            const people=Array.from(new Set(dayShifts.map(s=>s.person)))
            return (
              <div key={d} className={["rounded-xl p-2", dark?"bg-neutral-950":"bg-neutral-50"].join(' ')}>
                <div className="text-sm font-semibold mb-1">{d} <span className="opacity-60">{fmtNice(date)}</span></div>
                <DayGrid date={date} dayKey={dayKey} people={people} shifts={dayShifts} pto={pto} dark={dark} tz={tz} tasks={tasks} showHeaderTitle={false} />
              </div>
            )
          })}
          <div className="mt-2">
            <Legend tasks={tasks} dark={dark} />
          </div>
        </>
      )}
      <datalist id="people">
        {allPeople.map(p=> <option key={p} value={p} />)}
      </datalist>
    </section>
  )
}

function AssignedPosturesList({ dark, calendarSegs, setCalendarSegs, tasks, allPeople, tz, shifts }:{
  dark: boolean
  calendarSegs: { person:string; day:any; start:string; end:string; taskId:string }[]
  setCalendarSegs: (f:(prev:{ person:string; day:any; start:string; end:string; taskId:string }[])=>{ person:string; day:any; start:string; end:string; taskId:string }[])=>void
  tasks: { id:string; name:string; color:string; archived?:boolean }[]
  allPeople: string[]
  tz: { id:string; label:string; offset:number }
  shifts: Shift[]
}){
  const [editingIdx, setEditingIdx] = React.useState<number|null>(null)
  const [filterTaskId, setFilterTaskId] = React.useState<string>(()=>{
    try{ return localStorage.getItem('schedule_postureFilterId') || '' }catch{ return '' }
  })
  const [eaPerson, setEaPerson] = React.useState('')
  const [eaDay, setEaDay] = React.useState<typeof DAYS[number]>('Mon' as any)
  const [eaStart, setEaStart] = React.useState('09:00')
  const [eaEnd, setEaEnd] = React.useState('10:00')
  const [eaTaskId, setEaTaskId] = React.useState('')

  React.useEffect(()=>{
    try{ localStorage.setItem('schedule_postureFilterId', filterTaskId) }catch{}
  },[filterTaskId])

  const rows = React.useMemo(()=>{
    const dayIndex = new Map(DAYS.map((d,i)=>[d,i]))
    const filtered = calendarSegs.filter(r=> !filterTaskId || r.taskId===filterTaskId)
    return filtered.slice().sort((a,b)=>{
      const dA = dayIndex.get(a.day as any) ?? 0
      const dB = dayIndex.get(b.day as any) ?? 0
      if(dA !== dB) return dA - dB
      const tA = toMin(a.start)
      const tB = toMin(b.start)
      if(tA !== tB) return tA - tB
      return a.person.localeCompare(b.person) || a.taskId.localeCompare(b.taskId) || a.end.localeCompare(b.end)
    })
  },[calendarSegs, filterTaskId])

  function beginEdit(origIdx:number){
    const r = calendarSegs[origIdx]
    if(!r) return
    setEditingIdx(origIdx)
    setEaPerson(r.person)
    setEaDay(r.day)
    setEaStart(r.start)
    setEaEnd(r.end)
    setEaTaskId(r.taskId)
  }
  function cancelEdit(){ setEditingIdx(null) }
  function saveEdit(){
    if(editingIdx==null) return
    if(!eaPerson.trim()) return alert('Choose an agent')
    if(!eaTaskId) return alert('Choose a posture')
    const aS = toMin(eaStart), aE = toMin(eaEnd)
    if(!(aE>aS)) return alert('End must be after start')
    const dayShiftsLocal = shiftsForDayInTZ(shifts, eaDay as any, tz.offset).filter(s=>s.person===eaPerson)
    const overlaps = dayShiftsLocal.some(s=>{
      const sS = toMin(s.start)
      const sE = s.end==='24:00' ? 1440 : toMin(s.end)
      return aS < sE && aE > sS
    })
    if(!overlaps){ alert('No shift overlaps that time for this agent on that day.'); return }
    setCalendarSegs(prev=> prev.map((cs,idx)=> idx===editingIdx ? { person: eaPerson.trim(), day: eaDay, start: eaStart, end: eaEnd, taskId: eaTaskId } : cs))
    setEditingIdx(null)
  }
  function removeAt(idx:number){ setCalendarSegs(prev=> prev.filter((_,i)=> i!==idx)) }

  function taskName(id:string){ return tasks.find(t=>t.id===id)?.name || id }

  return (
    <div className={["rounded-xl p-3", dark?"bg-neutral-950":"bg-neutral-50"].join(' ')}>
      <div className="text-sm font-medium mb-2 flex items-center justify-between gap-2">
        <span>Assigned postures</span>
        <label className="text-xs inline-flex items-center gap-2">
          <span>Filter by posture</span>
          <select className={["border rounded px-2 py-1", dark&&"bg-neutral-900 border-neutral-700"].filter(Boolean).join(' ')} value={filterTaskId} onChange={e=>setFilterTaskId(e.target.value)}>
            <option value="">All</option>
            {tasks.filter(t=>!t.archived).map(t=> <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </label>
      </div>
      <div className={["border rounded-xl overflow-auto no-scrollbar", dark?"border-neutral-800":"border-neutral-300"].join(' ')}>
        <table className="min-w-full text-sm">
          <thead className={dark?"bg-neutral-900":"bg-white"}>
            <tr>
              <th className="px-3 py-2 text-left">Person</th>
              <th className="px-3 py-2 text-left">Day</th>
              <th className="px-3 py-2 text-left">Start</th>
              <th className="px-3 py-2 text-left">End</th>
              <th className="px-3 py-2 text-left">Posture</th>
              <th className="px-3 py-2 text-left w-32">Actions</th>
            </tr>
          </thead>
          <tbody className={dark?"divide-y divide-neutral-800":"divide-y divide-neutral-200"}>
            {rows.length===0 ? (
              <tr><td colSpan={6} className="px-3 py-6 text-center opacity-70">No assigned postures.</td></tr>
            ) : rows.map((r,displayIdx)=> {
              const idx = calendarSegs.findIndex(cs=> cs===r)
              const key = `${r.person}-${r.day}-${r.start}-${r.end}-${r.taskId}-${idx}`
              return (
              <tr key={`${r.person}-${r.day}-${r.start}-${r.end}-${r.taskId}-${idx}`} className={dark?"hover:bg-neutral-900":"hover:bg-neutral-50"}>
                {editingIdx===idx ? (
                  <>
                    <td className="px-3 py-1.5">
                      <select className={["w-full border rounded px-2 py-1", dark&&"bg-neutral-900 border-neutral-700"].filter(Boolean).join(' ')} value={eaPerson} onChange={e=>setEaPerson(e.target.value)}>
                        {allPeople.map(p=> <option key={p} value={p}>{p}</option>)}
                      </select>
                    </td>
                    <td className="px-3 py-1.5">
                      <select className={["w-full border rounded px-2 py-1", dark&&"bg-neutral-900 border-neutral-700"].filter(Boolean).join(' ')} value={eaDay} onChange={e=>setEaDay(e.target.value as any)}>
                        {DAYS.map(d=> <option key={d} value={d}>{d}</option>)}
                      </select>
                    </td>
                    <td className="px-3 py-1.5"><input type="time" className={["w-full border rounded px-2 py-1", dark&&"bg-neutral-900 border-neutral-700"].filter(Boolean).join(' ')} value={eaStart} onChange={e=>setEaStart(e.target.value)} /></td>
                    <td className="px-3 py-1.5"><input type="time" className={["w-full border rounded px-2 py-1", dark&&"bg-neutral-900 border-neutral-700"].filter(Boolean).join(' ')} value={eaEnd} onChange={e=>setEaEnd(e.target.value)} /></td>
                    <td className="px-3 py-1.5">
                      <select className={["w-full border rounded px-2 py-1", dark&&"bg-neutral-900 border-neutral-700"].filter(Boolean).join(' ')} value={eaTaskId} onChange={e=>setEaTaskId(e.target.value)}>
                        {tasks.filter(t=>!t.archived).map(t=> <option key={t.id} value={t.id}>{t.name}</option>)}
                      </select>
                    </td>
                    <td className="px-3 py-1.5">
                      <div className="flex gap-2">
                        <button onClick={saveEdit} className={["px-2 py-1 rounded border text-xs", dark?"bg-neutral-800 border-neutral-700":"bg-blue-600 border-blue-600 text-white"].join(' ')}>Save</button>
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
                    <td className="px-3 py-1.5">{taskName(r.taskId)}</td>
                    <td className="px-3 py-1.5">
                      <div className="flex gap-2">
                        <button onClick={()=>beginEdit(idx)} className={["px-2 py-1 rounded border text-xs", dark?"border-neutral-700":"border-neutral-300"].join(' ')}>Edit</button>
                        <button onClick={()=>{ if(confirm('Remove this assignment?')) removeAt(idx) }} className={["px-2 py-1 rounded border text-xs", "bg-red-600 border-red-600 text-white"].join(' ')}>Delete</button>
                      </div>
                    </td>
                  </>
                )}
              </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
