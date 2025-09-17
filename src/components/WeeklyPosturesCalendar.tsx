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
  const PX_PER_HOUR = 40
  const H_PX = PX_PER_HOUR * 24 // calendar body height in pixels
  const hrColor = dark? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'
  const hourLabelEvery = 2
  const timeAxisPx = 72
  const dayMinWidthPx = 156
  const hourMarks = React.useMemo(()=> Array.from({length:25},(_,i)=>i), [])
  const taskMap = React.useMemo(()=> new Map(tasks.map(t=>[t.id,t])), [tasks])
  const perDay = React.useMemo(()=>{
    return DAYS.map((day, di)=>{
      const ymd = ymds[di]
      const dayItems = (calendarSegs||[])
        .map((cs, _idx)=> ({...cs, _idx}))
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
      const lanes: number[] = []
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
      return { day, ymd, dateObj: parseYMD(ymd), dayItems, placed, laneCount: Math.max(1, lanes.length) }
    })
  }, [calendarSegs, filterTaskId, ymds])
  const formatHourLabel = (h: number)=>{
    const suffix = h >= 12 ? 'p' : 'a'
    const hour12 = h % 12 === 0 ? 12 : h % 12
    if(h===24) return '12a'
    return `${hour12}${suffix}`
  }
  const axisLabelCls = dark? 'text-neutral-400' : 'text-neutral-500'
  const axisBorderColor = dark? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'
  const dayBgCls = dark? 'bg-neutral-950 border-neutral-800' : 'bg-white border-neutral-200 shadow-sm'

  return (
    <div className={["mt-3 rounded-xl p-3", dark?"bg-neutral-900":"bg-white"].join(' ')}>
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-medium">{title}</div>
        {subtitle && (<div className="text-xs opacity-70">{subtitle}</div>)}
      </div>
      {packed ? (
        <div className="grid grid-cols-1 md:grid-cols-7 gap-3 text-sm">
          {perDay.map(({ day, ymd, dayItems })=> (
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
          ))}
        </div>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <div className="min-w-[860px]">
            <div
              className="grid gap-x-3 text-sm"
              style={{
                gridTemplateColumns: `${timeAxisPx}px repeat(${DAYS.length}, minmax(${dayMinWidthPx}px, 1fr))`,
                gridTemplateRows: `auto ${H_PX}px`,
              }}
            >
              <div />
              {perDay.map(({ day, dateObj })=>{
                const monthLabel = dateObj.toLocaleDateString(undefined, { month: 'short' })
                return (
                  <div key={`${day}-header`} className="pb-2 pl-1">
                    <div className="flex items-baseline gap-2">
                      <span className="text-sm font-semibold">{day}</span>
                      <span className="text-xs opacity-70">{monthLabel} {dateObj.getDate()}</span>
                    </div>
                  </div>
                )
              })}
              <div className="relative" style={{ height: `${H_PX}px` }}>
                <div className="absolute inset-y-0 right-0" style={{ borderRight: `1px solid ${axisBorderColor}` }} />
                {hourMarks.map((h)=>{
                  if(h===24) return null
                  const top = h * PX_PER_HOUR
                  const showLabel = h % hourLabelEvery === 0
                  return (
                    <div
                      key={`axis-${h}`}
                      className="absolute inset-x-0 flex justify-end pr-2"
                      style={{ top: `${top}px` }}
                    >
                      {showLabel && (
                        <span
                          className={["text-[11px] font-medium", axisLabelCls].join(' ')}
                          style={{ transform: h===0 ? 'translateY(0)' : 'translateY(-50%)' }}
                        >
                          {formatHourLabel(h)}
                        </span>
                      )}
                    </div>
                  )
                })}
              </div>
              {perDay.map(({ day, dayItems, placed, laneCount })=>{
                const laneWidthPct = 100 / laneCount
                return (
                  <div
                    key={`${day}-column`}
                    className={["relative rounded-xl border overflow-hidden", dayBgCls].join(' ')}
                    style={{ height: `${H_PX}px` }}
                  >
                    <div className="absolute inset-0 pointer-events-none">
                      {hourMarks.map((h)=>{
                        const top = h * PX_PER_HOUR
                        return (
                          <div key={`${day}-grid-${h}`} className="absolute inset-x-0" style={{ top: `${top}px` }}>
                            <div style={{ borderTop: `1px solid ${hrColor}`, opacity: h % hourLabelEvery === 0 ? 0.5 : 0.2 }} />
                          </div>
                        )
                      })}
                    </div>
                    <div className="relative h-full px-2 pb-3 pt-1">
                      {dayItems.length===0 && (
                        <div className="absolute inset-0 flex items-center justify-center text-xs opacity-60">
                          No coverage
                        </div>
                      )}
                      {placed.map(({ it, lane, s, e })=>{
                        const topPx = (s/60) * PX_PER_HOUR
                        const heightPx = Math.max(18, ((e - s)/60) * PX_PER_HOUR)
                        const left = `calc(${lane * laneWidthPct}% + 2px)`
                        const width = `calc(${laneWidthPct}% - 4px)`
                        const t = taskMap.get(it.taskId)
                        const color = t?.color || '#888'
                        const dispName = agentDisplayName(agents as any, (it as any).agentId, it.person)
                        return (
                          <div
                            key={`${(it as any)._idx}-${it.person}-${it.start}-${it.end}`}
                            className={[
                              "group absolute rounded-md px-2 py-1 overflow-hidden border",
                              dark?"bg-neutral-800 text-neutral-100 border-neutral-700":"bg-white text-neutral-900 border-neutral-300 shadow-sm",
                            ].join(' ')}
                            style={{ top: `${topPx}px`, height: `${heightPx}px`, left, width }}
                          >
                            <div className="flex items-center gap-1.5 text-[11px] leading-tight">
                              <span className="inline-block w-2 h-2 rounded-full" style={{ background: color }} />
                              <span className="truncate">{dispName}</span>
                            </div>
                            <div className="text-[11px] opacity-70 leading-tight truncate">{it.start}–{it.end}</div>
                            <div
                              className={[
                                "pointer-events-none absolute -top-6 left-0 z-10 px-1.5 py-0.5 rounded text-[10px] whitespace-nowrap",
                                dark?"bg-neutral-800 border border-neutral-700 text-neutral-100":"bg-white border border-neutral-300 text-neutral-900",
                                "opacity-0 group-hover:opacity-100 transition-none shadow-sm",
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
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
