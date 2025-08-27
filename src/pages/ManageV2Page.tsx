import React from 'react'
import WeekEditor from '../components/v2/WeekEditor'
import AllAgentsWeekRibbons from '../components/AllAgentsWeekRibbons'
import type { PTO, Shift, Task } from '../types'
import type { CalendarSegment } from '../lib/utils'

type AgentRow = { firstName: string; lastName: string; tzId?: string }

export default function ManageV2Page({ dark, agents, onAddAgent, onUpdateAgent, onDeleteAgent, weekStart, tz, shifts, pto, tasks, calendarSegs, onUpdateShift, onDeleteShift, onAddShift }:{ dark:boolean; agents: AgentRow[]; onAddAgent?: (a:{ firstName:string; lastName:string; tzId:string })=>void; onUpdateAgent?: (index:number, a:AgentRow)=>void; onDeleteAgent?: (index:number)=>void; weekStart: string; tz:{ id:string; label:string; offset:number }; shifts: Shift[]; pto: PTO[]; tasks: Task[]; calendarSegs: CalendarSegment[]; onUpdateShift?: (id:string, patch: Partial<Shift>)=>void; onDeleteShift?: (id:string)=>void; onAddShift?: (s: Shift)=>void }){
  const [localAgents, setLocalAgents] = React.useState<AgentRow[]>(agents)
  React.useEffect(()=>{ setLocalAgents(agents) }, [agents])
  const tabs = ['Agents','Shifts','PTO','Postures'] as const
  type Subtab = typeof tabs[number]
  const [subtab, setSubtab] = React.useState<Subtab>('Agents')
  // Filters
  const [hideShiftLabels, setHideShiftLabels] = React.useState(false)
  const [sortMode, setSortMode] = React.useState<'start'|'name'>('start')
  // Track modified shifts to show edge time labels next render
  const [modifiedIds, setModifiedIds] = React.useState<Set<string>>(new Set())
  // Shifts tab: multi-select of shifts by id
  const [selectedShiftIds, setSelectedShiftIds] = React.useState<Set<string>>(new Set())
  // Shifts tab: multi-level undo stack (keep last 10 actions)
  const [shiftUndoStack, setShiftUndoStack] = React.useState<Array<Array<{ id:string; patch: Partial<Shift> }>>>([])
  const canUndoShifts = shiftUndoStack.length > 0
  const pushShiftsUndo = React.useCallback((changes: Array<{ id:string; patch: Partial<Shift> }>)=>{
    if(changes.length===0) return
    setShiftUndoStack(prev=>{
      const next = prev.concat([changes])
      if(next.length>10) next.shift()
      return next
    })
  }, [])
  const undoShifts = React.useCallback(()=>{
    if(shiftUndoStack.length===0) return
    const last = shiftUndoStack[shiftUndoStack.length-1]
    // Apply previous patches
    last.forEach(({id, patch})=> onUpdateShift?.(id, patch))
    // Remove reverted ids from modified set if they match the reverted state next render
    setModifiedIds(prev=>{
      const next = new Set(prev)
      last.forEach(({id})=> next.delete(id))
      return next
    })
    setShiftUndoStack(prev=> prev.slice(0, -1))
  }, [shiftUndoStack, onUpdateShift])
  // Ctrl/Cmd+Z for Shifts tab
  React.useEffect(()=>{
    const onKey = (e: KeyboardEvent)=>{
      if(subtab!=='Shifts') return
      const isUndo = (e.ctrlKey || e.metaKey) && !e.shiftKey && (e.key==='z' || e.key==='Z')
      if(isUndo){ e.preventDefault(); undoShifts() }
      if(e.key === 'Escape'){
        // Clear selection to allow single-shift moves without grouping
        setSelectedShiftIds(new Set())
      }
    }
    window.addEventListener('keydown', onKey)
    return ()=> window.removeEventListener('keydown', onKey)
  }, [subtab, undoShifts])
  const handleAdd = React.useCallback((a:{ firstName:string; lastName:string; tzId:string })=>{
    onAddAgent?.(a); setLocalAgents(prev=> prev.concat([{ firstName: a.firstName, lastName: a.lastName, tzId: a.tzId }]))
  },[onAddAgent])
  const handleUpdate = React.useCallback((index:number, a:AgentRow)=>{
    onUpdateAgent?.(index, a); setLocalAgents(prev=> prev.map((row,i)=> i===index ? a : row))
  },[onUpdateAgent])
  const handleDelete = React.useCallback((index:number)=>{
    onDeleteAgent?.(index); setLocalAgents(prev=> prev.filter((_,i)=> i!==index))
  },[onDeleteAgent])
  return (
    <section className={["rounded-2xl p-3 space-y-3", dark?"bg-neutral-900":"bg-white shadow-sm"].join(' ')}>
  <div className="flex items-center gap-2">
        {tabs.map(t=>{
          const active = subtab===t
          return (
            <button
              key={t}
              onClick={()=>setSubtab(t)}
              className={[
                "px-3 py-1.5 rounded-lg text-sm border",
                active
                  ? (dark
                      ? "bg-neutral-900 border-neutral-600 text-neutral-200"
                      : "bg-white border-blue-600 text-blue-600")
                  : (dark
                      ? "bg-neutral-900 border-neutral-800 text-neutral-200 hover:bg-neutral-800"
                      : "bg-white border-neutral-200 text-neutral-700 hover:bg-neutral-100")
              ].join(' ')}
            >{t}</button>
          )
        })}
        {subtab==='Shifts' && (
          <div className="ml-auto flex items-center gap-3 text-xs">
            <button
              type="button"
              disabled={!canUndoShifts}
              onClick={undoShifts}
              className={["px-2 py-1 rounded border", canUndoShifts ? (dark?"border-neutral-700 hover:bg-neutral-800":"border-neutral-300 hover:bg-neutral-100") : (dark?"border-neutral-800 opacity-50":"border-neutral-200 opacity-50")].join(' ')}
              title="Undo (Ctrl/Cmd+Z)"
            >Undo</button>
            <label className="inline-flex items-center gap-1 select-none">
              <span className={dark?"text-neutral-300":"text-neutral-700"}>Sort</span>
              <select
                className={["border rounded px-1.5 py-0.5", dark?"bg-neutral-900 border-neutral-700 text-neutral-100":"bg-white border-neutral-300 text-neutral-800"].join(' ')}
                value={sortMode}
                onChange={(e)=> setSortMode((e.target.value as 'start'|'name'))}
                title="Sort ribbons by earliest shift start or by name"
              >
                <option value="start">Start time</option>
                <option value="name">Name</option>
              </select>
            </label>
            <label className="inline-flex items-center gap-1 cursor-pointer select-none">
              <input
                type="checkbox"
                className="accent-blue-600"
                checked={hideShiftLabels}
                onChange={(e)=> setHideShiftLabels(e.target.checked)}
              />
              <span className={dark?"text-neutral-300":"text-neutral-700"}>Hide shift time labels</span>
            </label>
          </div>
        )}
      </div>

  {subtab==='Agents' ? (
        <WeekEditor
          dark={dark}
          agents={localAgents}
          onAddAgent={handleAdd}
          onUpdateAgent={handleUpdate}
          onDeleteAgent={handleDelete}
          weekStart={weekStart}
          tz={tz}
          shifts={shifts}
          pto={pto}
          tasks={tasks}
          calendarSegs={calendarSegs}
          onUpdateShift={onUpdateShift}
          onDeleteShift={onDeleteShift}
          onAddShift={onAddShift}
        />
      ) : subtab==='Shifts' ? (
        <div className={["rounded-xl p-2 border", dark?"bg-neutral-950 border-neutral-800 text-neutral-200":"bg-neutral-50 border-neutral-200 text-neutral-800"].join(' ')}>
          <AllAgentsWeekRibbons
            dark={dark}
            tz={tz}
            weekStart={weekStart}
            agents={localAgents}
            shifts={shifts}
            pto={pto}
            tasks={tasks}
            calendarSegs={calendarSegs}
            hideShiftLabels={hideShiftLabels}
            sortMode={sortMode}
            highlightIds={modifiedIds}
            selectedIds={selectedShiftIds}
            onToggleSelect={(id)=>{
              setSelectedShiftIds(prev=>{
                const next = new Set(prev)
                if(next.has(id)) next.delete(id); else next.add(id)
                return next
              })
            }}
            onDragAll={(name, delta)=>{
              const personsShifts = shifts.filter(s=> s.person===name)
              // Capture pre-change snapshot for undo (all shifts for this person)
              const prevPatches = personsShifts.map(s=> ({ id: s.id, patch: { day: s.day, start: s.start, end: s.end, endDay: (s as any).endDay } }))
              pushShiftsUndo(prevPatches)
              // Apply same delta to all their shifts, respecting wrap and endDay
              const DAYS_ = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'] as const
              const idxOf = (d:string)=> DAYS_.indexOf(d as any)
              const byIndex = (i:number)=> DAYS_[((i%7)+7)%7] as any
              const toMin = (t:string)=>{ const [h,m]=t.split(':').map(Number); return (h||0)*60+(m||0) }
              const addMin = (t:string, dm:number)=>{
                const [h,m]=t.split(':').map(Number); const tot=((h||0)*60+(m||0)+dm+10080)%1440; const hh=Math.floor(tot/60).toString().padStart(2,'0'); const mm=(tot%60).toString().padStart(2,'0'); return `${hh}:${mm}`
              }
              const next = personsShifts.map(s=>{
                const sd = idxOf(s.day); const ed = idxOf((s as any).endDay || s.day)
                const sAbs = sd*1440 + toMin(s.start)
                let eAbs = ed*1440 + toMin(s.end); if(eAbs<=sAbs) eAbs+=1440
                let ns = sAbs+delta; let ne = eAbs+delta
                const nsDay = Math.floor(((ns/1440)%7+7)%7)
                const neDay = Math.floor(((ne/1440)%7+7)%7)
                const nsMin = ((ns%1440)+1440)%1440
                const neMin = ((ne%1440)+1440)%1440
                return { ...s, day: byIndex(nsDay), start: addMin('00:00', nsMin), end: addMin('00:00', neMin), endDay: byIndex(neDay) }
              })
              // Apply updates and mark modified ids so tags show
              const ids = new Set<string>(modifiedIds)
              next.forEach(s=> { onUpdateShift?.(s.id, { day: s.day, start: s.start, end: s.end, endDay: (s as any).endDay }); ids.add(s.id) })
              setModifiedIds(ids)
            }}
            onDragShift={(name, id, delta)=>{
              const DAYS_ = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'] as const
              const idxOf = (d:string)=> DAYS_.indexOf(d as any)
              const byIndex = (i:number)=> DAYS_[((i%7)+7)%7] as any
              const toMin = (t:string)=>{ const [h,m]=t.split(':').map(Number); return (h||0)*60+(m||0) }
              const addMin = (t:string, dm:number)=>{
                const [h,m]=t.split(':').map(Number); const tot=((h||0)*60+(m||0)+dm+10080)%1440; const hh=Math.floor(tot/60).toString().padStart(2,'0'); const mm=(tot%60).toString().padStart(2,'0'); return `${hh}:${mm}`
              }
              // Move the union of selected shifts and the dragged shift
              const moveIds = new Set<string>(selectedShiftIds)
              moveIds.add(id)
              const moveShifts = shifts.filter(s=> moveIds.has(s.id))
              if(moveShifts.length === 0) return
              if(moveShifts.length === 1){
                // Default single-shift move
                const s = moveShifts[0]
                pushShiftsUndo([{ id: s.id, patch: { day: s.day, start: s.start, end: s.end, endDay: (s as any).endDay } }])
                const sd = idxOf(s.day); const ed = idxOf((s as any).endDay || s.day)
                const sAbs = sd*1440 + toMin(s.start)
                let eAbs = ed*1440 + toMin(s.end); if(eAbs<=sAbs) eAbs+=1440
                const ns = sAbs+delta; const ne = eAbs+delta
                const nsDay = Math.floor(((ns/1440)%7+7)%7)
                const neDay = Math.floor(((ne/1440)%7+7)%7)
                const nsMin = ((ns%1440)+1440)%1440
                const neMin = ((ne%1440)+1440)%1440
                const next = { ...s, day: byIndex(nsDay), start: addMin('00:00', nsMin), end: addMin('00:00', neMin), endDay: byIndex(neDay) }
                onUpdateShift?.(next.id, { day: next.day, start: next.start, end: next.end, endDay: (next as any).endDay })
                setModifiedIds(prev=>{ const n=new Set(prev); n.add(next.id); return n })
                return
              }
              // Multi-shift move for union
              const prevPatches = moveShifts.map(s=> ({ id: s.id, patch: { day: s.day, start: s.start, end: s.end, endDay: (s as any).endDay } }))
              pushShiftsUndo(prevPatches)
              const nextModified = new Set<string>(modifiedIds)
              for(const s of moveShifts){
                const sd = idxOf(s.day); const ed = idxOf((s as any).endDay || s.day)
                const sAbs = sd*1440 + toMin(s.start)
                let eAbs = ed*1440 + toMin(s.end); if(eAbs<=sAbs) eAbs+=1440
                const ns = sAbs+delta; const ne = eAbs+delta
                const nsDay = Math.floor(((ns/1440)%7+7)%7)
                const neDay = Math.floor(((ne/1440)%7+7)%7)
                const nsMin = ((ns%1440)+1440)%1440
                const neMin = ((ne%1440)+1440)%1440
                const next = { ...s, day: byIndex(nsDay), start: addMin('00:00', nsMin), end: addMin('00:00', neMin), endDay: byIndex(neDay) }
                onUpdateShift?.(next.id, { day: next.day, start: next.start, end: next.end, endDay: (next as any).endDay })
                nextModified.add(next.id)
              }
              setModifiedIds(nextModified)
            }}
          />
        </div>
      ) : (
        <div className={["rounded-xl p-4 border", dark?"bg-neutral-950 border-neutral-800 text-neutral-200":"bg-neutral-50 border-neutral-200 text-neutral-800"].join(' ')}>
          <div className="text-sm font-semibold mb-1">{subtab}</div>
          <div className="text-sm opacity-80">Coming soon.</div>
        </div>
      )}
    </section>
  )
}
