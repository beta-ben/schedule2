import React from 'react'
import type { PTO, Task, Override, MeetingCohort, Shift, TZOpt } from '../types'
import type { CalendarSegment } from '../lib/utils'
import WeeklyPTOCalendar from '../components/WeeklyPTOCalendar'
import WeeklyOverridesCalendar from '../components/WeeklyOverridesCalendar'
import WeeklyPosturesCalendar from '../components/WeeklyPosturesCalendar'
import AccordionSection from '../components/AccordionSection'
import { MEETING_COHORTS } from '../constants'
import { applyOverrides, convertShiftsToTZ, toMin } from '../lib/utils'
import { useTimeFormat } from '../context/TimeFormatContext'

const WEEK_ORDER: Array<'Mon'|'Tue'|'Wed'|'Thu'|'Fri'|'Sat'|'Sun'> = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']

type AgentRow = { id?: string; firstName?: string; lastName?: string; tzId?: string; hidden?: boolean; isSupervisor?: boolean; supervisorId?: string|null; meetingCohort?: MeetingCohort | null }

export default function TeamsPage({
  dark,
  weekStart,
  agents,
  pto,
  overrides,
  tasks,
  calendarSegs,
  shifts,
  tz,
}:{
  dark: boolean
  weekStart: string
  agents: AgentRow[]
  pto: PTO[]
  overrides?: Override[]
  tasks: Task[]
  calendarSegs: CalendarSegment[]
  shifts: Shift[]
  tz: TZOpt
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
  const effectiveShifts = React.useMemo(()=> applyOverrides(shifts, overrides, weekStart, agents), [shifts, overrides, weekStart, agents])
  const tzShifts = React.useMemo(()=> convertShiftsToTZ(effectiveShifts, tz?.offset ?? 0), [effectiveShifts, tz?.offset])
  const { formatTime, timeFormat } = useTimeFormat()
  const formatTimeString = React.useCallback((hhmm: string)=>{
    if(hhmm === '24:00') return timeFormat === '24h' ? '24:00' : '12:00 AM'
    return formatTime(toMin(hhmm))
  }, [formatTime, timeFormat])
  const scheduleByAgent = React.useMemo(()=>{
    const map = new Map<string, string>()
    if(!Array.isArray(tzShifts) || tzShifts.length===0){
      return map
    }
    const dayBuckets = new Map<string, Map<string, Array<{ start:string; end:string }>>>()
    for(const s of tzShifts){
      const idKey = s.agentId ? String(s.agentId) : undefined
      const agentMatch = (idKey && agentById.get(idKey)) || agentByNameLower.get(nameKey(s.person))
      const primaryKey = agentMatch?.id ? String(agentMatch.id) : nameKey(agentMatch ? fullName(agentMatch) : s.person)
      if(!primaryKey) continue
      const bucket = dayBuckets.get(primaryKey) || new Map<string, Array<{ start:string; end:string }>>()
      const list = bucket.get(s.day) || []
      list.push({ start: s.start, end: s.end })
      bucket.set(s.day, list)
      dayBuckets.set(primaryKey, bucket)
    }
    for(const agent of agents){
      const idKey = agent.id ? String(agent.id) : undefined
      const nmKey = nameKey(fullName(agent))
      const bucket = (idKey && dayBuckets.get(idKey)) || (nmKey && dayBuckets.get(nmKey))
      const parts: string[] = []
      if(bucket){
        for(const day of WEEK_ORDER){
          const entries = bucket.get(day) || []
          if(entries.length===0) continue
          entries.sort((a,b)=> toMin(a.start) - toMin(b.start))
          const spans = entries.map(({ start, end })=>{
            const endLabel = end === '24:00'
              ? (timeFormat === '24h' ? '24:00' : '12:00 AM')
              : formatTimeString(end)
            return `${formatTimeString(start)}–${endLabel}`
          })
          parts.push(`${day} ${spans.join(', ')}`)
        }
      }
      const tooltip = parts.join('\n')
      if(idKey) map.set(idKey, tooltip)
      if(nmKey) map.set(nmKey, tooltip)
    }
    return map
  }, [agents, agentById, agentByNameLower, formatTimeString, tzShifts])
  const [collapsedCalendars, setCollapsedCalendars] = React.useState<Record<string, boolean>>({})
  const isCalendarCollapsed = React.useCallback((key: string)=> collapsedCalendars[key] ?? false, [collapsedCalendars])
  const toggleCalendar = React.useCallback((key: string)=>{
    setCollapsedCalendars(prev=> ({ ...prev, [key]: !prev[key] }))
  }, [])
  const tooltipFor = (agent?: AgentRow)=>{
    if(!agent) return undefined
    const idKey = agent.id ? String(agent.id) : undefined
    const nmKey = nameKey(fullName(agent))
    const value = (idKey && scheduleByAgent.get(idKey)) || (nmKey && scheduleByAgent.get(nmKey))
    return value && value.trim().length>0 ? value : 'No scheduled shifts this week'
  }
  const tagBase = 'inline-flex items-center gap-2 px-2 py-1 rounded border text-sm'
  const tagIdle = dark? 'border-neutral-700 bg-neutral-900 text-neutral-100' : 'border-neutral-300 bg-white text-neutral-900'
  const isValidCohort = (value: string): value is MeetingCohort => MEETING_COHORTS.includes(value as MeetingCohort)
  const meetingFor = React.useCallback((a?: AgentRow): MeetingCohort | '' => {
    const raw = (a as any)?.meetingCohort
    if(typeof raw === 'string'){
      const trimmed = raw.trim()
      return isValidCohort(trimmed) ? trimmed as MeetingCohort : ''
    }
    return ''
  }, [])
  const cohortBuckets = React.useMemo(()=>{
    const assigned = new Map<MeetingCohort, AgentRow[]>(MEETING_COHORTS.map(label=> [label, [] as AgentRow[]]))
    const unassigned: AgentRow[] = []
    for(const agent of visibleAgents){
      const cohort = meetingFor(agent)
      if(cohort && assigned.has(cohort)){
        assigned.get(cohort)!.push(agent)
      } else {
        unassigned.push(agent)
      }
    }
    for(const list of assigned.values()){
      list.sort((a,b)=> fullName(a).localeCompare(fullName(b)))
    }
    unassigned.sort((a,b)=> fullName(a).localeCompare(fullName(b)))
    return { assigned, unassigned }
  }, [visibleAgents, meetingFor])

  return (
    <section className={["rounded-2xl p-3", dark?"bg-neutral-900":"bg-white shadow-sm"].join(' ')}>
      <AccordionSection title="Teams" dark={dark} className="mb-3">
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
                    <div className="flex items-center gap-2 mb-2" title={tooltipFor(s)}>
                      <div className={["font-medium", supMuted ? (dark?"text-neutral-400":"text-neutral-500") : (dark?"text-neutral-100":"text-neutral-900")].join(' ')}>{fullName(s) || s.id}</div>
                      <span className={["text-xs px-1.5 py-0.5 rounded border", dark?"border-neutral-700 text-neutral-300":"border-neutral-300 text-neutral-600"].join(' ')}>{kids.length}</span>
                    </div>
                    {kids.length>0 ? (
                      <ul className="space-y-1">
                        {kids.map(a=> {
                          const nameCls = [a.hidden ? (dark?"text-neutral-400":"text-neutral-500") : ''].filter(Boolean).join(' ')
                          return (
                            <li
                              key={a.id || fullName(a)}
                              className={["px-2 py-1 rounded border text-sm", dark?"border-neutral-700 text-neutral-200":"border-neutral-300 text-neutral-800"].join(' ')}
                              title={tooltipFor(a)}
                            >
                              <span className={["truncate", nameCls].filter(Boolean).join(' ')}>{fullName(a) || a.id}</span>
                            </li>
                          )
                        })}
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
                  {unassigned.slice().sort((a,b)=> fullName(a).localeCompare(fullName(b))).map(a=>{
                    const nameCls = [a.hidden ? (dark?"text-neutral-400":"text-neutral-500") : ''].filter(Boolean).join(' ')
                    return (
                      <li
                        key={a.id || fullName(a)}
                        className={["px-2 py-1 rounded border text-sm", dark?"border-neutral-700 text-neutral-200":"border-neutral-300 text-neutral-800"].join(' ')}
                        title={tooltipFor(a)}
                      >
                        <span className={["truncate", nameCls].filter(Boolean).join(' ')}>{fullName(a) || a.id}</span>
                      </li>
                    )
                  })}
                </ul>
              </div>
            )}
          </div>
        </div>
      </AccordionSection>

      <AccordionSection title="Weekly meetings" dark={dark} className="mb-4">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
          {MEETING_COHORTS.map(label=>{
            const attendees = cohortBuckets.assigned.get(label) || []
            return (
              <div key={label} className={["rounded-xl p-2 border", dark?"border-neutral-800":"border-neutral-200"].join(' ')}>
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium">{label}</span>
                  <span className={["text-xs px-1.5 py-0.5 rounded border", dark?"border-neutral-700 text-neutral-300":"border-neutral-300 text-neutral-600"].join(' ')}>{attendees.length}</span>
                </div>
                {attendees.length>0 ? (
                  <ul className="space-y-1">
                    {attendees.map(agent=>{
                      const nm = fullName(agent) || agent.id
                      const nameCls = [agent.hidden ? (dark?"text-neutral-400":"text-neutral-500") : ''].filter(Boolean).join(' ')
                      return (
                        <li key={agent.id || nm} className={["px-2 py-1 rounded border text-sm", dark?"border-neutral-700 text-neutral-200":"border-neutral-300 text-neutral-800"].join(' ')}>
                          <span className={["truncate", nameCls].filter(Boolean).join(' ')}>{nm}</span>
                        </li>
                      )
                    })}
                  </ul>
                ) : (
                  <div className={["text-sm", dark?"text-neutral-400":"text-neutral-500"].join(' ')}>No attendees yet</div>
                )}
              </div>
            )
          })}
          {cohortBuckets.unassigned.length>0 && (
            <div className={["rounded-xl p-2 border", dark?"border-neutral-800":"border-neutral-200"].join(' ')}>
              <div className="flex items-center justify-between mb-2">
                <span className="font-medium">Unassigned</span>
                <span className={["text-xs px-1.5 py-0.5 rounded border", dark?"border-neutral-700 text-neutral-300":"border-neutral-300 text-neutral-600"].join(' ')}>{cohortBuckets.unassigned.length}</span>
              </div>
              <ul className="space-y-1">
                {cohortBuckets.unassigned.map(agent=>{
                  const nm = fullName(agent) || agent.id
                  const nameCls = [agent.hidden ? (dark?"text-neutral-400":"text-neutral-500") : ''].filter(Boolean).join(' ')
                  return (
                    <li key={agent.id || nm} className={["px-2 py-1 rounded border text-sm", dark?"border-neutral-700 text-neutral-200":"border-neutral-300 text-neutral-800"].join(' ')}>
                      <span className={["truncate", nameCls].filter(Boolean).join(' ')}>{nm}</span>
                    </li>
                  )
                })}
              </ul>
            </div>
          )}
        </div>
      </AccordionSection>

      <AccordionSection title="Calendars" dark={dark} className="mt-4">
        <WeeklyPTOCalendar
          dark={dark}
          weekStart={weekStart}
          pto={pto}
          agents={agents}
          collapsible={{ collapsed: isCalendarCollapsed('pto'), onToggle: ()=> toggleCalendar('pto') }}
        />
        <WeeklyOverridesCalendar
          dark={dark}
          weekStart={weekStart}
          overrides={(overrides||[]) as any}
          agents={agents}
          collapsible={{ collapsed: isCalendarCollapsed('overrides'), onToggle: ()=> toggleCalendar('overrides') }}
        />
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
              title={`Weekly ${t.name} calendar`}
              collapsible={{
                collapsed: isCalendarCollapsed(`task:${t.id}`),
                onToggle: ()=> toggleCalendar(`task:${t.id}`),
              }}
            />
          ))
        })()}
      </AccordionSection>
    </section>
  )
}
