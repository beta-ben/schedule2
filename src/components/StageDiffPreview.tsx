import React from 'react'
import AllAgentsWeekRibbons from './AllAgentsWeekRibbons'
import type { Shift, PTO, Task } from '../types'
import type { CalendarSegment } from '../lib/utils'

type AgentRow = { firstName: string; lastName: string; tzId?: string }
type DiffMode = 'overlay' | 'side'

const LIVE_HIGHLIGHT = { light: 'rgba(59,130,246,0.55)', dark: 'rgba(96,165,250,0.75)' }
const STAGE_HIGHLIGHT = { light: 'rgba(34,197,94,0.92)', dark: 'rgba(134,239,172,0.92)' }

type StageDiffPreviewProps = {
  dark: boolean
  tz: { id: string; label: string; offset: number }
  weekStart: string
  agents: AgentRow[]
  liveShifts: Shift[]
  stageShifts: Shift[]
  livePto?: PTO[]
  stagePto?: PTO[]
  tasks?: Task[]
  calendarSegs?: CalendarSegment[]
  mode: DiffMode
  onlyChanged: boolean
  fixedOrder?: string[]
}

type DiffResult = {
  changedAgents: Set<string>
  liveChanged: Set<string>
  stageChanged: Set<string>
}

export default function StageDiffPreview(props: StageDiffPreviewProps){
  const {
    dark,
    tz,
    weekStart,
    agents,
    liveShifts,
    stageShifts,
    livePto = [],
    stagePto = [],
    tasks = [],
    calendarSegs = [],
    mode,
    onlyChanged,
    fixedOrder,
  } = props

  const diff = React.useMemo<DiffResult>(()=> computeShiftDiff(liveShifts, stageShifts), [liveShifts, stageShifts])

  const agentFilter = React.useMemo(()=> {
    if(!onlyChanged) return agents
    if(diff.changedAgents.size === 0) return agents
    return agents.filter(agent => diff.changedAgents.has(fullName(agent)))
  }, [agents, diff.changedAgents, onlyChanged])

  const filteredLiveShifts = React.useMemo(()=> onlyChanged ? liveShifts.filter(s => diff.changedAgents.has(s.person||'')) : liveShifts, [liveShifts, diff.changedAgents, onlyChanged])
  const filteredStageShifts = React.useMemo(()=> onlyChanged ? stageShifts.filter(s => diff.changedAgents.has(s.person||'')) : stageShifts, [stageShifts, diff.changedAgents, onlyChanged])

  if(mode === 'side'){
    return (
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <Column
          title="Live"
          dark={dark}
          tz={tz}
          weekStart={weekStart}
          agents={agentFilter}
          shifts={filteredLiveShifts}
          pto={livePto}
          tasks={tasks}
          calendarSegs={calendarSegs}
          highlightIds={diff.liveChanged}
          dimUnhighlighted={onlyChanged}
          chipTone="ghost"
          fixedOrder={fixedOrder}
          highlightColor={LIVE_HIGHLIGHT}
        />
        <Column
          title="Stage"
          dark={dark}
          tz={tz}
          weekStart={weekStart}
          agents={agentFilter}
          shifts={filteredStageShifts}
          pto={stagePto}
          tasks={tasks}
          calendarSegs={calendarSegs}
          highlightIds={diff.stageChanged}
          dimUnhighlighted={onlyChanged}
          chipTone="stage"
          fixedOrder={fixedOrder}
          highlightColor={STAGE_HIGHLIGHT}
        />
      </div>
    )
  }

  // Overlay mode: Live beneath Stage
  return (
    <div className="space-y-2">
      <div className={["relative overflow-hidden rounded-xl border", dark ? "bg-neutral-950 border-neutral-800" : "bg-neutral-50 border-neutral-200"].join(' ')}>
        <div className="relative z-10">
          <AllAgentsWeekRibbons
            dark={dark}
            tz={tz}
            weekStart={weekStart}
            agents={agentFilter}
            shifts={filteredStageShifts}
            pto={stagePto}
            tasks={tasks}
            calendarSegs={calendarSegs}
            visibleDays={7}
            showAllTimeLabels={false}
            highlightIds={diff.stageChanged}
            dimUnhighlighted={onlyChanged}
            chipTone="stage"
            fixedOrder={fixedOrder}
            highlightColor={STAGE_HIGHLIGHT}
          />
        </div>
        <div className="pointer-events-none absolute inset-0 opacity-35">
          <AllAgentsWeekRibbons
            dark={dark}
            tz={tz}
            weekStart={weekStart}
            agents={agentFilter}
            shifts={filteredLiveShifts}
            pto={livePto}
            tasks={tasks}
            calendarSegs={calendarSegs}
            visibleDays={7}
            showAllTimeLabels={false}
            highlightIds={diff.liveChanged}
            highlightColor={LIVE_HIGHLIGHT}
            dimUnhighlighted={onlyChanged}
            chipTone="ghost"
            fixedOrder={fixedOrder}
          />
        </div>
      </div>
      <div className="text-[10px] opacity-70">
        Orange highlights show staged edits. Blue ghosts indicate removed or modified live shifts.
      </div>
    </div>
  )
}

