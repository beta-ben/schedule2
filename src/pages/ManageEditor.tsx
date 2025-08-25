import React from 'react'
import { DAYS } from '../constants'
import DayGrid from '../components/DayGrid'
import ShiftManagerPanel from '../components/ShiftManagerPanel'
import { addDays, fmtNice, fmtYMD, parseYMD, toMin, uid, shiftsForDayInTZ } from '../lib/utils'
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
  const [tab, setTab] = React.useState<'shifts'|'pto'>('shifts')

  const [ptoPerson, setPtoPerson] = React.useState('')
  const [ptoStart, setPtoStart]   = React.useState(fmtYMD(weekStartDate))
  const [ptoEnd, setPtoEnd]       = React.useState(fmtYMD(addDays(weekStartDate, 1)))
  const [ptoNotes, setPtoNotes]   = React.useState('')
  const [ptoFilter, setPtoFilter] = React.useState('')
  const [ptoSelected, setPtoSelected] = React.useState(()=> new Set<string>())

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
        </div>
        <div className="flex gap-2">
          <button onClick={exportData} className={["px-3 py-1.5 rounded-lg border text-sm", dark?"border-neutral-600":"border-neutral-300"].join(' ')}>Export JSON</button>
          <button onClick={async()=>{ const data=await cloudGet(); if(data){ setShifts(()=>data.shifts); setPto(()=>data.pto) } }} className={["px-3 py-1.5 rounded-lg border text-sm", dark?"border-neutral-600":"border-neutral-300"].join(' ')}>Load Cloud</button>
          <button onClick={async()=>{ await cloudPost({shifts, pto, updatedAt:new Date().toISOString()}); }} className={["px-3 py-1.5 rounded-lg border text-sm", dark?"border-neutral-600":"border-neutral-300"].join(' ')}>Save Cloud</button>
        </div>
      </div>

      {tab==='shifts' ? (
        <ShiftManagerPanel shifts={shifts} setShifts={setShifts} dark={dark} />
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
          {/* PTO list with removal */}
          <div className="mt-4">
            <div className="flex items-end gap-3">
              <label className="text-sm flex flex-col">
                <span className="mb-1">Filter by person</span>
                <input className={["w-64 border rounded-xl px-3 py-2", dark&&"bg-neutral-900 border-neutral-700"].filter(Boolean).join(' ')} value={ptoFilter} onChange={e=>setPtoFilter(e.target.value)} placeholder="Name contains…" />
              </label>
            </div>
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
      )}

      {/* Week preview */}
      <div className="text-sm opacity-70">Preview</div>
      {DAYS.map((d,i)=>{
        const dayKey=d; const date=addDays(weekStartDate,i)
        const dayShifts=shiftsForDayInTZ(shifts, dayKey as any, tz.offset).sort((a,b)=>toMin(a.start)-toMin(b.start))
        const people=Array.from(new Set(dayShifts.map(s=>s.person)))
        return (
          <div key={d} className={["rounded-xl p-2", dark?"bg-neutral-950":"bg-neutral-50"].join(' ')}>
            <div className="text-sm font-semibold mb-1">{d} <span className="opacity-60">{fmtNice(date)}</span></div>
            <DayGrid date={date} dayKey={dayKey} people={people} shifts={dayShifts} pto={pto} dark={dark} tz={tz} />
          </div>
        )
      })}
      <datalist id="people">
        {allPeople.map(p=> <option key={p} value={p} />)}
      </datalist>
    </section>
  )
}
