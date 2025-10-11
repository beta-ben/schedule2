import React from 'react'

import { applyOverrides } from '../../lib/utils'
import type { Override, Shift } from '../../types'
import type { StageDoc } from '../../domain/stage'
import type { AgentRow, StageChangeEntry } from './types'
import { eqShift } from './shiftUtils'

export function describeShiftWindow(shift: Shift){
  const endDay = (shift as any).endDay
  const endLabel = endDay && endDay !== shift.day ? `${endDay} ${shift.end}` : shift.end
  return `${shift.day} ${shift.start} – ${endLabel}`
}

function formatStageTimestamp(iso?: string){
  if(!iso) return ''
  try{
    const dt = new Date(iso)
    if(Number.isNaN(dt.getTime())) return ''
    return dt.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
  }catch{
    return ''
  }
}

type UseStageChangesParams = {
  weekStart: string
  stageDoc: StageDoc | null
  stageWorkingShifts: Shift[]
  stageWorkingOverrides: Override[]
  localAgents: AgentRow[]
  liveShifts: Shift[]
  stageFilterAgents: Set<string> | null
  setStageFilterAgents: React.Dispatch<React.SetStateAction<Set<string> | null>>
  stageDirty: boolean
  stageLoading: boolean
  stageError: string | null
  stageEnabled: boolean
}

type UseStageChangesResult = {
  stageAgents: AgentRow[]
  stageEffectiveShifts: Shift[]
  stageChangedShiftIds: Set<string>
  stageChangeEntries: StageChangeEntry[]
  stageChangePersons: string[]
  stageFilteredEntries: StageChangeEntry[]
  stageChangeSummaryLines: string[]
  stagePanelEmptyMessage: string
  stageChangeCount: number
  filteredStageCount: number
  requiresRemovalAck: boolean
  hasLargeStageChange: boolean
  removalCount: number
  panelCountText: string
  stageBadgeText: string
  stageSubtitleText: string
  handleSelectAllStageAgents: () => void
  handleClearStageAgents: () => void
  handleToggleStageFilter: (person: string) => void
}

