import React from 'react'
import AllAgentsWeekRibbons from './AllAgentsWeekRibbons'
import type { Shift, PTO, Task } from '../types'
import type { CalendarSegment } from '../lib/utils'

type AgentRow = { firstName: string; lastName: string; tzId?: string }

export default function ProposalDiffVisualizer({
  dark,
  tz,
  weekStart,
  agents,
  live,
  proposal,
  highlightLiveIds,
  highlightProposalIds,
  tasks,
  calendarSegs,
}:{
  dark: boolean
  tz: { id:string; label:string; offset:number }
  weekStart: string
  agents: AgentRow[]
  live: { shifts: Shift[]; pto?: PTO[] }
  proposal: { shifts: Shift[]; pto?: PTO[] }
  highlightLiveIds?: Set<string> | string[]
  highlightProposalIds?: Set<string> | string[]
  tasks?: Task[]
  calendarSegs?: CalendarSegment[]
}){
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className={["rounded-xl p-2 border", dark?"bg-neutral-950 border-neutral-800":"bg-neutral-50 border-neutral-200"].join(' ')}>
          <div className="text-xs font-semibold mb-2">Live</div>
          <AllAgentsWeekRibbons
            dark={dark}
            tz={tz}
            weekStart={weekStart}
            agents={agents}
            shifts={live.shifts}
            pto={live.pto||[]}
            tasks={tasks||[]}
            calendarSegs={calendarSegs||[]}
            visibleDays={7}
            showAllTimeLabels={false}
            highlightIds={highlightLiveIds}
            sortMode={'start'}
            sortDir={'asc'}
            showNameColumn={true}
          />
        </div>
        <div className={["rounded-xl p-2 border", dark?"bg-neutral-950 border-neutral-800":"bg-neutral-50 border-neutral-200"].join(' ')}>
          <div className="text-xs font-semibold mb-2">Proposal</div>
          <AllAgentsWeekRibbons
            dark={dark}
            tz={tz}
            weekStart={weekStart}
            agents={agents}
            shifts={proposal.shifts}
            pto={proposal.pto||[]}
            tasks={tasks||[]}
            calendarSegs={calendarSegs||[]}
            visibleDays={7}
            showAllTimeLabels={false}
            highlightIds={highlightProposalIds}
            sortMode={'start'}
            sortDir={'asc'}
            showNameColumn={false}
          />
        </div>
      </div>
      <div className="text-[10px] opacity-70">
        Visual highlights indicate changed items (added/removed/modified).
      </div>
    </div>
  )
}
