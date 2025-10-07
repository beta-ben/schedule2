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
  collapsible,
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
  collapsible?: {
    collapsed: boolean
    onToggle: ()=>void
  }
}){
  const week0 = React.useMemo(()=> parseYMD(weekStart), [weekStart])
  const ymds = React.useMemo(()=> DAYS.map((_,i)=> fmtYMD(addDays(week0, i))), [week0])
  const pxPerHour = packed ? 24 : 30
  const calendarHeightPx = pxPerHour * 24
  const hrColor = dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'
  const quarterHrColor = dark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.035)'
  const hourLabelEvery = packed ? 3 : 2
  const showHalfHours = !packed
  const timeAxisPx = packed ? 56 : 68
  const dayMinWidthPx = packed ? 140 : 156
  const minGridWidthPx = packed ? 720 : 840
  const minSegmentHeightPx = packed ? 18 : 24
  const hourMarks = React.useMemo(()=> Array.from({ length: 25 }, (_, i)=> i), [])
  const hourLabelClass = packed ? 'text-[10px]' : 'text-[11px]'
  const segmentLabelClass = packed ? 'text-[10px]' : 'text-[11px]'
  const timeLabelClass = packed ? 'text-[10px]' : 'text-[11px]'
  const columnPaddingX = packed ? 'px-1.5' : 'px-2'
  const columnPaddingBottom = packed ? 'pb-2.5' : 'pb-3'
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
  const axisLabelCls = dark ? 'text-neutral-400' : 'text-neutral-500'
  const axisBorderColor = dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'
  const dayBgCls = dark ? 'bg-neutral-950 border-neutral-800' : 'bg-white border-neutral-200 shadow-sm'
  const contentId = React.useId()
  const collapsed = collapsible?.collapsed ?? false

  const headerContent = (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 sm:gap-2">
      <div className="text-sm font-medium">{title}</div>
      {subtitle && (<div className="text-xs opacity-70">{subtitle}</div>)}
    </div>
  )

  const body = (
    <div className="mt-3 overflow-x-auto">
      <div style={{ minWidth: `${minGridWidthPx}px` }}>
        <div
          className="grid gap-x-3 text-sm"
          style={{
            gridTemplateColumns: `${timeAxisPx}px repeat(${DAYS.length}, minmax(${dayMinWidthPx}px, 1fr))`,
            gridTemplateRows: `auto ${calendarHeightPx}px`,
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
          <div className="relative" style={{ height: `${calendarHeightPx}px` }}>
            <div className="absolute inset-y-0 right-0" style={{ borderRight: `1px solid ${axisBorderColor}` }} />
            {hourMarks.map((h)=>{
              if(h===24) return null
              const top = h * pxPerHour
              const showLabel = h % hourLabelEvery === 0
              return (
                <div
                  key={`axis-${h}`}
                  className="absolute inset-x-0 flex justify-end pr-2"
                  style={{ top: `${top}px` }}
                >
                  {showLabel && (
                    <span
                      className={[hourLabelClass, 'font-medium', axisLabelCls].join(' ')}
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
            const halfMarks = Array.from({ length: 24 }, (_, idx)=> idx)
            return (
              <div
                key={`${day}-column`}
                className={["relative rounded-xl border overflow-hidden", dayBgCls].join(' ')}
                style={{ height: `${calendarHeightPx}px` }}
              >
                <div className="absolute inset-0 pointer-events-none">
                  {hourMarks.map((h)=>{
                    if(h===24) return null
                    const top = h * pxPerHour
                    return (
                      <div key={`${day}-grid-${h}`} className="absolute inset-x-0" style={{ top: `${top}px` }}>
                        <div style={{ borderTop: `1px solid ${hrColor}`, opacity: h % hourLabelEvery === 0 ? 0.45 : 0.18 }} />
                      </div>
                    )
                  })}
                  {showHalfHours && halfMarks.map((h)=>{
                    const top = (h * pxPerHour) + (pxPerHour / 2)
                    if(top >= calendarHeightPx) return null
                    return (
                      <div key={`${day}-half-${h}`} className="absolute inset-x-0" style={{ top: `${top}px` }}>
                        <div style={{ borderTop: `1px solid ${quarterHrColor}`, opacity: 0.22 }} />
                      </div>
                    )
                  })}
                </div>
                <div className={['relative h-full', columnPaddingX, columnPaddingBottom, 'pt-1'].join(' ')}>
                  {dayItems.length===0 && (
                    <div className="absolute inset-0 flex items-center justify-center text-xs opacity-60">
                      No coverage
                    </div>
                  )}
                  {placed.map(({ it, lane, s, e })=>{
                    const topPx = (s/60) * pxPerHour
                    const heightPx = Math.max(minSegmentHeightPx, ((e - s)/60) * pxPerHour)
                    const left = `calc(${lane * laneWidthPct}% + 2px)`
                    const width = `calc(${laneWidthPct}% - 4px)`
                    const t = taskMap.get(it.taskId)
                    const color = t?.color || '#888'
                    const dispName = agentDisplayName(agents as any, (it as any).agentId, it.person)
                    return (
                      <div
                        key={`${(it as any)._idx}-${it.person}-${it.start}-${it.end}`}
                        className={[
                          'group absolute rounded-md border overflow-hidden flex flex-col gap-0.5 px-2 py-1',
                          dark?"bg-neutral-800 text-neutral-100 border-neutral-700":"bg-white text-neutral-900 border-neutral-300 shadow-sm",
                        ].join(' ')}
                        style={{ top: `${topPx}px`, height: `${heightPx}px`, left, width }}
                      >
                        <div className={["flex items-center gap-1.5 leading-tight", segmentLabelClass].join(' ')}>
                          <span className="inline-block w-2 h-2 rounded-full" style={{ background: color }} />
                          <span className="truncate">{dispName}</span>
                        </div>
                        <div className={[timeLabelClass, 'opacity-70 leading-tight truncate'].join(' ')}>{it.start}–{it.end}</div>
                        <div
                          className={[
                            'pointer-events-none absolute -top-6 left-0 z-10 px-1.5 py-0.5 rounded whitespace-nowrap',
                            dark?"bg-neutral-800 border border-neutral-700 text-neutral-100":"bg-white border border-neutral-300 text-neutral-900",
                            'text-[10px] opacity-0 group-hover:opacity-100 transition-none shadow-sm',
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
  )

  return (
    <div className={["mt-3 rounded-xl p-3", dark?"bg-neutral-900":"bg-white"].join(' ')}>
      {collapsible ? (
        <>
          <button
            type="button"
            className={[
              'w-full flex items-center justify-between gap-3 px-2 py-1.5 rounded-md text-left transition-colors focus:outline-none focus:ring-2',
              dark ? 'hover:bg-neutral-800 focus:ring-neutral-700 focus:ring-offset-0' : 'hover:bg-neutral-100 focus:ring-blue-500 focus:ring-offset-0',
            ].join(' ')}
            onClick={collapsible.onToggle}
            aria-expanded={!collapsed}
            aria-controls={contentId}
          >
            <div className="flex-1 min-w-0">
              {headerContent}
            </div>
            <svg
              className={["w-4 h-4 transform transition-transform", collapsed ? 'rotate-0' : 'rotate-90', dark?"text-neutral-400":"text-neutral-500"].join(' ')}
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
          <div id={contentId} hidden={collapsed}>
            {!collapsed && body}
          </div>
        </>
      ) : (
        <>
          <div className="flex items-center justify-between mb-2">
            {headerContent}
          </div>
          {body}
        </>
      )}
    </div>
  )
}
