import React from 'react'
import { DAYS } from '../constants'
import { addDays, agentDisplayName, fmtYMD, parseYMD } from '../lib/utils'
import type { Override } from '../types'

type AgentRow = { id?: string; firstName?: string; lastName?: string }

export default function WeeklyOverridesCalendar({ dark, weekStart, overrides, agents, title = 'Weekly Overrides calendar', subtitle = 'Presence indicates any override on that day' }:{
  dark: boolean
  weekStart: string
  overrides: Override[]
  agents: AgentRow[]
  title?: string
  subtitle?: string
}){
  const H_PX = 280
  const rowHeight = 44 // vertical lane spacing to allow multi-line chips
  const week0 = parseYMD(weekStart)
  const ymds = DAYS.map((_,i)=> fmtYMD(addDays(week0, i)))

  return (
    <div className={["mt-3 rounded-xl p-3 border", dark?"bg-neutral-900 border-neutral-800":"bg-white border-neutral-200"].join(' ')}>
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-medium">{title}</div>
        <div className="text-xs opacity-70">{subtitle}</div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-7 gap-3 text-sm">
        {DAYS.map((day, di)=>{
          const ymd = ymds[di]
          const dayItems = (overrides||[])
            .filter(o=> o.startDate <= ymd && o.endDate >= ymd)
            .slice()
            .sort((a,b)=>{
              const aN = agentDisplayName(agents as any, (a as any).agentId, a.person)
              const bN = agentDisplayName(agents as any, (b as any).agentId, b.person)
              return aN.localeCompare(bN) || a.startDate.localeCompare(b.startDate)
            })
          const laneByPerson = new Map<string, number>()
          let nextLane = 0
          const placed = dayItems.map(o=>{
            const disp = agentDisplayName(agents as any, (o as any).agentId, o.person)
            let lane = laneByPerson.get(disp)
            if(lane==null){ lane = nextLane++; laneByPerson.set(disp, lane) }
            const time = (o.start && o.end) ? `${o.start}–${o.end}${o.endDay? ' '+o.endDay : ''}` : ''
            const note = [o.kind, time].filter(Boolean).join(' • ')
            return { o, lane, disp, note }
          })
          const heightPx = Math.min(H_PX, Math.max(placed.length * (rowHeight+6) + 28, 140))
          return (
            <div key={day} className={["rounded-lg p-2 relative overflow-hidden", dark?"bg-neutral-950":"bg-neutral-50"].join(' ')} style={{ height: heightPx }}>
              <div className="font-medium mb-1 flex items-baseline justify-between">
                <span>{day}</span>
                <span className="text-xs opacity-70">{parseInt(ymd.slice(8), 10)}</span>
              </div>
              <div className="absolute left-2 right-2 bottom-2 top-7">
                {placed.map(({o, lane, disp, note}, idx)=>{
                  const top = lane * (rowHeight + 6)
                  const title = `${disp} • ${o.startDate} → ${o.endDate}${note? ' — '+note : ''}`
                  return (
                    <div key={`${o.id}-${idx}`} className={["absolute left-0 right-0 rounded-md px-2 py-1", dark?"bg-neutral-800 text-neutral-100 border border-neutral-700":"bg-white text-neutral-900 border border-neutral-300 shadow-sm"].join(' ')} style={{ top }} title={title}>
                      <div className="text-[13px] leading-snug break-words">{disp}</div>
                      {note && (<div className="text-[11px] opacity-80 leading-snug break-words">{note}</div>)}
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
