import React from 'react'
import { addDays, fmtYMD, parseYMD } from '../lib/utils'
import type { PTO, Task } from '../types'
import type { CalendarSegment } from '../lib/utils'
import { DAYS } from '../constants'

type AgentRow = { id?: string; firstName?: string; lastName?: string; tzId?: string; hidden?: boolean; isSupervisor?: boolean; supervisorId?: string|null }

export default function TeamsPage({
  dark,
  weekStart,
  agents,
  pto,
  tasks,
  calendarSegs,
}:{
  dark: boolean
  weekStart: string
  agents: AgentRow[]
  pto: PTO[]
  tasks: Task[]
  calendarSegs: CalendarSegment[]
}){
  const fullName = (a?: AgentRow)=> `${a?.firstName||''} ${a?.lastName||''}`.trim()
  const nameKey = (s?: string)=> (s||'').trim().toLowerCase()
  const visibleAgents = React.useMemo(()=> (agents||[]).filter(a=> !a.hidden), [agents])
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
    for(const a of visibleAgents){
      const sidRaw = a.supervisorId || ''
      if(!sidRaw) continue
      const alias = supKeys.get(sidRaw) || supKeys.get(nameKey(sidRaw))
      if(alias && m.has(alias)) m.get(alias)!.push(a)
    }
    return m
  }, [visibleAgents, supList, supKeys])
  const unassigned = React.useMemo(()=> visibleAgents.filter(a=>{
    if(a.isSupervisor) return false
    const sidRaw = a.supervisorId || ''
    if(!sidRaw) return true
    const alias = supKeys.get(sidRaw) || supKeys.get(nameKey(sidRaw))
    // Unassigned if no matching visible supervisor bucket
    return !alias || !bySup.has(alias)
  }), [visibleAgents, supKeys, bySup])
  const weekStartDate = parseYMD(weekStart)
  const weekDays = React.useMemo(()=> Array.from({length:7},(_,i)=>{
    const d = addDays(weekStartDate, i)
    return { idx: i, key: DAYS[i], ymd: fmtYMD(d), date: d }
  }), [weekStartDate])
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
  // PTO counts per day (unique agents on PTO)
  const ptoCounts = React.useMemo(()=>{
    const counts = new Array<number>(7).fill(0)
    for(const [i,wd] of weekDays.entries()){
      const seen = new Set<string>()
      for(const p of (pto||[])){
        const inRange = (p.startDate<=wd.ymd && wd.ymd<=p.endDate)
        if(!inRange) continue
        // Resolve to agent to respect hidden flag
        const agent = (p as any).agentId ? agentById.get((p as any).agentId) : agentByNameLower.get((p.person||'').toLowerCase())
        if(agent && agent.hidden) continue
        const key = (agent?.id || p.person || String(p.id)) as string
        if(!seen.has(key)){ counts[i]++; seen.add(key) }
      }
    }
    return counts
  }, [pto, weekDays, agentById, agentByNameLower])
  // Task assignment counts per day (unique agents per task per day)
  const taskRows = React.useMemo(()=>{
    const activeTasks = (tasks||[]).filter(t=> !t.archived)
    return activeTasks.map(t=>{
      const counts = new Array<number>(7).fill(0)
      for(const [i,wd] of weekDays.entries()){
        const dayKey = DAYS[i]
        const seen = new Set<string>()
        for(const cs of (calendarSegs||[])){
          if(cs.taskId !== t.id) continue
          const hits = (cs.day===dayKey) || (!!cs.endDay && cs.endDay===dayKey)
          if(!hits) continue
          const agent = (cs as any).agentId ? agentById.get((cs as any).agentId) : agentByNameLower.get((cs.person||'').toLowerCase())
          if(agent && agent.hidden) continue
          const key = (agent?.id || cs.person || `${cs.taskId}-${cs.day}-${cs.start}-${cs.end}`) as string
          if(!seen.has(key)){ counts[i]++; seen.add(key) }
        }
      }
      return { task: t, counts }
    })
  }, [tasks, calendarSegs, weekDays, agentById, agentByNameLower])

  const headerCellCls = (dark? 'text-neutral-400' : 'text-neutral-500')
  const cellBase = 'text-sm px-2 py-1.5 text-center rounded border'
  const cellIdle = dark? 'border-neutral-800 bg-neutral-900 text-neutral-200' : 'border-neutral-200 bg-white text-neutral-800'
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
                .filter(s=> !s.hidden || ((bySup.get((s.id && String(s.id)) || nameKey(fullName(s)))||[]).length>0))
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
        {/* Header row with week day labels */}
        <div className="overflow-x-auto">
          <div className="min-w-[640px]">
            <div className="grid" style={{ gridTemplateColumns: `180px repeat(7, minmax(0, 1fr))` }}>
              <div></div>
              {weekDays.map(({key, date})=> (
                <div key={key} className={["px-2 py-1 text-xs font-medium text-center", headerCellCls].join(' ')}>
                  {key} {date.toLocaleDateString(undefined,{ month:'numeric', day:'numeric' })}
                </div>
              ))}
            </div>
            {/* PTO row */}
            <div className="grid items-center" style={{ gridTemplateColumns: `180px repeat(7, minmax(0, 1fr))` }}>
              <div className="px-2 py-1.5">
                <span className={[tagBase, tagIdle].join(' ')}>
                  <span className="inline-block w-2 h-2 rounded-full bg-rose-500" aria-hidden></span>
                  <span>PTO</span>
                </span>
              </div>
              {ptoCounts.map((v, i)=> (
                <div key={i} className={[cellBase, cellIdle].join(' ')} title={`${v} on PTO`}>{v}</div>
              ))}
            </div>
            {/* Posture rows */}
            {taskRows.map(row=> (
              <div key={row.task.id} className="grid items-center" style={{ gridTemplateColumns: `180px repeat(7, minmax(0, 1fr))` }}>
                <div className="px-2 py-1.5">
                  <span className={[tagBase, tagIdle].join(' ')}>
                    <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: row.task.color || '#999' }} aria-hidden></span>
                    <span>{row.task.name}</span>
                  </span>
                </div>
                {row.counts.map((v,i)=> (
                  <div key={i} className={[cellBase, cellIdle].join(' ')} title={`${v} assigned`}>
                    {v}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
