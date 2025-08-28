import React, { useMemo } from 'react'
import AgentWeekLinear from './AgentWeekLinear'
import type { PTO, Shift, Task } from '../types'
import type { CalendarSegment } from '../lib/utils'
import { DAYS } from '../constants'
import { convertShiftsToTZ, toMin } from '../lib/utils'

type AgentRow = { firstName: string; lastName: string; tzId?: string }

export default function AllAgentsWeekRibbons({
  dark,
  tz,
  weekStart,
  agents,
  shifts,
  pto,
  tasks,
  calendarSegs,
  showAllTimeLabels = false,
  onDragAll,
  onDragShift,
  sortMode = 'start',
  highlightIds,
  selectedIds,
  onToggleSelect,
}:{
  dark: boolean
  tz: { id:string; label:string; offset:number }
  weekStart: string
  agents: AgentRow[]
  shifts: Shift[]
  pto: PTO[]
  tasks?: Task[]
  calendarSegs?: CalendarSegment[]
  showAllTimeLabels?: boolean
  onDragAll?: (name:string, deltaMinutes:number)=>void
  onDragShift?: (name:string, id:string, deltaMinutes:number)=>void
  sortMode?: 'start'|'name'
  highlightIds?: Set<string> | string[]
  selectedIds?: Set<string> | string[]
  onToggleSelect?: (id:string)=>void
}){
  const nameColClass = "w-24 shrink-0 text-left pl-1 text-sm truncate"
  const agentNamesSorted = useMemo(()=>{
    const names = agents.map(a=> [a.firstName, a.lastName].filter(Boolean).join(' '))
    const tzShifts = convertShiftsToTZ(shifts, tz.offset)
    function earliestStartAbs(name: string){
      let minAbs = Infinity
      for(const s of tzShifts){
        if(s.person !== name) continue
        const di = DAYS.indexOf(s.day as any)
        if(di < 0) continue
        const abs = di*1440 + toMin(s.start)
        if(abs < minAbs) minAbs = abs
      }
      return minAbs
    }
    const list = names.map(n=>({ name: n, key: earliestStartAbs(n) }))
    if(sortMode==='name'){
      return list.sort((a,b)=> a.name.localeCompare(b.name)).map(x=>x.name)
    }
    return list.sort((a,b)=> (a.key - b.key) || a.name.localeCompare(b.name)).map(x=> x.name)
  }, [agents, shifts, tz.offset, sortMode])

  return (
  <div className="space-y-0">
      {/* Top day labels aligned to ribbons */}
      <div className="flex items-center gap-1">
        <div className={nameColClass + ' opacity-0 select-none'}>label</div>
        <div className="flex-1 relative h-6">
          {DAYS.map((d,i)=>{
            const left = (i/7)*100
            const width = (1/7)*100
            return (
              <div key={d} className={["absolute text-center", dark?"text-neutral-400":"text-neutral-500"].join(' ')} style={{ left: `${left}%`, width: `${width}%`, fontSize: 11 }}>
                {d}
              </div>
            )
          })}
        </div>
      </div>

      {agentNamesSorted.length===0 ? (
        <div className="text-sm opacity-70 px-2">No agents.</div>
      ) : agentNamesSorted.map(name=> (
        <div key={name} className="py-0">
          <div className="flex items-center gap-1">
            <div className={[nameColClass, dark?"text-neutral-300":"text-neutral-700"].join(' ')}>{name}</div>
            <div className="flex-1">
              <AgentWeekLinear
                dark={dark}
                tz={tz}
                weekStart={weekStart}
                agent={name}
                shifts={shifts}
                pto={pto}
                tasks={tasks}
                calendarSegs={calendarSegs}
                draggable={Boolean(onDragAll || onDragShift)}
                onDragAll={(d)=> onDragAll?.(name, d)}
                onDragShift={(id,d)=> onDragShift?.(name, id, d)}
                showDayLabels={false}
                showWeekLabel={false}
                framed={false}
                showNowLabel={false}
                showShiftLabels={true}
                alwaysShowTimeTags={showAllTimeLabels}
                forceOuterTimeTags={showAllTimeLabels}
                avoidLabelOverlap={showAllTimeLabels}
                highlightIds={highlightIds}
                showEdgeTimeTagsForHighlights={true}
                selectedIds={selectedIds}
                onToggleSelect={onToggleSelect}
              />
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
