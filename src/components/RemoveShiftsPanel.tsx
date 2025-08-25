import React, { useMemo, useState } from 'react'
import type { Shift } from '../types'
import { DAYS } from '../constants'
import { isValidHHMM, toMin, shiftKey } from '../lib/utils'

export default function RemoveShiftsPanel({ shifts, setShifts, dark }:{ 
  shifts: Shift[]
  setShifts: (f:(prev:Shift[])=>Shift[])=>void
  dark: boolean
}){
  const [filterPerson, setFilterPerson] = useState('')
  const [filterDays, setFilterDays] = useState(()=> new Set<string>(DAYS))
  const [filterStart, setFilterStart] = useState('')
  const [filterEnd, setFilterEnd] = useState('')
  const [selected, setSelected] = useState(()=> new Set<string>())

  const toggleDay = (d:string)=>{ const n=new Set(filterDays); if(n.has(d)) n.delete(d); else n.add(d); setFilterDays(n) }
  const selectAllDays = ()=> setFilterDays(new Set(DAYS))
  const clearAllDays = ()=> setFilterDays(new Set())

  const rows = useMemo(()=>{
    const startOK = isValidHHMM(filterStart); const endOK = isValidHHMM(filterEnd)
    const sMin = startOK ? toMin(filterStart) : null
    const eMin = endOK ? toMin(filterEnd) : null
    const lc = (filterPerson||'').toLowerCase()
    return shifts
      .filter(s=> (!lc || s.person.toLowerCase().includes(lc))
                  && (filterDays.size===0 || filterDays.has(s.day))
                  && (sMin===null || toMin(s.start) >= sMin)
                  && (eMin===null || toMin(s.end) <= eMin))
      .slice()
      .sort((a,b)=> a.day.localeCompare(b.day) || toMin(a.start)-toMin(b.start) || a.person.localeCompare(b.person))
  }, [shifts, filterPerson, filterDays, filterStart, filterEnd])

  function toggle(id:string){ const n=new Set(selected); if(n.has(id)) n.delete(id); else n.add(id); setSelected(n) }
  function selectAllFiltered(){ setSelected(new Set(rows.map(r=>r.id))) }
  function clearSelection(){ setSelected(new Set()) }

  function deleteSelected(){
    if(selected.size===0) return alert('Select at least one row.')
    if(!confirm(`Permanently delete ${selected.size} shift(s)?`)) return
    setShifts(prev=> prev.filter(s=> !selected.has(s.id)))
    setSelected(new Set())
  }

  function deleteAllFiltered(){
    if(rows.length===0) return alert('No rows match the current filters.')
    if(!confirm(`Delete ALL ${rows.length} filtered shift(s)? This cannot be undone.`)) return
    const ids = new Set(rows.map(r=>r.id))
    setShifts(prev=> prev.filter(s=> !ids.has(s.id)))
    setSelected(new Set())
  }

  function dedupeExact(){
    const seen = new Set<string>()
    const dupIds: string[] = []
    for(const s of shifts){ const k = shiftKey(s as any); if(seen.has(k)) dupIds.push(s.id); else seen.add(k) }
    if(dupIds.length===0) { alert('No exact duplicates found.'); return }
    if(!confirm(`Found ${dupIds.length} exact duplicate shift(s). Remove them?`)) return
    const rm = new Set(dupIds)
    setShifts(prev=> prev.filter(s=> !rm.has(s.id)))
  }

  return (
    <div className={["rounded-xl p-3", dark?"bg-neutral-950":"bg-neutral-50"].join(' ')}>
      {/* Filters */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
        <div className="md:col-span-3">
          <label className="text-sm flex flex-col">
            <span className="mb-1">Filter by person</span>
            <input className={["w-full border rounded-xl px-3 py-2", dark&&"bg-neutral-900 border-neutral-700"].filter(Boolean).join(' ')} value={filterPerson} onChange={e=>setFilterPerson(e.target.value)} placeholder="Name contains…" />
          </label>
        </div>
        <div className="md:col-span-4">
          <fieldset className="text-sm">
            <legend className="mb-1">Days</legend>
            <div className="flex flex-wrap gap-2">
              {DAYS.map(d=>{
                const active = filterDays.has(d)
                const base = 'px-3 py-1.5 rounded-full border text-sm leading-none'
                const activeCls = dark?'bg-neutral-800 border-neutral-600 text-white':'bg-blue-600 border-blue-600 text-white'
                const idleCls = dark?'border-neutral-700 text-neutral-200 hover:bg-neutral-900':'border-neutral-300 text-neutral-700 hover:bg-neutral-100'
                return (
                  <button key={d} type="button" onClick={()=>toggleDay(d)} className={[base, active?activeCls:idleCls].join(' ')}>{d}</button>
                )
              })}
              <button onClick={selectAllDays} className={["px-2 py-1 rounded-lg border text-xs", dark?"border-neutral-700":"border-neutral-300"].join(' ')}>All</button>
              <button onClick={clearAllDays} className={["px-2 py-1 rounded-lg border text-xs", dark?"border-neutral-700":"border-neutral-300"].join(' ')}>None</button>
            </div>
          </fieldset>
        </div>
        <div className="md:col-span-4">
          <div className="grid grid-cols-2 gap-3">
            <label className="text-sm flex flex-col">
              <span className="mb-1">Start ≥</span>
              <input type="time" className={["w-full border rounded-xl px-3 py-2", dark&&"bg-neutral-900 border-neutral-700"].filter(Boolean).join(' ')} value={filterStart} onChange={e=>setFilterStart(e.target.value)} />
            </label>
            <label className="text-sm flex flex-col">
              <span className="mb-1">End ≤</span>
              <input type="time" className={["w-full border rounded-xl px-3 py-2", dark&&"bg-neutral-900 border-neutral-700"].filter(Boolean).join(' ')} value={filterEnd} onChange={e=>setFilterEnd(e.target.value)} />
            </label>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="mt-3 flex flex-wrap gap-2">
        <button onClick={selectAllFiltered} className={["px-3 py-1.5 rounded-lg border text-sm", dark?"border-neutral-700":"border-neutral-300"].join(' ')}>Select all filtered</button>
        <button onClick={clearSelection} className={["px-3 py-1.5 rounded-lg border text-sm", dark?"border-neutral-700":"border-neutral-300"].join(' ')}>Clear selection</button>
        <button onClick={deleteSelected} className={["px-3 py-1.5 rounded-lg border text-sm", "bg-red-600 border-red-600 text-white"].join(' ')}>Delete selected ({selected.size})</button>
        <button onClick={deleteAllFiltered} className={["px-3 py-1.5 rounded-lg border text-sm", "bg-red-700 border-red-700 text-white"].join(' ')}>Delete ALL filtered ({rows.length})</button>
        <button onClick={dedupeExact} className={["px-3 py-1.5 rounded-lg border text-sm", dark?"bg-neutral-800 border-neutral-700":"bg-neutral-200 border-neutral-300"].join(' ')}>Remove exact duplicates</button>
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
              <th className="px-3 py-2 text-left w-20">Actions</th>
            </tr>
          </thead>
          <tbody className={dark?"divide-y divide-neutral-800":"divide-y divide-neutral-200"}>
            {rows.length===0 ? (
              <tr><td colSpan={6} className="px-3 py-6 text-center opacity-70">No shifts match the current filters.</td></tr>
            ) : rows.map(r=> (
              <tr key={r.id} className={dark?"hover:bg-neutral-900":"hover:bg-neutral-50"}>
                <td className="px-3 py-1.5"><input type="checkbox" checked={selected.has(r.id)} onChange={()=>toggle(r.id)} /></td>
                <td className="px-3 py-1.5 font-medium">{r.person}</td>
                <td className="px-3 py-1.5">{r.day}</td>
                <td className="px-3 py-1.5">{r.start}</td>
                <td className="px-3 py-1.5">{r.end}</td>
                <td className="px-3 py-1.5">
                  <button onClick={()=>{ if(confirm('Delete this shift?')) setShifts(prev=>prev.filter(s=>s.id!==r.id)) }} className={["px-2 py-1 rounded border text-xs", "bg-red-600 border-red-600 text-white"].join(' ')}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