function Column(props: {
  title: string
  dark: boolean
  tz: { id: string; label: string; offset: number }
  weekStart: string
  agents: AgentRow[]
  shifts: Shift[]
  pto: PTO[]
  tasks: Task[]
  calendarSegs: CalendarSegment[]
  highlightIds: Set<string>
  dimUnhighlighted: boolean
  highlightColor?: { light: string; dark: string }
  chipTone?: 'default'|'stage'|'ghost'
  fixedOrder?: string[]
}){
  const { title, dark, tz, weekStart, agents, shifts, pto, tasks, calendarSegs, highlightIds, dimUnhighlighted, highlightColor, chipTone='default', fixedOrder } = props
  return (
    <div className={["rounded-xl border p-2", dark ? "bg-neutral-950 border-neutral-800" : "bg-neutral-50 border-neutral-200"].join(' ')}>
      <div className="text-xs font-semibold mb-2">{title}</div>
      <AllAgentsWeekRibbons
        dark={dark}
        tz={tz}
        weekStart={weekStart}
        agents={agents}
        shifts={shifts}
        pto={pto}
        tasks={tasks}
        calendarSegs={calendarSegs}
        visibleDays={7}
        showAllTimeLabels={false}
        highlightIds={highlightIds}
        highlightColor={highlightColor}
        chipTone={chipTone}
        dimUnhighlighted={dimUnhighlighted}
        fixedOrder={fixedOrder}
      />
    </div>
  )
}

function computeShiftDiff(live: Shift[], stage: Shift[]): DiffResult{
  const liveById = new Map<string, Shift>()
  const stageById = new Map<string, Shift>()
  for(const s of live){ if(s?.id) liveById.set(s.id, s) }
  for(const s of stage){ if(s?.id) stageById.set(s.id, s) }

  const changedAgents = new Set<string>()
  const liveChanged = new Set<string>()
  const stageChanged = new Set<string>()

  for(const s of stage){
    const person = s.person || ''
    const counterpart = s.id ? liveById.get(s.id) : undefined
    if(!counterpart){
      if(s.id) stageChanged.add(s.id)
      if(person) changedAgents.add(person)
      continue
    }
    if(!shiftsEqual(counterpart, s)){
      if(counterpart.id) liveChanged.add(counterpart.id)
      if(s.id) stageChanged.add(s.id)
      if(counterpart.person) changedAgents.add(counterpart.person)
      if(person) changedAgents.add(person)
    }
  }

  for(const liveShift of live){
    if(!liveShift?.id) continue
    if(stageById.has(liveShift.id)) continue
    liveChanged.add(liveShift.id)
    if(liveShift.person) changedAgents.add(liveShift.person)
  }

  return { changedAgents, liveChanged, stageChanged }
}

function shiftsEqual(a: Shift, b: Shift){
  if(a.person !== b.person) return false
  if(a.day !== b.day) return false
  if(a.start !== b.start) return false
  if(a.end !== b.end) return false
  const aEndDay = (a as any).endDay || a.day
  const bEndDay = (b as any).endDay || b.day
  if(aEndDay !== bEndDay) return false
  return true
}

function fullName(agent: AgentRow){
  return [agent.firstName, agent.lastName].filter(Boolean).join(' ').trim()
}