export function useStageChanges({
  weekStart,
  stageDoc,
  stageWorkingShifts,
  stageWorkingOverrides,
  localAgents,
  liveShifts,
  stageFilterAgents,
  setStageFilterAgents,
  stageDirty,
  stageLoading,
  stageError,
  stageEnabled,
}: UseStageChangesParams): UseStageChangesResult{
  const stageAgents = React.useMemo<AgentRow[]>(()=>{
    if(!stageEnabled){
      return localAgents
    }
    if(stageDoc?.agents && stageDoc.agents.length>0){
      return stageDoc.agents.map(a=> ({
        firstName: a.firstName,
        lastName: a.lastName,
        tzId: a.tzId,
        hidden: a.hidden,
        isSupervisor: a.isSupervisor,
        supervisorId: a.supervisorId ?? undefined,
        notes: a.notes,
        meetingCohort: (a.meetingCohort ?? null) as AgentRow['meetingCohort'],
      }))
    }
    return localAgents
  }, [stageEnabled, stageDoc?.agents, localAgents])

  const stageEffectiveShifts = React.useMemo(()=>{
    if(!stageEnabled){
      return stageWorkingShifts
    }
    try{
      return applyOverrides(stageWorkingShifts, stageWorkingOverrides, weekStart, stageAgents as any)
    }catch{
      return stageWorkingShifts
    }
  }, [stageEnabled, stageWorkingShifts, stageWorkingOverrides, weekStart, stageAgents])

  const stageChangedShiftIds = React.useMemo(()=>{
    if(!stageEnabled){
      return new Set<string>()
    }
    const liveMap = new Map(liveShifts.map(s=> [s.id, s]))
    const changed = new Set<string>()
    for(const s of stageWorkingShifts){
      if(!s || !s.id) continue
      const live = liveMap.get(s.id)
      if(!live || !eqShift(live, s)){
        changed.add(s.id)
      }
    }
    return changed
  }, [stageEnabled, stageWorkingShifts, liveShifts])

  const stageChangeEntries = React.useMemo<StageChangeEntry[]>(()=>{
    if(!stageEnabled){
      return []
    }
    const liveMap = new Map(liveShifts.map(s=> [s.id, s]))
    const stageMap = new Map(stageWorkingShifts.map(s=> [s.id, s]))
    const entries: StageChangeEntry[] = []
    stageWorkingShifts.forEach((s, idx)=>{
      const key = s.id || `added-${s.person||'unknown'}-${s.day}-${idx}`
      const live = s.id ? liveMap.get(s.id) : undefined
      const person = (s.person || live?.person || 'Unassigned').trim() || 'Unassigned'
      if(!live){
        entries.push({ id: key, type: 'added', person, stage: s })
      }else if(!eqShift(live, s)){
        entries.push({ id: key, type: 'updated', person, stage: s, live })
      }
    })
    liveShifts.forEach((live, idx)=>{
      if(!live?.id) return
      if(!stageMap.has(live.id)){
        const person = (live.person || 'Unassigned').trim() || 'Unassigned'
        entries.push({ id: `removed-${live.id}-${idx}`, type: 'removed', person, live })
      }
    })
    entries.sort((a,b)=>{
      const personCmp = a.person.localeCompare(b.person, undefined, { sensitivity: 'base' })
      if(personCmp!==0) return personCmp
      const stageDay = (a.stage || a.live)?.day || ''
      const otherDay = (b.stage || b.live)?.day || ''
      if(stageDay!==otherDay) return stageDay.localeCompare(otherDay)
      const stageStart = (a.stage || a.live)?.start || ''
      const otherStart = (b.stage || b.live)?.start || ''
      if(stageStart!==otherStart) return stageStart.localeCompare(otherStart)
      return a.id.localeCompare(b.id)
    })
    return entries
  }, [stageEnabled, stageWorkingShifts, liveShifts])

  const stageChangePersons = React.useMemo(()=> {
    if(!stageEnabled){
      return []
    }
    const set = new Set<string>()
    for(const entry of stageChangeEntries){ set.add(entry.person) }
    return Array.from(set).sort((a,b)=> a.localeCompare(b, undefined, { sensitivity: 'base' }))
  }, [stageEnabled, stageChangeEntries])

  const stageFilteredEntries = React.useMemo(()=>{
    if(!stageEnabled){
      return []
    }
    if(!stageFilterAgents || stageFilterAgents.size===0) return stageChangeEntries
    return stageChangeEntries.filter(entry=> stageFilterAgents.has(entry.person))
  }, [stageEnabled, stageChangeEntries, stageFilterAgents])

  const stagePanelEmptyMessage = React.useMemo(()=>{
    if(!stageEnabled){
      return 'Staging disabled.'
    }
    if(stageFilteredEntries.length!==0) return ''
    return stageChangeEntries.length===0 ? 'No changes — staging already matches live.' : 'No matching changes for selected filters.'
  }, [stageEnabled, stageFilteredEntries, stageChangeEntries])

  const stageChangeCount = stageChangeEntries.length
  const filteredStageCount = stageFilteredEntries.length

  const requiresRemovalAck = React.useMemo(()=> stageChangeEntries.some(entry=> entry.type==='removed'), [stageChangeEntries])
  const hasLargeStageChange = React.useMemo(()=> stageChangeEntries.length > 10, [stageChangeEntries])
  const removalCount = React.useMemo(()=> stageChangeEntries.filter(entry=> entry.type==='removed').length, [stageChangeEntries])

  const summarizeStageEntries = React.useCallback((entries: StageChangeEntry[], emptyMessage?: string)=>{
    if(entries.length===0) return emptyMessage ? [emptyMessage] : []
    return entries.map(entry=>{
      const stageWindow = entry.stage ? describeShiftWindow(entry.stage) : '—'
      const liveWindow = entry.live ? describeShiftWindow(entry.live) : '—'
      if(entry.type==='added') return `Added • ${entry.person} • ${stageWindow}`
      if(entry.type==='removed') return `Removed • ${entry.person} • ${liveWindow}`
      return `Updated • ${entry.person} • ${liveWindow} → ${stageWindow}`
    })
  }, [])

  const stageChangeSummaryLines = React.useMemo(()=>{
    if(!stageEnabled){
      return ['Staging disabled.']
    }
    return summarizeStageEntries(stageChangeEntries, 'No changes — staging already matches live.')
  }, [stageEnabled, stageChangeEntries, summarizeStageEntries])

  const panelCountText = React.useMemo(()=>{
    if(stagePanelEmptyMessage){
      return stagePanelEmptyMessage
    }
    if(stageChangeCount===0) return 'No differences between staging and live shifts.'
    const suffix = `shift${filteredStageCount===1?'':'s'} modified`
    if(stageFilterAgents && stageFilterAgents.size>0){
      return `${filteredStageCount} of ${stageChangeCount} ${suffix}`
    }
    return `${filteredStageCount} ${suffix}`
  }, [stagePanelEmptyMessage, stageChangeCount, filteredStageCount, stageFilterAgents])

  const handleSelectAllStageAgents = React.useCallback(()=>{
    setStageFilterAgents(stageEnabled ? null : null)
  }, [setStageFilterAgents, stageEnabled])
  const handleClearStageAgents = React.useCallback(()=>{
    setStageFilterAgents(stageEnabled ? new Set<string>() : null)
  }, [setStageFilterAgents, stageEnabled])
  const handleToggleStageFilter = React.useCallback((person: string)=>{
    setStageFilterAgents(prev=>{
      if(!stageEnabled){
        return null
      }
      const allSet = new Set(stageChangePersons)
      if(prev === null){
        const next = new Set(allSet)
        next.delete(person)
        return next.size === allSet.size ? null : next
      }
      const next = new Set(prev)
      if(next.has(person)) next.delete(person); else next.add(person)
      if(next.size === 0) return new Set<string>()
      if(next.size === allSet.size) return null
      return next
    })
  }, [setStageFilterAgents, stageChangePersons, stageEnabled])

  React.useEffect(()=>{
    if(!stageEnabled){
      if(stageFilterAgents!=null){
        setStageFilterAgents(null)
      }
      return
    }
    if(stageFilterAgents && stageFilterAgents.size>0){
      const valid = new Set(stageChangePersons)
      const next = new Set<string>()
      stageFilterAgents.forEach(person=>{
        if(valid.has(person)) next.add(person)
      })
      if(next.size !== stageFilterAgents.size){
        setStageFilterAgents(next.size>0 ? next : null)
      }
    }
  }, [stageEnabled, stageFilterAgents, stageChangePersons, setStageFilterAgents])

  const stageBadgeText = React.useMemo(()=>{
    if(!stageEnabled) return 'Stage disabled'
    if(stageLoading) return 'Loading stage…'
    if(stageError) return 'Stage error'
    if(stageDirty) return 'Stage draft'
    return stageDoc ? 'Stage ready' : 'Stage empty'
  }, [stageEnabled, stageLoading, stageError, stageDoc, stageDirty])

  const stageSubtitleText = React.useMemo(()=>{
    if(!stageEnabled) return 'Enable staging to preview upcoming changes'
    if(stageLoading) return 'Loading staging data…'
    if(stageError) return 'Stage unavailable'
    if(stageDirty) return 'Unsaved staging changes'
    if(stageDoc){
      const formatted = formatStageTimestamp(stageDoc.updatedAt)
      return formatted ? `Updated ${formatted}` : 'Stage snapshot loaded'
    }
    return 'No stage snapshot yet'
  }, [stageEnabled, stageLoading, stageError, stageDoc, stageDirty])

  return {
    stageAgents,
    stageEffectiveShifts,
    stageChangedShiftIds,
    stageChangeEntries,
    stageChangePersons,
    stageFilteredEntries,
    stageChangeSummaryLines,
    stagePanelEmptyMessage,
    stageChangeCount,
    filteredStageCount,
    requiresRemovalAck,
    hasLargeStageChange,
    removalCount,
    panelCountText,
    stageBadgeText,
    stageSubtitleText,
    handleSelectAllStageAgents,
    handleClearStageAgents,
    handleToggleStageFilter,
  }
}
