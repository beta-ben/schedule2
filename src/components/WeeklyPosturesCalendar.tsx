import React from 'react'
import { DAYS } from '../constants'
import { agentDisplayName, toMin, addDays, fmtYMD, parseYMD } from '../lib/utils'
import type { Task } from '../types'
import type { CalendarSegment } from '../lib/utils'

type AgentRow = { id?: string; firstName?: string; lastName?: string }

export default function WeeklyPosturesCalendar({
  dark,
  calendarSegs,
  tasks,
  agents = [],
  weekStart,
  packed = false,
  filterTaskId,
  title = 'Weekly posture calendar',
  subtitle,
}:{
  dark: boolean
  calendarSegs: CalendarSegment[]
  tasks: Task[]
  agents?: AgentRow[]
  weekStart: string
  packed?: boolean
  filterTaskId?: string
  title?: string
  subtitle?: string
}){
  const week0 = React.useMemo(()=> parseYMD(weekStart), [weekStart])
  const ymds = React.useMemo(()=> DAYS.map((_,i)=> fmtYMD(addDays(week0, i))), [week0])
  const H_PX = 420 // column height (time-scaled mode)
  const hrColor = dark? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'
  const hourMarks = React.useMemo(()=> Array.from({length:25},(_,i)=>i), [])
  const taskMap = React.useMemo(()=> new Map(tasks.map(t=>[t.id,t])), [tasks])

  return (
    <div className={["mt-3 rounded-xl p-3", dark?"bg-neutral-900":"bg-white"].join(' ')}>
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-medium">{title}</div>
        {subtitle && (<div className="text-xs opacity-70">{subtitle}</div>)}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-7 gap-3 text-sm">
        {DAYS.map((day, di)=>{
          const ymd = ymds[di]
          // Build lanes so overlapping items render side-by-side
          const dayItems = (calendarSegs||[])
            .map((cs, _idx)=> ({...cs, _idx}))
            // Expand any cross-day segments into per-day pieces so they render on both days
            .flatMap(cs=>{
              const sameDay = !(cs as any).endDay || (cs as any).endDay === cs.day
              if(sameDay){ return [cs] }
              return [
                { ...cs, day: cs.day, start: cs.start, end: '24:00' },
                { ...cs, day: (cs as any).endDay, start: '00:00', end: cs.end },
              ]
            })
            .filter(cs=> cs.day===day && (!filterTaskId || cs.taskId===filterTaskId))
            .sort((a,b)=> toMin(a.start) - toMin(b.start))
          const lanes: number[] = [] // end minute per lane
          const placed = dayItems.map((it)=>{
            const s = toMin(it.start)
            const e = it.end==='24:00' ? 1440 : toMin(it.end)
            let lane = 0
            for(lane=0; lane<lanes.length; lane++){
              if(s >= lanes[lane]){ lanes[lane] = e; break }
            }
            if(lane===lanes.length){ lanes.push(e) }
            return { it, lane, s, e }
          })
          if(packed){
            // Stacked list layout (no time grid, no gaps)
            return (
              <div key={day} className={["rounded-lg p-2", dark?"bg-neutral-950":"bg-neutral-50"].join(' ')}>
                <div className="font-medium mb-2 flex items-baseline justify-between">
                  <span>{day}</span>
                  <span className="text-xs opacity-70">{parseInt(ymd.slice(8), 10)}</span>
                </div>
                <div className="space-y-1">
                  {dayItems.map((it)=>{
                    const t = taskMap.get(it.taskId)
                    const color = t?.color || '#888'
                    const dispName = agentDisplayName(agents as any, (it as any).agentId, it.person)
                    return (
                      <div key={`${(it as any)._idx}-${it.person}-${it.start}-${it.end}`} className={["group relative rounded-md px-2 py-1", dark?"bg-neutral-800 text-neutral-100 border border-neutral-700":"bg-white text-neutral-900 border border-neutral-300 shadow-sm"].join(' ')}>
                        <div className="flex items-center gap-1.5 text-[11px] leading-tight">
                          <span className="inline-block w-2 h-2 rounded-full" style={{ background: color }} />
                          <span className="truncate">{dispName}</span>
                        </div>
                        <div className="text-[11px] opacity-70 leading-tight truncate">{it.start}–{it.end}</div>
                        <div className={["pointer-events-none absolute -top-6 left-0 z-10 px-1.5 py-0.5 rounded text-[10px] whitespace-nowrap", dark?"bg-neutral-800 border border-neutral-700 text-neutral-100":"bg-white border border-neutral-300 text-neutral-900","opacity-0 group-hover:opacity-100 transition-none shadow-sm"].join(' ')}>
                          {(t?.name || (it as any).taskId)} • {it.start}–{it.end}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          } else {
            const laneCount = Math.max(1, lanes.length)
            const laneWidthPct = 100 / laneCount
            return (
              <div key={day} className={["rounded-lg p-2 relative overflow-hidden", dark?"bg-neutral-950":"bg-neutral-50"].join(' ')} style={{ height: H_PX }}>
                <div className="font-medium mb-2 flex items-baseline justify-between">
                  <span>{day}</span>
                  <span className="text-xs opacity-70">{parseInt(ymd.slice(8), 10)}</span>
                </div>
                {/* Hour grid */}
                <div className="absolute left-2 right-2 bottom-2 top-9">
                  {hourMarks.map((h)=>{
                    const top = (h/24)*100
                    return <div key={h} className="absolute left-0 right-0" style={{ top: `${top}%`, height: h===0?1:1 }}>
                      <div style={{ borderTop: `1px solid ${hrColor}` }} />
                    </div>
                  })}
                  {/* Items */}
                  {placed.map(({it, lane, s, e})=>{
                    const top = (s/1440)*100
                    const height = Math.max(1.5, ((e-s)/1440)*100)
                    const left = `calc(${lane * laneWidthPct}% + 0px)`
                    const width = `calc(${laneWidthPct}% - 4px)`
                    const t = taskMap.get(it.taskId)
                    const color = t?.color || '#888'
                    const dispName = agentDisplayName(agents as any, (it as any).agentId, it.person)
                    return (
                      <div
                        key={`${(it as any)._idx}-${it.person}-${it.start}-${it.end}`}
                        className={["group relative absolute rounded-md px-2 py-1 overflow-hidden", dark?"bg-neutral-800 text-neutral-100 border border-neutral-700":"bg-white text-neutral-900 border border-neutral-300 shadow-sm"].join(' ')}
                        style={{ top:`${top}%`, height:`${height}%`, left, width }}
                      >
                        <div className="flex items-center gap-1.5 text-[11px] leading-tight">
                          <span className="inline-block w-2 h-2 rounded-full" style={{ background: color }} />
                          <span className="truncate">{dispName}</span>
                        </div>
                        <div className="text-[11px] opacity-70 leading-tight truncate">{it.start}–{it.end}</div>
                        {/* Instant tooltip */}
                        <div
                          className={[
                            "pointer-events-none absolute -top-6 left-0 z-10 px-1.5 py-0.5 rounded text-[10px] whitespace-nowrap",
                            dark?"bg-neutral-800 border border-neutral-700 text-neutral-100":"bg-white border border-neutral-300 text-neutral-900",
                            "opacity-0 group-hover:opacity-100 transition-none shadow-sm"
                          ].join(' ')}
                        >
                          {(t?.name || (it as any).taskId)} • {it.start}–{it.end}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          }
        })}
      </div>
    </div>
  )
}
