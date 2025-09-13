import React from 'react'
import type { PTO, Task, Override } from '../types'
import type { CalendarSegment } from '../lib/utils'
import { DAYS } from '../constants'
import WeeklyPTOCalendar from '../components/WeeklyPTOCalendar'
import WeeklyOverridesCalendar from '../components/WeeklyOverridesCalendar'
import WeeklyPosturesCalendar from '../components/WeeklyPosturesCalendar'

type AgentRow = { id?: string; firstName?: string; lastName?: string; tzId?: string; hidden?: boolean; isSupervisor?: boolean; supervisorId?: string|null }

export default function TeamsPage({
  dark,
  weekStart,
  agents,
  pto,
  overrides,
  tasks,
  calendarSegs,
}:{
  dark: boolean
  weekStart: string
  agents: AgentRow[]
  pto: PTO[]
  overrides?: Override[]
  tasks: Task[]
  calendarSegs: CalendarSegment[]
}){
  const fullName = (a?: AgentRow)=> `${a?.firstName||''} ${a?.lastName||''}`.trim()
  const nameKey = (s?: string)=> (s||'').trim().toLowerCase()
  // Include hidden agents in rosters
  const visibleAgents = React.useMemo(()=> (agents||[]), [agents])
  const supList = React.useMemo(()=> (agents||[]).filter(a=> !!a.isSupervisor), [agents])
  // Build supervisor key aliases so children can match either id or full name from legacy data
  const supKeys = React.useMemo(()=>{
    const map = new Map<string,string>()
    for(const s of (agents||[])){
      if(!s.isSupervisor) continue
      const nmKey = nameKey(fullName(s))
      const key = (s.id && String(s.id)) || nmKey
      if(!key) continue
      map.set(key, key) // id->key
      if(nmKey) map.set(nmKey, key) // name->key
    }
    return map
  }, [agents])
  const bySup = React.useMemo(()=>{
    const m = new Map<string, AgentRow[]>()
    // Initialize buckets for visible supervisors
    for(const s of supList){
      const nmKey = nameKey(fullName(s))
      const key = (s.id && String(s.id)) || nmKey
      if(!key) continue
      if(!m.has(key)) m.set(key, [])
    }
    for(const a of (agents||[])){
      const sidRaw = a.supervisorId || ''
      if(!sidRaw) continue
      const alias = supKeys.get(sidRaw) || supKeys.get(nameKey(sidRaw))
      if(alias && m.has(alias)) m.get(alias)!.push(a)
    }
    return m
  }, [agents, supList, supKeys])
  const unassigned = React.useMemo(()=> (agents||[]).filter(a=>{
    if(a.isSupervisor) return false
    const sidRaw = a.supervisorId || ''
    if(!sidRaw) return true
    const alias = supKeys.get(sidRaw) || supKeys.get(nameKey(sidRaw))
    // Unassigned if no matching visible supervisor bucket
    return !alias || !bySup.has(alias)
  }), [agents, supKeys, bySup])
  // Helper maps for hidden and name->agent resolution
  const agentById = React.useMemo(()=>{
    const m = new Map<string, AgentRow>()
    for(const a of agents){ if(a.id) m.set(a.id, a) }
    return m
  }, [agents])
  const agentByNameLower = React.useMemo(()=>{
    const m = new Map<string, AgentRow>()
    for(const a of agents){
      const n = fullName(a).toLowerCase(); if(n) m.set(n, a)
    }
    return m
  }, [agents])
  const tagBase = 'inline-flex items-center gap-2 px-2 py-1 rounded border text-sm'
  const tagIdle = dark? 'border-neutral-700 bg-neutral-900 text-neutral-100' : 'border-neutral-300 bg-white text-neutral-900'

  return (
    <section className={["rounded-2xl p-3", dark?"bg-neutral-900":"bg-white shadow-sm"].join(' ')}>
      {/* Teams roster */}
      <div className="mb-3">
        <div className={["text-lg font-semibold mb-2", dark?"text-neutral-200":"text-neutral-900"].join(' ')}>Teams</div>
        {/* Single row of supervisor columns; horizontally scrollable */}
        <div className="overflow-x-auto">
          <div className="flex items-start gap-3 min-w-full pb-1">
            {(()=>{
              const displaySups = supList
                .slice()
                .sort((a,b)=> fullName(a).localeCompare(fullName(b)))
              if(displaySups.length===0){
                return (
                  <div className={[tagBase, tagIdle].join(' ')}>No supervisors yet</div>
                )
              }
              return displaySups.map(s=>{
                const key = (s.id && String(s.id)) || nameKey(fullName(s))
                const kids = (key ? (bySup.get(key) || []) : []).slice().sort((a,b)=> fullName(a).localeCompare(fullName(b)))
                const supMuted = !!s.hidden
                return (
                  <div key={s.id || fullName(s)} className={["shrink-0 w-56 md:w-64 rounded-xl p-2 border", dark?"border-neutral-800":"border-neutral-200"].join(' ')}>
                    <div className="flex items-center gap-2 mb-2">
                      <div className={["font-medium", supMuted ? (dark?"text-neutral-400":"text-neutral-500") : (dark?"text-neutral-100":"text-neutral-900")].join(' ')}>{fullName(s) || s.id}</div>
                      <span className={["text-xs px-1.5 py-0.5 rounded border", dark?"border-neutral-700 text-neutral-300":"border-neutral-300 text-neutral-600"].join(' ')}>{kids.length}</span>
                    </div>
                    {kids.length>0 ? (
                      <ul className="space-y-1">
                        {kids.map(a=> (
                          <li key={a.id || fullName(a)} className={["px-2 py-1 rounded border text-sm text-left", dark?"border-neutral-700 text-neutral-200":"border-neutral-300 text-neutral-800"].join(' ')}>{fullName(a) || a.id}</li>
                        ))}
                      </ul>
                    ) : (
                      <div className={["text-sm", dark?"text-neutral-400":"text-neutral-500"].join(' ')}>No direct reports</div>
                    )}
                  </div>
                )
              })
            })()}
            {unassigned.length>0 && (
              <div className={["shrink-0 w-56 md:w-64 rounded-xl p-2 border", dark?"border-neutral-800":"border-neutral-200"].join(' ')}>
                <div className={["font-medium mb-2", dark?"text-neutral-100":"text-neutral-900"].join(' ')}>Unassigned</div>
                <ul className="space-y-1">
                  {unassigned.slice().sort((a,b)=> fullName(a).localeCompare(fullName(b))).map(a=> (
                    <li key={a.id || fullName(a)} className={["px-2 py-1 rounded border text-sm text-left", dark?"border-neutral-700 text-neutral-200":"border-neutral-300 text-neutral-800"].join(' ')}>{fullName(a) || a.id}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Calendars section */}
      <div className="mt-4">
        <div className={["text-lg font-semibold mb-2", dark?"text-neutral-200":"text-neutral-900"].join(' ')}>Calendars</div>
        <WeeklyPTOCalendar dark={dark} weekStart={weekStart} pto={pto} agents={agents} />
        <WeeklyOverridesCalendar dark={dark} weekStart={weekStart} overrides={(overrides||[]) as any} agents={agents} />
        {(()=>{
          const activeTasks = (tasks||[]).filter(t=> !t.archived)
            .filter(t=> (calendarSegs||[]).some(cs=> cs.taskId===t.id))
            .sort((a,b)=> (a.name||'').localeCompare(b.name||''))
          if(activeTasks.length===0) return null
          return activeTasks.map(t=> (
            <WeeklyPosturesCalendar
              key={t.id}
              dark={dark}
              weekStart={weekStart}
              calendarSegs={calendarSegs}
              tasks={tasks}
              agents={agents}
              filterTaskId={t.id}
              packed
              title={`Weekly ${t.name} calendar`}
            />
          ))
        })()}
      </div>
    </section>
  )
}
