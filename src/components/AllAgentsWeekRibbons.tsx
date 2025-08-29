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
  sortMode?: 'start'|'end'|'name'|'count'|'total'|'tz'|'firstDay'
  highlightIds?: Set<string> | string[]
  selectedIds?: Set<string> | string[]
  onToggleSelect?: (id:string)=>void
}){
  const nameColClass = "w-24 shrink-0 text-left pl-1 text-sm truncate"
  const agentNamesSorted = useMemo(()=>{
    const names = agents.map(a=> [a.firstName, a.lastName].filter(Boolean).join(' '))
    const tzShifts = convertShiftsToTZ(shifts, tz.offset)
    const dayIndex = new Map(DAYS.map((d,i)=>[d,i]))
    const earliestStartAbs = (name: string)=>{
      let minAbs = Infinity
      for(const s of tzShifts){
        if(s.person !== name) continue
        const di = dayIndex.get(s.day as any) ?? -1
        if(di < 0) continue
        const abs = di*1440 + toMin(s.start)
        if(abs < minAbs) minAbs = abs
      }
      return minAbs
    }
    const latestEndAbs = (name: string)=>{
      let maxAbs = -Infinity
      for(const s of tzShifts){
        if(s.person !== name) continue
        const sd = dayIndex.get(s.day as any) ?? 0
        const ed = dayIndex.get(((s as any).endDay || s.day) as any) ?? sd
        const sAbs = sd*1440 + toMin(s.start)
        let eAbs = ed*1440 + toMin(s.end)
        if(eAbs <= sAbs) eAbs += 1440
        if(eAbs > maxAbs) maxAbs = eAbs
      }
      return maxAbs
    }
    const totalMinutes = (name: string)=>{
      let total = 0
      for(const s of tzShifts){
        if(s.person !== name) continue
        const sd = dayIndex.get(s.day as any) ?? 0
        const ed = dayIndex.get(((s as any).endDay || s.day) as any) ?? sd
        const sAbs = sd*1440 + toMin(s.start)
        let eAbs = ed*1440 + toMin(s.end)
        if(eAbs <= sAbs) eAbs += 1440
        total += Math.max(0, eAbs - sAbs)
      }
      return total
    }
    const shiftCount = (name: string)=> tzShifts.filter(s=> s.person===name).length
    const tzOf = (name: string)=> (agents.find(a=> [a.firstName,a.lastName].filter(Boolean).join(' ')===name)?.tzId) || ''
    const firstDayIdx = (name: string)=>{
      let min = Infinity
      for(const s of tzShifts){ if(s.person===name){ const di = dayIndex.get(s.day as any) ?? Infinity; if(di < min) min = di } }
      return min
    }
    const rows = names.map(n=>({
      name: n,
      startKey: earliestStartAbs(n),
      endKey: latestEndAbs(n),
      totalKey: totalMinutes(n),
      countKey: shiftCount(n),
      tzKey: tzOf(n),
      dayKey: firstDayIdx(n),
    }))
    const byName = (a:any,b:any)=> a.name.localeCompare(b.name)
    if(sortMode==='name') return rows.sort(byName).map(x=> x.name)
    if(sortMode==='end') return rows.sort((a,b)=> (a.endKey - b.endKey) || byName(a,b)).map(x=> x.name)
    if(sortMode==='count') return rows.sort((a,b)=> (b.countKey - a.countKey) || byName(a,b)).map(x=> x.name)
    if(sortMode==='total') return rows.sort((a,b)=> (b.totalKey - a.totalKey) || byName(a,b)).map(x=> x.name)
    if(sortMode==='tz') return rows.sort((a,b)=> (a.tzKey.localeCompare(b.tzKey)) || byName(a,b)).map(x=> x.name)
    if(sortMode==='firstDay') return rows.sort((a,b)=> (a.dayKey - b.dayKey) || byName(a,b)).map(x=> x.name)
    // default: earliest start
    return rows.sort((a,b)=> (a.startKey - b.startKey) || byName(a,b)).map(x=> x.name)
  }, [agents, shifts, tz.offset, sortMode])
  const nameToShort = useMemo(()=>{
    // Count first name occurrences (case-insensitive)
    const firstCounts = new Map<string, number>()
    for(const a of agents){
      const f = (a.firstName || '').trim().toLowerCase()
      if(!f) continue
      firstCounts.set(f, (firstCounts.get(f)||0) + 1)
    }
    const m = new Map<string,string>()
    for(const a of agents){
      const first = (a.firstName || '').trim()
      const last = (a.lastName || '').trim()
      const full = [first, last].filter(Boolean).join(' ')
      const cnt = first ? (firstCounts.get(first.toLowerCase()) || 0) : 0
      const lastInitial = last ? `${last[0].toUpperCase()}.` : ''
      const short = cnt > 1 ? `${first}${lastInitial?` ${lastInitial}`:''}` : first
      m.set(full, short || full)
    }
    return m
  }, [agents])

  return (
  <div className="space-y-0">
      {/* Top day labels aligned to ribbons */}
      <div className="flex items-center gap-1">
        <div className={nameColClass + ' opacity-0 select-none'}>label</div>
    <div className="flex-1 relative h-7">
          {DAYS.map((d,i)=>{
            const left = (i/7)*100
            const width = (1/7)*100
            return (
      <div key={d} className={["absolute text-center", dark?"text-neutral-300":"text-neutral-600"].join(' ')} style={{ left: `${left}%`, width: `${width}%`, fontSize: 13, lineHeight: 1.5 }}>
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
            <div className={[nameColClass, dark?"text-neutral-300":"text-neutral-700"].join(' ')} title={name}>
              {nameToShort.get(name) || (name.split(' ')[0] || name)}
            </div>
            <div className="flex-1" title={name}>
              <AgentWeekLinear
                dark={dark}
                tz={tz}
                weekStart={weekStart}
                agent={name}
                shifts={shifts}
                pto={pto}
                tasks={tasks}
                calendarSegs={calendarSegs}
                titlePrefix={name}
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
