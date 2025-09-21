import React from 'react'
import { DAYS } from '../constants'
import { addDays, agentDisplayName, fmtYMD, parseYMD } from '../lib/utils'
import type { PTO } from '../types'

type AgentRow = { id?: string; firstName?: string; lastName?: string }

export default function WeeklyPTOCalendar({ dark, weekStart, pto, agents, title = 'Weekly PTO calendar', subtitle = 'Full-day entries by person', collapsible }:{
  dark: boolean
  weekStart: string
  pto: PTO[]
  agents: AgentRow[]
  title?: string
  subtitle?: string
  collapsible?: {
    collapsed: boolean
    onToggle: ()=>void
  }
}){
  const H_PX = 280
  const rowHeight = 44 // vertical lane spacing to allow multi-line chips
  const week0 = parseYMD(weekStart)
  const ymds = DAYS.map((_,i)=> fmtYMD(addDays(week0, i)))
  const contentId = React.useId()
  const collapsed = collapsible?.collapsed ?? false
  const headerContent = (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 sm:gap-2">
      <div className="text-sm font-medium">{title}</div>
      {subtitle && <div className="text-xs opacity-70">{subtitle}</div>}
    </div>
  )
  const grid = (
    <div className="grid grid-cols-1 md:grid-cols-7 gap-3 text-sm">
      {DAYS.map((day, di)=>{
        const ymd = ymds[di]
        const dayItems = (pto||[])
          .filter(p=> p.startDate <= ymd && p.endDate >= ymd)
          .slice()
          .sort((a,b)=>{
            const aN = agentDisplayName(agents as any, (a as any).agentId, a.person)
            const bN = agentDisplayName(agents as any, (b as any).agentId, b.person)
            return aN.localeCompare(bN) || a.startDate.localeCompare(b.startDate)
          })
        const laneByPerson = new Map<string, number>()
        let nextLane = 0
        const placed = dayItems.map(p=>{
          const disp = agentDisplayName(agents as any, (p as any).agentId, p.person)
          let lane = laneByPerson.get(disp)
          if(lane==null){ lane = nextLane++; laneByPerson.set(disp, lane) }
          return { p, lane, disp }
        })
        const heightPx = Math.min(H_PX, Math.max(placed.length * (rowHeight+6) + 28, 140))
        return (
          <div key={day} className={["rounded-lg p-2 relative overflow-hidden", dark?"bg-neutral-950":"bg-neutral-50"].join(' ')} style={{ height: heightPx }}>
            <div className="font-medium mb-1 flex items-baseline justify-between">
              <span>{day}</span>
              <span className="text-xs opacity-70">{parseInt(ymd.slice(8), 10)}</span>
            </div>
            <div className="absolute left-2 right-2 bottom-2 top-7">
              {placed.map(({p, lane, disp}, idx)=>{
                const top = lane * (rowHeight + 6)
                return (
                  <div key={`${p.id}-${idx}`} className={["absolute left-0 right-0 rounded-md px-2 py-1", dark?"bg-neutral-800 text-neutral-100 border border-neutral-700":"bg-white text-neutral-900 border border-neutral-300 shadow-sm"].join(' ')} style={{ top }} title={`${disp} • ${p.startDate} → ${p.endDate}${p.notes? ' — '+p.notes : ''}`}>
                    <div className="text-[13px] leading-snug break-words">{disp}</div>
                    {p.notes && (<div className="text-[11px] opacity-80 leading-snug break-words">{p.notes}</div>)}
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )

  return (
    <div className={["mt-3 rounded-xl p-3 border", dark?"bg-neutral-900 border-neutral-800":"bg-white border-neutral-200"].join(' ')}>
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
          <div id={contentId} hidden={collapsed} className="mt-3">
            {!collapsed && grid}
          </div>
        </>
      ) : (
        <>
          <div className="flex items-center justify-between mb-2">
            {headerContent}
          </div>
          {grid}
        </>
      )}
    </div>
  )
}
