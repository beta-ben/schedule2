import React from 'react'
import Toggle from '../components/Toggle'
// Legacy local password gate removed. Admin auth now uses dev proxy cookie+CSRF only.
import { cloudPostDetailed, ensureSiteSession, login, logout, getApiBase, getApiPrefix, isUsingDevProxy, hasCsrfToken, getCsrfDiagnostics, cloudPostAgents, getZoomAuthorizeUrl, getZoomConnections, deleteZoomConnection, stagePublish } from '../lib/api'
import type { ZoomConnectionSummary, StageSaveResult } from '../lib/api'
import WeekEditor from '../components/v2/WeekEditor'
import ComboBox from '../components/ComboBox'
import WeeklyPosturesCalendar from '../components/WeeklyPosturesCalendar'
import AllAgentsWeekRibbons from '../components/AllAgentsWeekRibbons'
import CoverageHeatmap from '../components/CoverageHeatmap'
import type { PTO, Shift, Task, Override } from '../types'
import type { StageDoc } from '../domain/stage'
import type { CalendarSegment } from '../lib/utils'
import TaskConfigPanel from '../components/TaskConfigPanel'
import { DAYS } from '../constants'
import { uid, toMin, shiftsForDayInTZ, agentIdByName, agentDisplayName, parseYMD, addDays, fmtYMD, fmtNice, minToHHMM, applyOverrides, startOfWeek } from '../lib/utils'
import { mapAgentsToPayloads } from '../lib/agents'
import ZoomAnalyticsMock from '../components/ZoomAnalyticsMock'
import TimeTrackingMock from '../components/TimeTrackingMock'
import LunchPlannerMock from '../components/LunchPlannerMock'
import TeamsCommandsMock from '../components/TeamsCommandsMock'
import MagicLoginPanel from './manageV2/MagicLoginPanel'
import { computeComplianceWarnings } from '../domain/compliance'
import { makeLocalStageStore } from '../lib/stage/localStageStore'
import { isStageDebugEnabled, stageDebugLog } from '../lib/stage/debug'
import useStageHook from '../hooks/useStage'
import type { AgentRow, StageChangeEntry } from './manageV2/types'
import { useStageChanges, describeShiftWindow } from './manageV2/useStageChanges'
import { eqShift, eqShifts } from './manageV2/shiftUtils'
type OverrideCalendarDayEntry = { override: Override; occurrenceStart: string; occurrenceEnd: string }

const DEFAULT_POSTURE_DURATION_MIN = 3 * 60
const STAGE_MODE_STORAGE_KEY = 'schedule2.v2.scheduleMode'
const WEEK_START_MODE_KEY = 'schedule2.v2.weekStartMode'
const STAGE_FEATURE_ENABLED_BY_ENV = (()=> {
  const raw = (import.meta.env as any)?.VITE_STAGE_FLOW
  if(typeof raw === 'string'){
    const normalized = raw.trim().toLowerCase()
    return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'stage' || normalized === 'on'
  }
  if(typeof raw === 'number'){ return raw === 1 }
  if(typeof raw === 'boolean'){ return raw }
  return false
})()

function summarizeShift(s: Shift){
  const endDay = (s as any).endDay
  const endLabel = endDay && endDay !== s.day ? `${endDay} ${s.end}` : s.end
  return `${s.person || 'Unassigned'} • ${s.day} ${s.start} → ${endLabel}`
}

function diffShifts(before: Shift[], after: Shift[]){
  const beforeMap = new Map(before.map(s=> [s.id, s]))
  const afterMap = new Map(after.map(s=> [s.id, s]))
  const changed: Array<{ id:string; before: string; after: string }> = []
  const removed: Array<{ id:string; before: string }> = []
  const added: Array<{ id:string; after: string }> = []
  for(const [id, prev] of beforeMap){
    const next = afterMap.get(id)
    if(!next){
      removed.push({ id, before: summarizeShift(prev) })
      continue
    }
    if(!eqShift(prev, next)){
      changed.push({ id, before: summarizeShift(prev), after: summarizeShift(next) })
    }
  }
  for(const [id, next] of afterMap){
    if(!beforeMap.has(id)){
      added.push({ id, after: summarizeShift(next) })
    }
  }
  return { changed, removed, added }
}

function cloneShiftForStage(shift: Shift): Shift{
  const copy = { ...shift } as Shift
  const endDay = (shift as any).endDay
  if(endDay) (copy as any).endDay = endDay
  return copy
}

function briefShiftLabel(shift: Shift){
  const endDay = (shift as any).endDay
  const endLabel = endDay && endDay !== shift.day ? `${endDay} ${shift.end}` : shift.end
  return `${shift.day} ${shift.start}-${endLabel}`
}

function recordStageDebug(event: { tag: string; payload?: unknown; response?: unknown; diff?: ReturnType<typeof diffShifts> }){
  if(typeof window === 'undefined') return
  try{
    const store = (window as any).__stageDebug ?? ((window as any).__stageDebug = {})
    if(event.diff) store.lastDiff = event.diff
    if(event.payload) store.lastPayload = event.payload
    if(event.response) store.lastResponse = event.response
    store.lastTag = event.tag
    store.lastUpdatedAt = new Date().toISOString()
  }catch{}
}

function logStageMutation(tag: string, before: Shift[], after: Shift[]){
  const diff = diffShifts(before || [], after || [])
  stageDebugLog('page:stage_mutation', {
    tag,
    changed: diff.changed.length,
    added: diff.added.length,
    removed: diff.removed.length,
    sampleChanged: diff.changed.slice(0, 3),
    sampleAdded: diff.added.slice(0, 3),
    sampleRemoved: diff.removed.slice(0, 3)
  })
  if(diff.changed.length || diff.added.length || diff.removed.length){
    recordStageDebug({ tag: `mutate:${tag}`, diff })
    console.debug('[stage] mutate', tag, diff)
  }else{
    recordStageDebug({ tag: `mutate:${tag}`, diff })
    console.debug('[stage] mutate', tag, { none: true })
  }
}

function computeDefaultPostureEnd(day: typeof DAYS[number], start: string){
  const startIdxRaw = DAYS.indexOf(day as any)
  const startIdx = startIdxRaw >= 0 ? startIdxRaw : 0
  const startMin = toMin(start || '00:00')
  const total = startMin + DEFAULT_POSTURE_DURATION_MIN
  const dayOffset = Math.floor(total / 1440)
  const endDayIdx = (startIdx + dayOffset + DAYS.length) % DAYS.length
  const endDay = DAYS[endDayIdx] as typeof DAYS[number]
  const endTime = minToHHMM(total)
  return { endDay, endTime }
}

export default function ManageV2Page({ dark, agents, onAddAgent, onUpdateAgent, onDeleteAgent, weekStart, setWeekStart, tz, shifts, pto, overrides, tasks, calendarSegs, onUpdateShift, onDeleteShift, onAddShift, setTasks, setShifts, setCalendarSegs, setPto, setOverrides }:{ dark:boolean; agents: AgentRow[]; onAddAgent?: (a:{ firstName:string; lastName:string; tzId:string })=>void; onUpdateAgent?: (index:number, a:AgentRow)=>void; onDeleteAgent?: (index:number)=>void; weekStart: string; setWeekStart?: (v:string)=>void; tz:{ id:string; label:string; offset:number }; shifts: Shift[]; pto: PTO[]; overrides: Override[]; tasks: Task[]; calendarSegs: CalendarSegment[]; onUpdateShift?: (id:string, patch: Partial<Shift>)=>void; onDeleteShift?: (id:string)=>void; onAddShift?: (s: Shift)=>void; setTasks: (f:(prev:Task[])=>Task[])=>void; setShifts: (f:(prev:Shift[])=>Shift[])=>void; setCalendarSegs: (f:(prev:CalendarSegment[])=>CalendarSegment[])=>void; setPto: (f:(prev:PTO[])=>PTO[])=>void; setOverrides: (f:(prev:Override[])=>Override[])=>void }){
  // Admin auth gate: unlocked if CSRF cookie exists (dev proxy or prod API)
  const [unlocked, setUnlocked] = React.useState(false)
  const [pwInput, setPwInput] = React.useState('')
  const [msg, setMsg] = React.useState('')
  // Lightweight toast state for publish notifications
  const toastTimerRef = React.useRef<number | null>(null)
  const [toast, setToast] = React.useState<null | { text: string; kind: 'success'|'error' }>(null)
  const showToast = React.useCallback((text: string, kind: 'success'|'error'='success')=>{
    setToast({ text, kind })
    if(toastTimerRef.current!=null){
      window.clearTimeout(toastTimerRef.current)
      toastTimerRef.current = null
    }
    toastTimerRef.current = window.setTimeout(()=> setToast(null), 3000)
  }, [])
  React.useEffect(()=>{
    if(hasCsrfToken()){ setUnlocked(true); setMsg('') }
  },[])
  const apiBase = React.useMemo(()=> getApiBase(), [])
  const apiPrefix = React.useMemo(()=> getApiPrefix(), [])
  const usingDevProxy = React.useMemo(()=> isUsingDevProxy(), [])
  const [localAgents, setLocalAgents] = React.useState<AgentRow[]>(agents)
  React.useEffect(()=>{ setLocalAgents(agents) }, [agents])
  const tabs = ['Schedule Editor','Agents','Postures','PTO & Overrides','Integrations','Clock & Breaks'] as const
  type Subtab = typeof tabs[number]
  const wipTabs: ReadonlyArray<Subtab> = ['Integrations', 'Clock & Breaks']
  const [subtab, setSubtab] = React.useState<Subtab>('Agents')
  const [zoomConnections, setZoomConnections] = React.useState<ZoomConnectionSummary[]>([])
  const [zoomLoading, setZoomLoading] = React.useState(false)
  const [zoomError, setZoomError] = React.useState<string | null>(null)
  const zoomInitializedRef = React.useRef(false)
  // Schedule Editor tab: show time labels for all shifts
const [showAllTimeLabels, setShowAllTimeLabels] = React.useState(false)
  const [showScheduleAdjustments, setShowScheduleAdjustments] = React.useState(false)
  const [weekStartMode, setWeekStartMode] = React.useState<'sun'|'mon'>(()=>{
    try{
      const stored = localStorage.getItem(WEEK_START_MODE_KEY)
      if(stored === 'mon' || stored === 'sun') return stored
    }catch{}
    try{
      const day = parseYMD(weekStart).getDay()
      if(day === 1) return 'mon'
    }catch{}
    return 'sun'
  })
  // Schedule Editor tab: staging infra toggle + mode selection
  const stageFeatureEnabled = React.useMemo(()=> STAGE_FEATURE_ENABLED_BY_ENV, [])
  const [scheduleMode, setScheduleMode] = React.useState<'live'|'stage'>(()=>{
    if(!stageFeatureEnabled) return 'live'
    if(typeof window === 'undefined') return 'live'
    try{
      const stored = localStorage.getItem(STAGE_MODE_STORAGE_KEY)
      return stored === 'stage' ? 'stage' : 'live'
    }catch{
      return 'live'
    }
  })
  React.useEffect(()=>{
    if((!stageFeatureEnabled || !unlocked) && scheduleMode === 'stage'){
      setScheduleMode('live')
    }
  }, [stageFeatureEnabled, unlocked, scheduleMode])
  React.useEffect(()=>{
    if(!stageFeatureEnabled) return
    try{ localStorage.setItem(STAGE_MODE_STORAGE_KEY, scheduleMode) }catch{}
  }, [scheduleMode, stageFeatureEnabled])
  const hasStageInfra = stageFeatureEnabled && unlocked
  const isStageMode = hasStageInfra && scheduleMode === 'stage'
  const stageDebugActive = hasStageInfra && isStageDebugEnabled()
  const {
    loading: stageLoadingRaw,
    error: stageErrorRaw,
    stage: stageDocRaw,
    save: saveStageDocHook,
    reload: reloadStageDocHook
  } = useStageHook({ weekStart, tzId: tz.id, enabled: hasStageInfra })
  const fallbackSaveStageDoc = React.useCallback(async (_doc: StageDoc, _opts?: { ifMatch?: string }): Promise<StageSaveResult>=> ({ ok:false, unsupported:true }), [])
  const fallbackReloadStageDoc = React.useCallback(async ()=>({ ok:false, unsupported:true }), [])
  const stageDoc: StageDoc | null = hasStageInfra ? (stageDocRaw ?? null) : null
  const stageLoading = hasStageInfra ? stageLoadingRaw : false
  const stageError: string | null = hasStageInfra ? stageErrorRaw : null
  const saveStageDoc = hasStageInfra ? saveStageDocHook : fallbackSaveStageDoc
  const reloadStageDoc = hasStageInfra ? reloadStageDocHook : fallbackReloadStageDoc
  const [sortMode, setSortMode] = React.useState<'start'|'name'>('start')
  // Schedule Editor tab: option to include hidden agents (default off, persisted)
  const INCLUDE_HIDDEN_KEY = React.useMemo(()=> `schedule2.v2.shifts.includeHidden.${weekStart}.${tz.id}`, [weekStart, tz.id])
  const [includeHiddenAgents, setIncludeHiddenAgents] = React.useState<boolean>(()=>{
    try{ const v = localStorage.getItem(INCLUDE_HIDDEN_KEY); return v ? v==='1' : false }catch{ return false }
  })
  React.useEffect(()=>{
    if(isStageMode && !includeHiddenAgents){
      setIncludeHiddenAgents(true)
    }
  }, [isStageMode, includeHiddenAgents])
  React.useEffect(()=>{ try{ localStorage.setItem(INCLUDE_HIDDEN_KEY, includeHiddenAgents ? '1':'0') }catch{} }, [includeHiddenAgents, INCLUDE_HIDDEN_KEY])
  React.useEffect(()=>{
    try{
      const day = parseYMD(weekStart).getDay()
      if(day === 1 && weekStartMode !== 'mon'){
        setWeekStartMode('mon')
        try{ localStorage.setItem(WEEK_START_MODE_KEY, 'mon') }catch{}
      }else if(day === 0 && weekStartMode !== 'sun'){
        setWeekStartMode('sun')
        try{ localStorage.setItem(WEEK_START_MODE_KEY, 'sun') }catch{}
      }
    }catch{}
  }, [weekStart, weekStartMode])
  // Schedule Editor tab: number of visible days (1-7)
  const DAYS_VISIBLE_KEY = React.useMemo(()=> `schedule2.v2.shifts.daysVisible.${weekStart}.${tz.id}`, [weekStart, tz.id])
  const [visibleDays, setVisibleDays] = React.useState<number>(()=>{
    try{ const v = localStorage.getItem(DAYS_VISIBLE_KEY); const n = v? parseInt(v,10): 7; return Number.isFinite(n) && n>=1 && n<=7 ? n : 7 }catch{ return 7 }
  })
  React.useEffect(()=>{ try{ localStorage.setItem(DAYS_VISIBLE_KEY, String(visibleDays)) }catch{} }, [visibleDays, DAYS_VISIBLE_KEY])
  // Schedule Editor tab: scrollable chunk index when visibleDays < 7
  const [dayChunkIdx, setDayChunkIdx] = React.useState(0)
  React.useEffect(()=>{ setDayChunkIdx(0) }, [visibleDays, weekStart])
  // Schedule Editor tab: working copy (draft) of shifts
  const [workingShifts, setWorkingShifts] = React.useState<Shift[]>(shifts)
  // PTO tab: working copy (draft) of PTO entries
  const [workingPto, setWorkingPto] = React.useState<PTO[]>(pto)
  const [workingOverrides, setWorkingOverrides] = React.useState<Override[]>(overrides)
  const [isDirty, setIsDirty] = React.useState(false)
  // Compliance warnings (Schedule Editor tab)
  const [showCompliance, setShowCompliance] = React.useState<boolean>(false)
  const [complianceIssues, setComplianceIssues] = React.useState<Array<{ rule:string; severity:'hard'|'soft'; person:string; day?:string; shiftId?:string; details?:string }>>([])
  const complianceHighlightIds = React.useMemo(()=>{
    const set = new Set<string>()
    for(const i of complianceIssues){ if(i.shiftId) set.add(i.shiftId) }
    return set
  }, [complianceIssues])
  const [manualPublishPending, setManualPublishPending] = React.useState(false)
  const [stageWorkingShifts, setStageWorkingShifts] = React.useState<Shift[]>(stageDoc?.shifts ?? shifts)
  const [stageWorkingPto, setStageWorkingPto] = React.useState<PTO[]>(stageDoc?.pto ?? pto)
  const [stageWorkingOverrides, setStageWorkingOverrides] = React.useState<Override[]>(stageDoc?.overrides ?? overrides)
  const [stageWorkingCalendarSegs, setStageWorkingCalendarSegs] = React.useState<CalendarSegment[]>(stageDoc?.calendarSegs ?? calendarSegs)
  const updateStageShifts = React.useCallback((tag: string, factory: (prev: Shift[])=>Shift[])=>{
    setStageWorkingShifts(prev=>{
      const next = factory(prev)
      if(next === prev){
        stageDebugLog('page:stage_mutation', { tag, unchangedRef: true })
        console.debug('[stage] mutate', tag, { unchangedRef: true })
        return prev
      }
      logStageMutation(tag, prev, next)
      return next
    })
  }, [])
  const prevStageWorkingShiftsRef = React.useRef(stageWorkingShifts)
  React.useEffect(()=>{
    const prev = prevStageWorkingShiftsRef.current
    const next = stageWorkingShifts
    if(prev !== next){
      const diff = diffShifts(prev || [], next || [])
      stageDebugLog('page:stage_mutation_effect', {
        changed: diff.changed.length,
        added: diff.added.length,
        removed: diff.removed.length,
        sampleChanged: diff.changed.slice(0, 1),
        sampleAdded: diff.added.slice(0, 1),
        sampleRemoved: diff.removed.slice(0, 1)
      })
      if(diff.changed.length || diff.added.length || diff.removed.length){
        console.debug('[stage] mutate effect', diff)
      }else{
        console.debug('[stage] mutate effect none')
      }
    }
    prevStageWorkingShiftsRef.current = next
  }, [stageWorkingShifts])
  const [stageShiftUndoStack, setStageShiftUndoStack] = React.useState<Array<Array<{ id:string; patch: Partial<Shift> }>>>([])
  const [stageShiftRedoStack, setStageShiftRedoStack] = React.useState<Array<Array<{ id:string; patch: Partial<Shift> }>>>([])
  const [stageDirty, setStageDirty] = React.useState(false)
  const [showStageChangesPanel, setShowStageChangesPanel] = React.useState(false)
  const [showStagePublishConfirm, setShowStagePublishConfirm] = React.useState(false)
  const [stagePublishBusy, setStagePublishBusy] = React.useState(false)
  const [stagePublishSummary, setStagePublishSummary] = React.useState<{ lines: string[]; copied?: boolean } | null>(null)
  const [stageFilterAgents, setStageFilterAgents] = React.useState<Set<string> | null>(null)
  const [stageRemovalAck, setStageRemovalAck] = React.useState(false)
  const stageAutoSaveTimerRef = React.useRef<number | null>(null)
  const stageSaveInFlightRef = React.useRef(false)
  const stageSaveQueuedRef = React.useRef(false)
  const stageInitializedRef = React.useRef(false)
  const stageAppliedAtRef = React.useRef<number>(Number.isFinite(Date.parse(stageDoc?.updatedAt || '')) ? Date.parse(stageDoc?.updatedAt || '') : 0)
  const localStageStore = React.useMemo(()=> makeLocalStageStore(), [])
  const stageStateSnapshotRef = React.useRef<{ shifts: number; pto: number; overrides: number; calendarSegs: number }>({ shifts: stageWorkingShifts.length, pto: stageWorkingPto.length, overrides: stageWorkingOverrides.length, calendarSegs: stageWorkingCalendarSegs.length })
  React.useEffect(()=>{
    stageInitializedRef.current = false
    stageAppliedAtRef.current = 0
  }, [weekStart, tz.id])
  React.useEffect(()=>{
    if(!stageDebugActive) return
    stageDebugLog('page:stage_debug:enabled', {
      weekStart,
      tzId: tz.id,
      stageDocPresent: !!stageDoc,
      stageDirty
    })
  }, [stageDebugActive, weekStart, tz.id, stageDoc, stageDirty])
  React.useEffect(()=>{
    if(!stageDebugActive) return
    const counts = {
      shifts: stageWorkingShifts.length,
      pto: stageWorkingPto.length,
      overrides: stageWorkingOverrides.length,
      calendarSegs: stageWorkingCalendarSegs.length
    }
    const prev = stageStateSnapshotRef.current
    const changed = Object.keys(counts).some(key=> (counts as any)[key] !== (prev as any)[key])
    if(changed || stageDirty){
      stageDebugLog('page:stage_state:update', { counts, stageDirty })
      stageStateSnapshotRef.current = counts
    }
  }, [stageDebugActive, stageWorkingShifts, stageWorkingPto, stageWorkingOverrides, stageWorkingCalendarSegs, stageDirty])
  React.useEffect(()=>{
    let cancelled = false
    stageDebugLog('page:hydrate:start', {
      stageDirty,
      hasStageDoc: !!stageDoc,
      weekStart,
      tzId: tz.id
    })
    if(stageDirty){
      stageDebugLog('page:hydrate:bail_dirty', { weekStart, tzId: tz.id })
      return
    }
    const hydrateFrom = async ()=>{
      if(stageDoc){
        if(cancelled) return
        const updatedAt = stageDoc.updatedAt || ''
        const currentTs = Date.parse(updatedAt)
        const prevTs = stageAppliedAtRef.current
        if(Number.isFinite(currentTs) && Number.isFinite(prevTs) && currentTs <= prevTs){
          const serverShifts = Array.isArray(stageDoc?.shifts) ? stageDoc.shifts.map(s=> ({ id: s.id, day: s.day, start: s.start, end: s.end, endDay: (s as any).endDay })) : []
          const workingShiftsSummary = stageWorkingShifts.map(s=> ({ id: s.id, day: s.day, start: s.start, end: s.end, endDay: (s as any).endDay }))
          console.debug('[stage] hydrate:skip-worker-stale', {
            when: new Date().toISOString(),
            updatedAt,
            previousMs: prevTs,
            serverShiftsSample: serverShifts.slice(0, 5),
            workingShiftsSample: workingShiftsSummary.slice(0, 5)
          })
          stageDebugLog('page:hydrate:skip_worker_stale', {
            updatedAt,
            previousMs: prevTs,
            serverShiftCount: serverShifts.length,
            workingShiftCount: workingShiftsSummary.length,
            serverShiftsSample: serverShifts.slice(0, 8),
            workingShiftsSample: workingShiftsSummary.slice(0, 8)
          })
          return
        }
        if(Number.isFinite(currentTs)) stageAppliedAtRef.current = currentTs
        else stageAppliedAtRef.current = Date.now()
        console.debug('[stage] hydrate:from-worker', { when: new Date().toISOString(), updatedAt, hasStage: true })
        stageDebugLog('page:hydrate:from_worker', {
          updatedAt,
          counts: {
            shifts: Array.isArray(stageDoc.shifts) ? stageDoc.shifts.length : 0,
            pto: Array.isArray(stageDoc.pto) ? stageDoc.pto.length : 0,
            overrides: Array.isArray(stageDoc.overrides) ? stageDoc.overrides.length : 0,
            calendarSegs: Array.isArray(stageDoc.calendarSegs) ? stageDoc.calendarSegs.length : 0
          }
        })
        updateStageShifts('hydrate:stageDoc', ()=> Array.isArray(stageDoc.shifts) ? stageDoc.shifts.map(s=> ({ ...s })) : [])
        setStageWorkingPto(stageDoc.pto ?? [])
        setStageWorkingOverrides(stageDoc.overrides ?? [])
        setStageWorkingCalendarSegs(stageDoc.calendarSegs ?? [])
        setStageShiftUndoStack([])
        setStageShiftRedoStack([])
        stageInitializedRef.current = true
        try{
          await localStageStore.save(stageDoc)
          stageDebugLog('page:hydrate:persist_local', { updatedAt: stageDoc.updatedAt ?? null })
        }catch(err){
          stageDebugLog('page:hydrate:persist_local_error', { message: err instanceof Error ? err.message : String(err) }, 'warn')
        }
        return
      }
      if(stageInitializedRef.current){
        console.debug('[stage] hydrate:skip-null', { when: new Date().toISOString(), reason: 'stage_already_initialised' })
        stageDebugLog('page:hydrate:skip_null', { reason: 'stage_already_initialised' })
        return
      }
      try{
        const fallback = await localStageStore.get({ weekStart, tzId: tz.id })
        if(cancelled) return
        const localStageDoc = fallback.stage ?? null
        if(localStageDoc){
          console.debug('[stage] hydrate:from-local', { when: new Date().toISOString(), updatedAt: localStageDoc.updatedAt })
          updateStageShifts('hydrate:local', ()=> Array.isArray(localStageDoc.shifts) ? localStageDoc.shifts.map(s=> ({ ...s })) : [])
          setStageWorkingPto(localStageDoc.pto ?? [])
          setStageWorkingOverrides(localStageDoc.overrides ?? [])
          setStageWorkingCalendarSegs(localStageDoc.calendarSegs ?? [])
          setStageShiftUndoStack([])
          setStageShiftRedoStack([])
          stageAppliedAtRef.current = Number.isFinite(Date.parse(localStageDoc.updatedAt || '')) ? Date.parse(localStageDoc.updatedAt || '') : 0
          stageInitializedRef.current = true
          stageDebugLog('page:hydrate:from_local', {
            updatedAt: localStageDoc.updatedAt ?? null,
            counts: {
              shifts: Array.isArray(localStageDoc.shifts) ? localStageDoc.shifts.length : 0,
              pto: Array.isArray(localStageDoc.pto) ? localStageDoc.pto.length : 0,
              overrides: Array.isArray(localStageDoc.overrides) ? localStageDoc.overrides.length : 0,
              calendarSegs: Array.isArray(localStageDoc.calendarSegs) ? localStageDoc.calendarSegs.length : 0
            }
          })
          return
        }
      }catch(err){
        stageDebugLog('page:hydrate:local_error', { message: err instanceof Error ? err.message : String(err) }, 'warn')
      }
      if(cancelled) return
      console.debug('[stage] hydrate:from-live', { when: new Date().toISOString() })
      stageDebugLog('page:hydrate:from_live', {
        counts: {
          shifts: Array.isArray(shifts) ? shifts.length : 0,
          pto: Array.isArray(pto) ? pto.length : 0,
          overrides: Array.isArray(overrides) ? overrides.length : 0,
          calendarSegs: Array.isArray(calendarSegs) ? calendarSegs.length : 0
        }
      })
      updateStageShifts('hydrate:from-live', ()=> Array.isArray(shifts) ? shifts.map(s=> ({ ...s })) : [])
      setStageWorkingPto(pto)
      setStageWorkingOverrides(overrides)
      setStageWorkingCalendarSegs(calendarSegs)
      setStageShiftUndoStack([])
      setStageShiftRedoStack([])
      stageAppliedAtRef.current = 0
      stageInitializedRef.current = true
    }
    hydrateFrom()
    return ()=>{ cancelled = true }
  }, [stageDoc, stageDirty, shifts, pto, overrides, calendarSegs, localStageStore, weekStart, tz.id, updateStageShifts])
  React.useEffect(()=>{
    if(isStageMode){
      return
    }
    setShowStageChangesPanel(false)
    setStagePublishSummary(null)
    setShowStagePublishConfirm(false)
  }, [isStageMode])
  React.useEffect(()=>{
    if(!showStageChangesPanel){
      setStageFilterAgents(null)
    }
  }, [showStageChangesPanel])
  const handleAdminSignOut = React.useCallback(async ({ reason }: { reason?: 'expired' } = {})=>{
    try{ await logout() }catch{}
    try{ localStorage.removeItem('schedule_admin_unlocked') }catch{}
    setShowStageChangesPanel(false)
    setUnlocked(false)
    setPwInput('')
    setMsg('')
    showToast(reason==='expired' ? 'Admin session expired. Please sign in again.' : 'Signed out of admin session.', reason==='expired' ? 'error' : 'success')
  }, [showToast])

  const flushStageSave = React.useCallback(async ()=>{
    stageDebugLog('page:save:flush_request', {
      dirty: stageDirty,
      inFlight: stageSaveInFlightRef.current,
      queued: stageSaveQueuedRef.current
    })
    if(stageSaveInFlightRef.current){
      stageSaveQueuedRef.current = true
      stageDebugLog('page:save:queued', { reason: 'in_flight' })
      return null
    }
    stageSaveInFlightRef.current = true
    stageDebugLog('page:save:begin', {
      baseUpdatedAt: stageDoc?.updatedAt ?? null,
      counts: {
        shifts: stageWorkingShifts.length,
        pto: stageWorkingPto.length,
        overrides: stageWorkingOverrides.length,
        calendarSegs: stageWorkingCalendarSegs.length
      }
    })
    let nextSnapshot: StageDoc | null = null
    try{
      const base: StageDoc = stageDoc
        ? { ...stageDoc }
        : {
            weekStart,
            tzId: tz.id,
            updatedAt: new Date().toISOString(),
            shifts: [],
            pto: [],
            overrides: [],
            calendarSegs: [],
      }
      const clonedShifts = stageWorkingShifts.map(s=> ({ ...s }))
      const clonedPto = stageWorkingPto.map(p=> ({ ...p }))
      const clonedOverrides = stageWorkingOverrides.map(o=> ({ ...o }))
      const clonedCalendarSegs = stageWorkingCalendarSegs.map(seg=> ({ ...seg }))
      const payload: StageDoc = {
        ...base,
        shifts: clonedShifts,
        pto: clonedPto,
        overrides: clonedOverrides,
        calendarSegs: clonedCalendarSegs,
        updatedAt: base.updatedAt
      }
      const baselineShifts = Array.isArray(stageDoc?.shifts) ? (stageDoc.shifts as Shift[]) : []
      const sameArrayRef = (stageDoc?.shifts ?? null) === stageWorkingShifts
      const sameContent = eqShifts(baselineShifts, clonedShifts)
      const shiftDiff = diffShifts(baselineShifts, clonedShifts)
      const mismatchSample = clonedShifts.find(s=>{
        const match = baselineShifts.find(x=> x.id === s.id)
        return !match || !eqShift(match, s)
      })
      stageDebugLog('page:stage_diff:before_save', {
        changed: shiftDiff.changed.length,
        added: shiftDiff.added.length,
        removed: shiftDiff.removed.length,
        sameArrayRef,
        sameContent,
        mismatchSample: mismatchSample ? summarizeShift(mismatchSample) : null,
        sampleChanged: shiftDiff.changed.slice(0, 3),
        sampleAdded: shiftDiff.added.slice(0, 3),
        sampleRemoved: shiftDiff.removed.slice(0, 3)
      })
      if(shiftDiff.changed.length || shiftDiff.added.length || shiftDiff.removed.length){
        console.debug('[stage] diff:before_save', shiftDiff)
      }else{
        console.debug('[stage] diff:before_save none', { sameArrayRef, sameContent })
      }
      const attemptSave = async ()=>{
        console.debug('[stage] save:start', {
          when: new Date().toISOString(),
          ifMatch: base.updatedAt,
          shifts: stageWorkingShifts.length,
          pto: stageWorkingPto.length,
          overrides: stageWorkingOverrides.length,
          calendarSegs: stageWorkingCalendarSegs.length
        })
        stageDebugLog('page:save:attempt', {
          ifMatch: base.updatedAt,
          counts: {
            shifts: stageWorkingShifts.length,
            pto: stageWorkingPto.length,
            overrides: stageWorkingOverrides.length,
            calendarSegs: stageWorkingCalendarSegs.length
          }
        })
        let result = await saveStageDoc(payload, { ifMatch: base.updatedAt })
        if(result?.ok) return result
        if(result?.error === 'missing_csrf' || result?.status === 401 || result?.status === 403){
          stageDebugLog('page:save:reauth', { status: result?.status, error: result?.error })
          await ensureSiteSession()
          result = await saveStageDoc(payload, { ifMatch: base.updatedAt })
        }
        return result
      }
      const res = await attemptSave()
      stageDebugLog('page:save:attempt_result', {
        ok: !!res?.ok,
        status: res?.status ?? null,
        conflict: !!res?.conflict,
        unauthorized: !!res?.unauthorized,
        updatedAt: res?.updatedAt ?? null
      })
      if(res?.ok){
        console.debug('[stage] save:success', {
          when: new Date().toISOString(),
          updatedAt: res.updatedAt || payload.updatedAt
        })
        recordStageDebug({ tag: 'save:payload', payload })
        recordStageDebug({ tag: 'save:response', response: res?.stage ?? res })
        setStageDirty(false)
        if(res.stage){
          const serverShifts = Array.isArray(res.stage.shifts) ? (res.stage.shifts as Shift[]) : []
          const payloadShifts = Array.isArray(payload.shifts) ? (payload.shifts as Shift[]) : []
          const previousShifts = Array.isArray(stageDoc?.shifts) ? (stageDoc?.shifts as Shift[]) : []
          const matchesPayload = eqShifts(serverShifts, payloadShifts)
          const matchesPrevious = stageDoc ? eqShifts(serverShifts, previousShifts) : false
          if(matchesPayload || !matchesPrevious){
            nextSnapshot = res.stage
          }else{
            console.warn('[stage] save:server_stale', {
              when: new Date().toISOString(),
              updatedAt: res.updatedAt || payload.updatedAt,
              matchesPayload,
              matchesPrevious
            })
            stageDebugLog('page:save:server_stale', {
              matchesPayload,
              matchesPrevious,
              serverShifts: serverShifts.length,
              payloadShifts: payloadShifts.length,
              previousShifts: previousShifts.length
            }, 'warn')
            nextSnapshot = payload
          }
        }else{
          nextSnapshot = payload
        }
        if(nextSnapshot){
          const appliedSnapshot = nextSnapshot
          const ts = Date.parse(appliedSnapshot.updatedAt || '')
          stageAppliedAtRef.current = Number.isFinite(ts) ? ts : Date.now()
          updateStageShifts('save:apply_snapshot', ()=> Array.isArray(appliedSnapshot.shifts) ? appliedSnapshot.shifts.map(s=> ({ ...s })) : [])
          setStageWorkingPto(appliedSnapshot.pto ?? [])
          setStageWorkingOverrides(appliedSnapshot.overrides ?? [])
          setStageWorkingCalendarSegs(appliedSnapshot.calendarSegs ?? [])
          try{
            await localStageStore.save(appliedSnapshot)
            stageDebugLog('page:save:persist_local', {
              updatedAt: nextSnapshot.updatedAt ?? null,
              counts: {
                shifts: nextSnapshot.shifts?.length ?? 0,
                pto: nextSnapshot.pto?.length ?? 0,
                overrides: nextSnapshot.overrides?.length ?? 0,
                calendarSegs: nextSnapshot.calendarSegs?.length ?? 0
              }
            })
          }catch(err){
            stageDebugLog('page:save:persist_local_error', { message: err instanceof Error ? err.message : String(err) }, 'warn')
          }
        }
      }else{
        if(res?.conflict || res?.status === 409){
          console.warn('[stage] save:conflict', {
            when: new Date().toISOString(),
            status: res?.status,
            updatedAt: base.updatedAt
          })
          stageDebugLog('page:save:conflict', {
            status: res?.status ?? null,
            baseUpdatedAt: base.updatedAt
          }, 'warn')
          showToast('Staging snapshot is outdated. Reloading latest data.', 'error')
          setStageDirty(false)
          stageSaveQueuedRef.current = false
          await reloadStageDoc()
        }else if(res?.status === 401 || res?.status === 403 || res?.unauthorized){
          console.warn('[stage] save:unauthorized', {
            when: new Date().toISOString(),
            status: res?.status,
            error: res?.error
          })
          stageDebugLog('page:save:unauthorized', {
            status: res?.status ?? null,
            error: res?.error ?? null
          }, 'warn')
          handleAdminSignOut({ reason: 'expired' })
        }else{
          console.error('[stage] save:error', res?.error || res)
          stageDebugLog('page:save:error', {
            status: res?.status ?? null,
            error: res?.error ?? null
          }, 'error')
          showToast('Unable to save staging changes. Check your session and try again.', 'error')
        }
      }
    }catch(err){
      console.error('[stage] save:exception', err)
      stageDebugLog('page:save:exception', { message: err instanceof Error ? err.message : String(err) }, 'error')
      showToast('Unable to save staging changes. Check your connection and try again.', 'error')
    }
    stageSaveInFlightRef.current = false
    if(stageSaveQueuedRef.current){
      stageSaveQueuedRef.current = false
      window.setTimeout(()=>{
        stageDebugLog('page:save:queued_flush', { reason: 'deferred_retry' })
        const fn = flushStageSaveRef.current
        if(fn){
          fn()
        }
      }, 0)
    }
    stageDebugLog('page:save:complete', {
      queued: stageSaveQueuedRef.current,
      nextSnapshotApplied: !!nextSnapshot,
      latestAppliedAt: stageAppliedAtRef.current || null
    })
    return nextSnapshot
  }, [saveStageDoc, stageDoc, stageWorkingShifts, stageWorkingPto, stageWorkingOverrides, stageWorkingCalendarSegs, weekStart, tz.id, localStageStore, showToast, ensureSiteSession, reloadStageDoc, handleAdminSignOut, stageDirty])
  const flushStageSaveRef = React.useRef(flushStageSave)
  React.useEffect(()=>{ flushStageSaveRef.current = flushStageSave }, [flushStageSave])

  React.useEffect(()=>{
    if(!hasStageInfra) return
    if(stageError === 'unauthorized' && unlocked){
      handleAdminSignOut({ reason: 'expired' })
    }
  }, [stageError, unlocked, hasStageInfra, handleAdminSignOut])

  const markStageDirty = React.useCallback(()=>{
    stageDebugLog('page:stage_dirty:mark', {
      hasPendingTimer: stageAutoSaveTimerRef.current!=null
    })
    setStageDirty(true)
    if(stageAutoSaveTimerRef.current!=null){
      window.clearTimeout(stageAutoSaveTimerRef.current)
      stageAutoSaveTimerRef.current = null
      stageDebugLog('page:stage_dirty:clear_pending_timer')
    }
    stageAutoSaveTimerRef.current = window.setTimeout(()=>{
      stageAutoSaveTimerRef.current = null
       stageDebugLog('page:save:auto_trigger', { reason: 'stage_dirty' })
      const fn = flushStageSaveRef.current
      if(fn){
        fn()
      }
    }, 400)
  }, [])
  React.useEffect(()=>()=>{
    if(stageAutoSaveTimerRef.current!=null){
      window.clearTimeout(stageAutoSaveTimerRef.current)
      stageAutoSaveTimerRef.current = null
      stageDebugLog('page:save:auto_cleanup', { reason: 'unmount' })
    }
  }, [])
  const {
    stageAgents,
    stageEffectiveShifts,
    stageChangedShiftIds,
    stageChangeEntries,
    stageChangePersons,
    stageFilteredEntries,
    stageChangeSummaryLines,
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
  } = useStageChanges({
    weekStart,
    stageDoc,
    stageWorkingShifts,
    stageWorkingOverrides,
    localAgents,
    liveShifts: shifts,
    stageFilterAgents,
    setStageFilterAgents,
    stageDirty,
    stageLoading,
    stageError,
    stageEnabled: hasStageInfra,
  })
  const handlePublishStageToLive = React.useCallback(async ()=>{
    if(stagePublishBusy) return
    const summaryLines = stageChangeSummaryLines.slice()
    setStagePublishBusy(true)
    try{
      const latestSaved = await flushStageSave()
    const clone = <T,>(value: T): T =>{
        try{ return JSON.parse(JSON.stringify(value)) }catch{ return value }
      }
      const payload: StageDoc = {
        weekStart,
        tzId: tz.id,
        updatedAt: latestSaved?.updatedAt || stageDoc?.updatedAt || new Date().toISOString(),
        baseLiveUpdatedAt: latestSaved?.baseLiveUpdatedAt ?? stageDoc?.baseLiveUpdatedAt,
        shifts: clone(stageWorkingShifts),
        pto: clone(stageWorkingPto),
        overrides: clone(stageWorkingOverrides),
        calendarSegs: clone(stageWorkingCalendarSegs),
        agents: latestSaved?.agents ? clone(latestSaved.agents) : (stageDoc?.agents ? clone(stageDoc.agents) : undefined),
      }
      const ifMatch = latestSaved?.updatedAt || stageDoc?.updatedAt
      const publishRes = await stagePublish(payload, undefined, ifMatch ? { ifMatch } : undefined)
      if(!publishRes?.ok){
        if(publishRes?.status === 409){
          showToast('Staging publish failed: live schedule changed. Refresh staging and try again.', 'error')
        }else if(publishRes?.status === 401 || publishRes?.status === 403 || publishRes?.unauthorized){
          handleAdminSignOut({ reason: 'expired' })
        }else{
          showToast('Staging publish failed. Try again in a moment.', 'error')
        }
        return
      }
      showToast('Staging schedule pushed live.', 'success')
      setShowStagePublishConfirm(false)
      setStagePublishSummary({ lines: summaryLines })
      setStageDirty(false)
      await reloadStageDoc()
    }catch(err){
      console.error('Failed to push staging to live', err)
      showToast('Staging publish failed. Check console for details.', 'error')
    }finally{
      setStagePublishBusy(false)
    }
  }, [stagePublishBusy, stageChangeSummaryLines, flushStageSave, weekStart, tz.id, stageDoc, stageWorkingShifts, stageWorkingPto, stageWorkingOverrides, stageWorkingCalendarSegs, showToast, reloadStageDoc, handleAdminSignOut])
  const handleCopyStageSummary = React.useCallback(async ()=>{
    if(!stagePublishSummary) return
    const text = stagePublishSummary.lines.join('\n')
    try{
      if(typeof navigator !== 'undefined' && navigator.clipboard){
        await navigator.clipboard.writeText(text)
        setStagePublishSummary(prev=> prev ? { ...prev, copied: true } : prev)
        return
      }
    }catch{}
    showToast('Copy unavailable. Select the text manually.', 'error')
  }, [stagePublishSummary, showToast])

  const handleWeekStartModeChange = React.useCallback((mode:'sun'|'mon')=>{
    if(weekStartMode === mode) return
    setWeekStartMode(mode)
    try{ localStorage.setItem(WEEK_START_MODE_KEY, mode) }catch{}
    if(setWeekStart){
      try{
        const base = parseYMD(weekStart)
        if(Number.isNaN(base.getTime())) return
        let next: Date
        if(mode === 'mon'){
          const sunday = startOfWeek(base)
          next = new Date(sunday)
          next.setDate(next.getDate() + 1)
        }else{
          next = startOfWeek(base)
        }
        const nextIso = fmtYMD(next)
        if(nextIso !== weekStart){
          setWeekStart(nextIso)
        }
      }catch{}
    }
  }, [weekStartMode, setWeekStart, weekStart])

  // Track whether the working session started from live (so full undo returns to Live)
  const startedFromLiveRef = React.useRef(false)
  const markDirty = React.useCallback(()=>{
    setIsDirty(true)
  }, [])
  // Local autosave for unpublished changes (single snapshot per week/tz)
  const UNPUB_KEY = React.useMemo(()=> `schedule2.v2.unpublished.${weekStart}.${tz.id}`,[weekStart,tz.id])
  const LEGACY_DRAFT_KEY = React.useMemo(()=> `schedule2.v2.draft.${weekStart}.${tz.id}`,[weekStart,tz.id])
  // Keep working copy synced to live only when not dirty
  React.useEffect(()=>{ if(!isDirty) setWorkingShifts(shifts) },[shifts,isDirty])
  React.useEffect(()=>{ if(!isDirty) setWorkingPto(pto) },[pto,isDirty])
  // Recompute compliance when toggled or inputs change
  React.useEffect(()=>{
    if(!showCompliance){ setComplianceIssues([]); return }
    const res = computeComplianceWarnings({ weekStart, shifts: workingShifts, agents: localAgents as any, tasks, calendarSegs, suppressMealBreaks: true })
    setComplianceIssues(res.issues as any)
  }, [showCompliance, workingShifts, localAgents, tasks, calendarSegs, weekStart])
  // Load any autosaved unpublished changes for this week/tz (and migrate legacy once)
  React.useEffect(()=>{
    try{
      const raw = localStorage.getItem(UNPUB_KEY)
      if(raw){
        const parsed = JSON.parse(raw)
        if(Array.isArray(parsed?.shifts)) setWorkingShifts(parsed.shifts as Shift[])
        if(Array.isArray(parsed?.pto)) setWorkingPto(parsed.pto as PTO[])
        if(Array.isArray(parsed?.overrides)) setWorkingOverrides(parsed.overrides as Override[])
        if(Array.isArray(parsed?.shifts) || Array.isArray(parsed?.pto) || Array.isArray(parsed?.overrides)){
          markDirty()
          startedFromLiveRef.current = false
        }
        return
      }
      // Migrate legacy draft key if present
      const legacy = localStorage.getItem(LEGACY_DRAFT_KEY)
      if(legacy){
        const parsed = JSON.parse(legacy)
        const payload:any = { schema: 1, weekStart, tzId: tz.id, updatedAt: new Date().toISOString() }
        if(Array.isArray(parsed?.shifts)){
          setWorkingShifts(parsed.shifts as Shift[])
          payload.shifts = parsed.shifts
        }
        if(Array.isArray(parsed?.pto)){
          setWorkingPto(parsed.pto as PTO[])
          payload.pto = parsed.pto
        }
        if(Array.isArray(parsed?.overrides)){
          setWorkingOverrides(parsed.overrides as Override[])
          payload.overrides = parsed.overrides
        }
        if(payload.shifts || payload.pto || payload.overrides){
          markDirty()
          startedFromLiveRef.current = false
          try{ localStorage.setItem(UNPUB_KEY, JSON.stringify(payload)) }catch{}
        }
        try{ localStorage.removeItem(LEGACY_DRAFT_KEY) }catch{}
      }
    }catch{}
  }, [UNPUB_KEY, LEGACY_DRAFT_KEY, markDirty])
  // Autosave unpublished changes (debounced)
  React.useEffect(()=>{
    if(!isDirty) return
    const t = setTimeout(()=>{
      try{ localStorage.setItem(UNPUB_KEY, JSON.stringify({ schema: 1, weekStart, tzId: tz.id, shifts: workingShifts, pto: workingPto, overrides: workingOverrides, updatedAt: new Date().toISOString() })) }catch{}
    }, 300)
    return ()=> clearTimeout(t)
  }, [isDirty, workingShifts, workingPto, workingOverrides, UNPUB_KEY, weekStart, tz.id])
  // Track modified shifts to show edge time labels next render
  const [modifiedIds, setModifiedIds] = React.useState<Set<string>>(new Set<string>())
  // Schedule Editor tab: multi-select of shifts by id
  const [selectedShiftIds, setSelectedShiftIds] = React.useState<Set<string>>(new Set<string>())
  React.useEffect(()=>{
    setSelectedShiftIds(new Set<string>())
  }, [isStageMode])
  // Schedule Editor tab: multi-level undo stack (keep last 10 actions)
  const [shiftUndoStack, setShiftUndoStack] = React.useState<Array<Array<{ id:string; patch: Partial<Shift> }>>>([])
  // Redo stack mirrors undo with forward patches
  const [shiftRedoStack, setShiftRedoStack] = React.useState<Array<Array<{ id:string; patch: Partial<Shift> }>>>([])
  const canUndoShifts = isStageMode ? stageShiftUndoStack.length > 0 : shiftUndoStack.length > 0
  const canRedoShifts = isStageMode ? stageShiftRedoStack.length > 0 : shiftRedoStack.length > 0
  const handleCreateShift = React.useCallback((person: string, minutesFromWeekStart: number)=>{
    if(!person || !Number.isFinite(minutesFromWeekStart)) return
    const totalWeekMinutes = 7 * 24 * 60
    const clamped = Math.max(0, Math.min(minutesFromWeekStart, totalWeekMinutes - 1))
    let startDayAbsIndex = Math.floor(clamped / 1440)
    let startMinute = Math.round((clamped % 1440) / 15) * 15
    if(startMinute >= 1440){
      startMinute -= 1440
      startDayAbsIndex += 1
    }
    const normalizedStartIndex = ((startDayAbsIndex % 7) + 7) % 7
    const startDay = DAYS[normalizedStartIndex] as typeof DAYS[number]
    const startStr = minToHHMM(startMinute)
    const absoluteStart = startDayAbsIndex * 1440 + startMinute
    const duration = 8.5 * 60
    const endTotal = absoluteStart + duration
    let endDayAbsIndex = Math.floor(endTotal / 1440)
    let endMinute = Math.round((endTotal % 1440) / 15) * 15
    if(endMinute >= 1440){
      endMinute -= 1440
      endDayAbsIndex += 1
    }
    const normalizedEndIndex = ((endDayAbsIndex % 7) + 7) % 7
    let endDay: typeof DAYS[number] | undefined
    let endStr = minToHHMM(endMinute)
    if(endDayAbsIndex !== startDayAbsIndex){
      if(endMinute === 0){
        endStr = '24:00'
      }else{
        endDay = DAYS[normalizedEndIndex] as typeof DAYS[number]
      }
    }
    const agentId = agentIdByName(localAgents as any, person)
    const newShift: Shift = {
      id: uid(),
      person,
      agentId,
      day: startDay as any,
      start: startStr,
      end: endStr,
      ...(endDay ? { endDay } : {})
    }
    setSelectedShiftIds(new Set<string>([newShift.id]))
    if(isStageMode){
      updateStageShifts('createShift', prev=> prev.concat([newShift]))
      markStageDirty()
    }else{
      setWorkingShifts(prev=> prev.concat([newShift]))
      setModifiedIds(prev=>{ const next = new Set(prev); next.add(newShift.id); return next })
      markDirty()
    }
  }, [localAgents, isStageMode, markStageDirty, markDirty, updateStageShifts])
  const deleteSelectedShifts = React.useCallback(()=>{
    if(selectedShiftIds.size===0) return
    const ids = new Set(selectedShiftIds)
    if(isStageMode){
      updateStageShifts('deleteShift', prev=> prev.filter(s=> !ids.has(s.id)))
      markStageDirty()
    }else{
      setWorkingShifts(prev=> prev.filter(s=> !ids.has(s.id)))
      setModifiedIds(prev=>{
        const next = new Set(prev)
        ids.forEach(id=> next.delete(id))
        return next
      })
      markDirty()
    }
    setSelectedShiftIds(new Set<string>())
  }, [selectedShiftIds, isStageMode, markStageDirty, markDirty, updateStageShifts])
  const formatUnixTs = React.useCallback((ts?: number | null)=>{
    if(ts == null || !Number.isFinite(ts)) return '—'
    try{ return new Date(ts * 1000).toLocaleString() }catch{ return '—' }
  }, [])
  const loadZoomConnections = React.useCallback(async ()=>{
    setZoomLoading(true)
    setZoomError(null)
    const res = await getZoomConnections()
    if(res.ok){
      setZoomConnections(res.connections)
    } else {
      setZoomError('Failed to load Zoom connections.')
    }
    setZoomLoading(false)
  }, [])
  const handleConnectZoom = React.useCallback(async ()=>{
    setZoomError(null)
    const res = await getZoomAuthorizeUrl()
    if(res.ok && res.url){
      window.location.href = res.url
    } else {
      setZoomError('Unable to start Zoom sign-in.')
      showToast('Unable to start Zoom sign-in.', 'error')
    }
  }, [showToast])
  const handleRemoveZoom = React.useCallback(async (id: string)=>{
    if(!id) return
    if(!window.confirm('Remove this Zoom account?')) return
    const res = await deleteZoomConnection(id)
    if(res.ok){
      setZoomConnections(prev=> prev.filter(conn=> conn.id !== id))
      showToast('Zoom connection removed.', 'success')
    } else {
      setZoomError('Failed to remove Zoom connection.')
      showToast('Failed to remove Zoom connection.', 'error')
    }
  }, [showToast])

  React.useEffect(()=>{
    if(subtab === 'Integrations'){
      if(!zoomInitializedRef.current){
        zoomInitializedRef.current = true
        loadZoomConnections()
      }
    }
  }, [subtab, loadZoomConnections])

  React.useEffect(()=>{
    if(typeof window === 'undefined') return
    try{
      const hash = window.location.hash || ''
      const idx = hash.indexOf('?')
      if(idx < 0) return
      const base = hash.slice(0, idx)
      const params = new URLSearchParams(hash.slice(idx+1))
      const status = params.get('zoomStatus')
      if(!status) return
      const detail = params.get('zoomDetail') || params.get('zoomCode') || ''
      params.delete('zoomStatus')
      params.delete('zoomDetail')
      params.delete('zoomCode')
      const cleaned = params.toString()
      const nextHash = cleaned ? `${base}?${cleaned}` : base
      if(window.history && typeof window.history.replaceState === 'function'){
        window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}${nextHash}`)
      }
      setSubtab('Integrations')
      if(status === 'success'){
        showToast('Zoom account linked.', 'success')
        zoomInitializedRef.current = false
      }else if(status === 'error'){
        showToast(detail ? `Zoom connect failed: ${detail}` : 'Zoom connect failed.', 'error')
      }
    }catch{}
  }, [showToast])
  const pushShiftsUndo = React.useCallback((changes: Array<{ id:string; patch: Partial<Shift> }>)=>{
    if(changes.length===0) return
    // If this is the first change in a clean state and working === live, mark we started from live
    if(!isDirty && eqShifts(workingShifts, shifts)) startedFromLiveRef.current = true
    setShiftUndoStack(prev=>{
      const next = prev.concat([changes])
      if(next.length>10) next.shift()
      return next
    })
    // Any new action invalidates redo history
    setShiftRedoStack([])
    markDirty()
  }, [isDirty, workingShifts, shifts, markDirty])
  const undoShifts = React.useCallback(()=>{
    if(shiftUndoStack.length===0) return
    const last = shiftUndoStack[shiftUndoStack.length-1]
    // Capture current values to enable redo
    const redoPatches: Array<{ id:string; patch: Partial<Shift> }> = last.map(({id})=>{
      const cur = workingShifts.find(s=> s.id===id)
      return cur ? { id, patch: { day: cur.day, start: cur.start, end: cur.end, endDay: (cur as any).endDay } } : { id, patch: {} }
    })
    // Apply previous patches
    setWorkingShifts(prev=> prev.map(s=>{
      const p = last.find(x=> x.id===s.id)
      return p ? { ...s, ...p.patch } : s
    }))
    // Remove reverted ids from modified set if they match the reverted state next render
    setModifiedIds(prev=>{
      const next = new Set(prev)
      last.forEach(({id})=> next.delete(id))
      return next
    })
    setShiftUndoStack(prev=> prev.slice(0, -1))
    // Push redo patches on stack
    setShiftRedoStack(prev=> prev.concat([redoPatches]))
    markDirty()
    // If we've undone the very first change from live, revert to live
    const remaining = shiftUndoStack.length - 1
    if(remaining===0 && startedFromLiveRef.current){
      setWorkingShifts(shifts)
      setIsDirty(false)
      startedFromLiveRef.current = false
    }
  }, [shiftUndoStack, workingShifts, shifts, markDirty])
  const redoShifts = React.useCallback(()=>{
    if(shiftRedoStack.length===0) return
    const last = shiftRedoStack[shiftRedoStack.length-1]
    // Capture current values to re-enable undo after redo
    const undoPatches: Array<{ id:string; patch: Partial<Shift> }> = last.map(({id})=>{
      const cur = workingShifts.find(s=> s.id===id)
      return cur ? { id, patch: { day: cur.day, start: cur.start, end: cur.end, endDay: (cur as any).endDay } } : { id, patch: {} }
    })
    setWorkingShifts(prev=> prev.map(s=>{
      const p = last.find(x=> x.id===s.id)
      return p ? { ...s, ...p.patch } : s
    }))
    // Mark modified ids so outer time tags show
    setModifiedIds(prev=>{
      const next = new Set(prev)
      last.forEach(({id})=> next.add(id))
      return next
    })
    setShiftRedoStack(prev=> prev.slice(0, -1))
    setShiftUndoStack(prev=> prev.concat([undoPatches]))
    markDirty()
  }, [shiftRedoStack, workingShifts, markDirty])

  const pushStageShiftsUndo = React.useCallback((changes: Array<{ id:string; patch: Partial<Shift> }>)=>{
    if(changes.length===0) return
    setStageShiftUndoStack(prev=>{
      const next = prev.concat([changes])
      if(next.length>10) next.shift()
      return next
    })
    setStageShiftRedoStack([])
    markStageDirty()
  }, [markStageDirty])
  const undoStageShifts = React.useCallback(()=>{
    if(stageShiftUndoStack.length===0) return
    const last = stageShiftUndoStack[stageShiftUndoStack.length-1]
    const redoPatches: Array<{ id:string; patch: Partial<Shift> }> = last.map(({id})=>{
      const cur = stageWorkingShifts.find(s=> s.id===id)
      return cur ? { id, patch: { day: cur.day, start: cur.start, end: cur.end, endDay: (cur as any).endDay } } : { id, patch: {} }
    })
    updateStageShifts('undoStageShifts', prev=> prev.map(s=>{
      const p = last.find(x=> x.id===s.id)
      return p ? { ...s, ...p.patch } : s
    }))
    setStageShiftUndoStack(prev=> prev.slice(0, -1))
    setStageShiftRedoStack(prev=> prev.concat([redoPatches]))
    markStageDirty()
  }, [stageShiftUndoStack, stageWorkingShifts, markStageDirty, updateStageShifts])
  const redoStageShifts = React.useCallback(()=>{
    if(stageShiftRedoStack.length===0) return
    const last = stageShiftRedoStack[stageShiftRedoStack.length-1]
    const undoPatches: Array<{ id:string; patch: Partial<Shift> }> = last.map(({id})=>{
      const cur = stageWorkingShifts.find(s=> s.id===id)
      return cur ? { id, patch: { day: cur.day, start: cur.start, end: cur.end, endDay: (cur as any).endDay } } : { id, patch: {} }
    })
    updateStageShifts('redoStageShifts', prev=> prev.map(s=>{
      const p = last.find(x=> x.id===s.id)
      return p ? { ...s, ...p.patch } : s
    }))
    setStageShiftRedoStack(prev=> prev.slice(0, -1))
    setStageShiftUndoStack(prev=> prev.concat([undoPatches]))
    markStageDirty()
  }, [stageShiftRedoStack, stageWorkingShifts, markStageDirty, updateStageShifts])

  // Compute effective shifts for display by applying Overrides as replacements.
  // - No-time overrides: remove the agent's shifts for the covered day(s).
  // - Time overrides: replace the agent's shifts on the covered day(s) with the provided time window.
  // Weekly recurrence is respected.
  const effectiveWorkingShifts = React.useMemo(()=>{
    try{ return applyOverrides(workingShifts, workingOverrides, weekStart, localAgents as any) }
    catch{ return workingShifts }
  }, [workingShifts, workingOverrides, weekStart, localAgents])
  const baseScheduleShifts = isStageMode ? stageWorkingShifts : workingShifts
  const adjustmentScheduleShifts = isStageMode ? stageEffectiveShifts : effectiveWorkingShifts
  const scheduleShifts = showScheduleAdjustments ? adjustmentScheduleShifts : baseScheduleShifts
  const schedulePto = showScheduleAdjustments ? (isStageMode ? stageWorkingPto : workingPto) : []
  const scheduleAgents = isStageMode ? stageAgents : localAgents
  const adjustmentHighlightIds = React.useMemo(()=>{
    if(!showScheduleAdjustments) return new Set<string>()
    const baseMap = new Map(baseScheduleShifts.map(s=> [s.id, s]))
    const highlight = new Set<string>()
    for(const s of adjustmentScheduleShifts){
      const id = s.id || ''
      if(id.startsWith('ov:')){
        highlight.add(id)
        continue
      }
      const baseline = baseMap.get(id)
      if(!baseline){
        highlight.add(id)
        continue
      }
      if(!eqShift(baseline, s)){
        highlight.add(id)
      }
    }
    return highlight
  }, [showScheduleAdjustments, baseScheduleShifts, adjustmentScheduleShifts])
  const baseHighlightIds = React.useMemo(()=>{
    const source = isStageMode ? stageChangedShiftIds : modifiedIds
    return new Set(source)
  }, [isStageMode, stageChangedShiftIds, modifiedIds])
  const scheduleHighlightIds = React.useMemo(()=>{
    if(!showScheduleAdjustments || adjustmentHighlightIds.size===0) return baseHighlightIds
    const merged = new Set(baseHighlightIds)
    adjustmentHighlightIds.forEach(id=> merged.add(id))
    return merged
  }, [baseHighlightIds, adjustmentHighlightIds, showScheduleAdjustments])
  const adjustmentsHighlightColor = React.useMemo(()=> showScheduleAdjustments
    ? { light: 'rgba(34,197,94,0.65)', dark: 'rgba(34,197,94,0.8)' }
    : undefined
  , [showScheduleAdjustments])
  const modeSubtitleText = isStageMode ? stageSubtitleText : (isDirty ? 'Unpublished local edits' : 'Live data preview')
  const stagingStatusBadgeClasses = dark ? 'bg-neutral-900 border-violet-500/60 text-violet-300' : 'bg-white border-violet-500/70 text-violet-700'
  const modeSubtitleClassName = [
    'text-[10px]',
    isStageMode && stageError
      ? (dark ? 'text-red-300' : 'text-red-600')
      : 'opacity-60'
  ].join(' ')
  const livePublishDisabled = manualPublishPending || !isDirty
  const stagePublishSummaryLines = stagePublishSummary?.lines ?? []
  const livePublishLabel = manualPublishPending ? 'Saving…' : 'Save changes to live'
  const stageToggleLabel = React.useMemo(()=>{
    if(isStageMode) return 'Switch to live mode'
    if(stageChangeCount>0) return `Switch to staging (${stageChangeCount})`
    return 'Switch to staging'
  }, [isStageMode, stageChangeCount])
  React.useEffect(()=>{
    if(!showStagePublishConfirm){
      setStageRemovalAck(false)
    }else if(!requiresRemovalAck){
      setStageRemovalAck(true)
    }else{
      setStageRemovalAck(false)
    }
  }, [showStagePublishConfirm, requiresRemovalAck])
  const stagePublishDisabledReason = React.useMemo(()=>{
    if(stageDirty) return 'Autosave in progress — wait for staging save to finish.'
    if(stageLoading) return 'Staging data is still loading.'
    if(stageChangeCount===0) return 'No staged changes to publish.'
    return ''
  }, [stageDirty, stageLoading, stageChangeCount])
  const canPushStage = !stagePublishBusy && !stageDirty && !stageLoading && stageChangeCount>0
  const confirmPublishDisabled = stagePublishBusy || stageDirty || stageLoading || stageChangeCount===0 || (requiresRemovalAck && !stageRemovalAck)
  const confirmPublishDisabledReason = React.useMemo(()=>{
    if(stagePublishBusy) return ''
    if(requiresRemovalAck && !stageRemovalAck) return 'Confirm removals before publishing.'
    return stagePublishDisabledReason
  }, [stagePublishBusy, requiresRemovalAck, stageRemovalAck, stagePublishDisabledReason])
  const visibleScheduleAgents = React.useMemo(()=>{
    const source = scheduleAgents
    return includeHiddenAgents ? source : source.filter(a=> !a.hidden)
  }, [scheduleAgents, includeHiddenAgents])
  // When switching into Schedule Editor tab, if there are no local edits pending, refresh from live
  React.useEffect(()=>{
    if(subtab!== 'Schedule Editor' || isStageMode) return
    const noLocalEdits = shiftUndoStack.length===0 && shiftRedoStack.length===0 && modifiedIds.size===0
    if(noLocalEdits){ setWorkingShifts(shifts) }
  }, [subtab, shifts, shiftUndoStack, shiftRedoStack, modifiedIds, isStageMode])
  // Keyboard shortcuts for Schedule Editor tab (Undo/Redo, Escape)
  React.useEffect(()=>{
    const onKey = (e: KeyboardEvent)=>{
      if(subtab!=='Schedule Editor') return
      const target = (e.target as HTMLElement | null) || (typeof document !== 'undefined' ? (document.activeElement as HTMLElement | null) : null)
      if(target){
        const tag = target.tagName
        if(tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable) return
      }
      const isUndo = (e.ctrlKey || e.metaKey) && !e.shiftKey && (e.key==='z' || e.key==='Z')
      const isRedo = ((e.ctrlKey || e.metaKey) && (e.shiftKey && (e.key==='z' || e.key==='Z'))) || ((e.ctrlKey || e.metaKey) && (e.key==='y' || e.key==='Y'))
      if(isUndo){
        e.preventDefault()
        if(isStageMode){ undoStageShifts() }else{ undoShifts() }
        return
      } else if(isRedo){
        e.preventDefault()
        if(isStageMode){ redoStageShifts() }else{ redoShifts() }
        return
      }
      const isDeleteKey = e.key === 'Delete' || (e.key === 'Backspace' && (e.ctrlKey || e.metaKey))
      if(isDeleteKey && selectedShiftIds.size>0){
        e.preventDefault()
        deleteSelectedShifts()
        return
      }
      if(hasStageInfra){
        if(e.key === '1'){
          e.preventDefault()
          if(isStageMode) setScheduleMode('live')
          return
        }
        if(e.key === '2'){
          e.preventDefault()
          if(!isStageMode) setScheduleMode('stage')
          return
        }
      }
      if(e.key === 'Escape'){
        // Clear selection to allow single-shift moves without grouping
        setSelectedShiftIds(new Set())
      }
    }
    window.addEventListener('keydown', onKey)
    return ()=> window.removeEventListener('keydown', onKey)
  }, [subtab, undoShifts, redoShifts, undoStageShifts, redoStageShifts, isStageMode, selectedShiftIds, deleteSelectedShifts, hasStageInfra, setScheduleMode])

  const handleStageRefresh = React.useCallback(async ()=>{
    if(!hasStageInfra) return
    if(stageDirty){
      const confirmed = window.confirm('Reload staging and discard unsaved changes?')
      if(!confirmed) return
    }
    try{
      await reloadStageDoc()
      showToast('Staging reloaded.', 'success')
    }catch(err){
      console.error('Failed to reload staging', err)
      showToast('Failed to reload staging snapshot.', 'error')
    }
  }, [hasStageInfra, stageDirty, reloadStageDoc, showToast])

  const handleStageChangeRevert = React.useCallback((entry: StageChangeEntry)=>{
    if(!hasStageInfra) return
    let changed = false
    let message: string | null = null
    if(entry.type==='added' && entry.stage?.id){
      updateStageShifts('changesPanel:remove_added', prev=>{
        const next = prev.filter(s=> s.id !== entry.stage!.id)
        if(next.length === prev.length) return prev
        changed = true
        message = 'Removed staged shift.'
        return next
      })
    }else if(entry.type==='updated' && entry.stage?.id && entry.live){
      updateStageShifts('changesPanel:revert_updated', prev=>{
        let mutated = false
        const next = prev.map(s=>{
          if(s.id === entry.stage!.id){
            mutated = true
            return cloneShiftForStage(entry.live as Shift)
          }
          return s
        })
        if(!mutated) return prev
        changed = true
        message = 'Reverted staging change.'
        return next
      })
    }else if(entry.type==='removed' && entry.live){
      updateStageShifts('changesPanel:restore_removed', prev=>{
        const restored = cloneShiftForStage(entry.live as Shift)
        if(prev.some(s=> s.id === restored.id)){
          let mutated = false
          const next = prev.map(s=>{
            if(s.id === restored.id){
              mutated = true
              return cloneShiftForStage(restored)
            }
            return s
          })
          if(!mutated) return prev
          changed = true
          message = 'Restored removed shift to staging.'
          return next
        }
        changed = true
        message = 'Restored removed shift to staging.'
        return prev.concat([restored])
      })
    }
    if(changed){
      markStageDirty()
      if(message) showToast(message, 'success')
    }
  }, [hasStageInfra, updateStageShifts, markStageDirty, showToast])

  const handleStageChangeEdit = React.useCallback((entry: StageChangeEntry)=>{
    if(!hasStageInfra) return
    let targetId: string | undefined
    if(entry.stage?.id){
      targetId = entry.stage.id
    }else if(entry.live?.id){
      let added = false
      const restored = cloneShiftForStage(entry.live as Shift)
      updateStageShifts('changesPanel:restore_for_edit', prev=>{
        if(prev.some(s=> s.id === restored.id)) return prev
        added = true
        return prev.concat([restored])
      })
      if(added){ markStageDirty() }
      targetId = restored.id
    }
    setScheduleMode('stage')
    setSubtab('Schedule Editor')
    setShowStageChangesPanel(false)
    if(targetId){
      const id = targetId
      window.setTimeout(()=> setSelectedShiftIds(new Set([id])), 0)
    }
  }, [hasStageInfra, setScheduleMode, setSubtab, setShowStageChangesPanel, setSelectedShiftIds, updateStageShifts, markStageDirty])

  // Postures tab form state
  const allPeople = React.useMemo(()=>{
    const set = new Set<string>()
    // Prefer current Agents tab entries (full names)
    for(const a of localAgents){ const nm = `${a.firstName} ${a.lastName}`.trim(); if(nm) set.add(nm) }
    // Also include any names present on shifts (demo or otherwise)
    for(const s of shifts){ if(s.person) set.add(s.person) }
    // And any names that already exist in assigned calendar segments
    for(const cs of calendarSegs){ if(cs.person) set.add(cs.person) }
    // Include any names present on PTO records
    for(const p of pto){ if(p.person) set.add(p.person) }
    return Array.from(set).sort()
  }, [localAgents, shifts, calendarSegs, pto])
  const activeTasks = React.useMemo(()=> tasks.filter(t=>!t.archived), [tasks])
  const [assignee, setAssignee] = React.useState<string>('')
  const [assignDay, setAssignDay] = React.useState<typeof DAYS[number]>('Mon' as any)
  const [assignStart, setAssignStart] = React.useState('09:00')
  const [assignEnd, setAssignEnd] = React.useState('12:00')
  const [assignTaskId, setAssignTaskId] = React.useState<string>('')
  const [assignEndDay, setAssignEndDay] = React.useState<typeof DAYS[number]>('Mon' as any)
  React.useEffect(()=>{ if(!assignTaskId && activeTasks[0]) setAssignTaskId(activeTasks[0].id) },[activeTasks, assignTaskId])
  const handleAssignStartChange = React.useCallback((value: string)=>{
    setAssignStart(value)
    const { endDay, endTime } = computeDefaultPostureEnd(assignDay, value)
    setAssignEnd(endTime)
    setAssignEndDay(endDay)
  }, [assignDay])
  const handleAssignDayChange = React.useCallback((value: typeof DAYS[number])=>{
    setAssignDay(value)
    const { endDay, endTime } = computeDefaultPostureEnd(value, assignStart)
    setAssignEnd(endTime)
    setAssignEndDay(endDay)
  }, [assignStart])
  const handleAssignEndChange = React.useCallback((value: string)=>{
    setAssignEnd(value)
  }, [])
  const handleAssignEndDayChange = React.useCallback((value: typeof DAYS[number])=>{
    setAssignEndDay(value)
  }, [])
  // Inline edit state for assigned calendar segments
  const [editingIdx, setEditingIdx] = React.useState<number|null>(null)
  const [eaPerson, setEaPerson] = React.useState('')
  const [eaDay, setEaDay] = React.useState<typeof DAYS[number]>('Mon' as any)
  const [eaStart, setEaStart] = React.useState('09:00')
  const [eaEnd, setEaEnd] = React.useState('10:00')
  const [eaTaskId, setEaTaskId] = React.useState('')
  const [eaEndDay, setEaEndDay] = React.useState<typeof DAYS[number]>('Mon' as any)
  // const [filterTaskId, setFilterTaskId] = React.useState('') // not used currently
  // Calendar filter removed in favor of per-posture calendars

  // PTO tab state
  const [pt_agent, setPtAgent] = React.useState('')
  const [pt_start, setPtStart] = React.useState('')
  const [pt_end, setPtEnd] = React.useState('')
  const [pt_notes, setPtNotes] = React.useState('')
  const [ptoEditing, setPtoEditing] = React.useState<PTO | null>(null)
  const [pt_e_person, setPtEPerson] = React.useState('')
  const [pt_e_start, setPtEStart] = React.useState('')
  const [pt_e_end, setPtEEnd] = React.useState('')
  const [pt_e_notes, setPtENotes] = React.useState('')
  const startPtoEdit = (r: PTO)=>{ setPtoEditing(r); setPtEPerson(r.person); setPtEStart(r.startDate); setPtEEnd(r.endDate); setPtENotes(r.notes||'') }
  const clearPtoEdit = ()=>{ setPtoEditing(null); setPtEPerson(''); setPtEStart(''); setPtEEnd(''); setPtENotes('') }
  const filteredPto = React.useMemo(()=>{
    return workingPto
      .slice()
      .sort((a,b)=>{
        const personCmp = a.person.localeCompare(b.person)
        if(personCmp!==0) return personCmp
        return a.startDate.localeCompare(b.startDate)
      })
  }, [workingPto])

  // Overrides state (PTO tab)
  const [ov_agent, setOvAgent] = React.useState('')
  const [ov_start, setOvStart] = React.useState('') // YYYY-MM-DD
  const [ov_end, setOvEnd] = React.useState('')     // YYYY-MM-DD
  const [ov_tstart, setOvTStart] = React.useState('') // HH:MM optional
  const [ov_tend, setOvTEnd] = React.useState('')     // HH:MM optional
  const [ov_kind, setOvKind] = React.useState('')
  const [ov_notes, setOvNotes] = React.useState('')
  const [ov_recurring, setOvRecurring] = React.useState(false)
  const [ov_until, setOvUntil] = React.useState('') // YYYY-MM-DD (optional)
  const [overrideEditing, setOverrideEditing] = React.useState<Override | null>(null)
  const [ov_e_agent, setOvEAgent] = React.useState('')
  const [ov_e_start, setOvEStart] = React.useState('')
  const [ov_e_end, setOvEEnd] = React.useState('')
  const [ov_e_tstart, setOvETStart] = React.useState('')
  const [ov_e_tend, setOvETEnd] = React.useState('')
  const [ov_e_kind, setOvEKind] = React.useState('')
  const [ov_e_notes, setOvENotes] = React.useState('')
  const [ov_e_recurring, setOvERecurring] = React.useState(false)
  const [ov_e_until, setOvEUntil] = React.useState('')
  const startOverrideEdit = (entry: Override)=>{
    setOverrideEditing(entry)
    setOvEAgent(entry.person)
    setOvEStart(entry.startDate)
    setOvEEnd(entry.endDate)
    setOvETStart(entry.start || '')
    setOvETEnd(entry.end || '')
    setOvEKind(entry.kind || '')
    setOvENotes(entry.notes || '')
    setOvERecurring(Boolean(entry.recurrence))
    setOvEUntil(entry.recurrence?.until || '')
  }
  const clearOverrideEdit = ()=>{
    setOverrideEditing(null)
    setOvEAgent('')
    setOvEStart('')
    setOvEEnd('')
    setOvETStart('')
    setOvETEnd('')
    setOvEKind('')
    setOvENotes('')
    setOvERecurring(false)
    setOvEUntil('')
  }
  const filteredOverrides = React.useMemo(()=>{
    return workingOverrides
      .slice()
      .sort((a,b)=>{
        const personCmp = a.person.localeCompare(b.person)
        if(personCmp!==0) return personCmp
        const startCmp = a.startDate.localeCompare(b.startDate)
        if(startCmp!==0) return startCmp
        const timeA = a.start || ''
        const timeB = b.start || ''
        return timeA.localeCompare(timeB)
      })
  }, [workingOverrides])
  const calendarWeeks = React.useMemo(()=>{
    const base = parseYMD(weekStart)
    return [
      { key: 'current', label: 'Current week', startDate: base },
      { key: 'next', label: 'Next week', startDate: addDays(base, 7) }
    ] as const
  }, [weekStart])
  const overrideCalendarData = React.useMemo(()=>{
    return calendarWeeks.map(({ key, label, startDate })=>{
      const dayEntries = DAYS.map((day, idx)=>{
        const dateObj = addDays(startDate, idx)
        return { day, ymd: fmtYMD(dateObj), dateObj }
      })
      const buckets = new Map<string, OverrideCalendarDayEntry[]>(dayEntries.map(({ ymd })=> [ymd, []]))
      const week0 = startDate
      const week6 = addDays(startDate, 6)
      for(const ov of workingOverrides){
        let s = parseYMD(ov.startDate)
        let e = parseYMD(ov.endDate)
        const pushRange = (start: Date, end: Date)=>{
          const occurrenceStart = fmtYMD(start)
          const occurrenceEnd = fmtYMD(end)
          let cur = new Date(start)
          const last = new Date(end)
          while(cur <= last){
            const ymd = fmtYMD(cur)
            const bucket = buckets.get(ymd)
            if(bucket){
              bucket.push({ override: ov, occurrenceStart, occurrenceEnd })
            }
            cur = addDays(cur, 1)
          }
        }
        if(ov.recurrence?.rule === 'weekly'){
          const until = ov.recurrence.until ? parseYMD(ov.recurrence.until) : null
          let guard = 0
          while(e < week0 && guard < 200){
            s = addDays(s, 7)
            e = addDays(e, 7)
            guard++
            if(until && s > until) break
          }
          while(s <= week6 && (!until || s <= until)){
            pushRange(s, e)
            s = addDays(s, 7)
            e = addDays(e, 7)
          }
        }else{
          pushRange(s, e)
        }
      }
      for(const bucket of buckets.values()){
        bucket.sort((a,b)=>{
          const personCmp = a.override.person.localeCompare(b.override.person)
          if(personCmp!==0) return personCmp
          const startA = a.override.start || ''
          const startB = b.override.start || ''
          return startA.localeCompare(startB)
        })
      }
      return {
        key,
        label,
        startDate,
        days: dayEntries.map(({ day, ymd, dateObj })=> ({
          day,
          ymd,
          dateObj,
          entries: buckets.get(ymd) ?? []
        }))
      }
    })
  }, [calendarWeeks, workingOverrides])

  // Removed: saved draft snapshots and related actions — drafts are deprecated
  // Persist agent selection across tab switches
  const [selectedAgentIdx, setSelectedAgentIdx] = React.useState<number|null>(null)
  // If the selected index goes out-of-range after agent edits, fix it up
  React.useEffect(()=>{
    if(selectedAgentIdx==null) return
    if(selectedAgentIdx < 0 || selectedAgentIdx >= localAgents.length){
      setSelectedAgentIdx(localAgents.length>0 ? 0 : null)
    }
  }, [selectedAgentIdx, localAgents])
  const publishWorkingToLive = React.useCallback(async ({ silent = false }: { silent?: boolean } = {})=>{
    // Include agents in publish so metadata like supervisor persists
    const agentsPayload = mapAgentsToPayloads(localAgents)
    try{
      const res = await cloudPostDetailed({ shifts: workingShifts, pto: workingPto, overrides: workingOverrides, calendarSegs, agents: agentsPayload as any, updatedAt: new Date().toISOString() })
      if(res.ok){
        setIsDirty(false)
        if(!silent) showToast('Published to live.', 'success')
        startedFromLiveRef.current = false
        // Clear modified markers so shift ribbons no longer show edited tags
        setModifiedIds(new Set())
        try{ localStorage.removeItem(UNPUB_KEY) }catch{}
        // Update parent state to reflect published data immediately so autosync does not roll back
        const clonedShifts = workingShifts.map(s=> ({ ...s }))
        const clonedPto = workingPto.map(p=> ({ ...p }))
        const clonedOverrides = workingOverrides.map(o=> ({ ...o }))
        const clonedCalendarSegs = calendarSegs.map(seg=> ({ ...seg }))
        setShifts(()=> clonedShifts)
        setPto(()=> clonedPto)
        setOverrides(()=> clonedOverrides)
        setCalendarSegs(()=> clonedCalendarSegs)
        return true
      }
      if(res.status===404 || res.error==='missing_site_session' || (res.bodyText||'').includes('missing_site_session')){
        await ensureSiteSession()
        showToast('Publish failed: missing or expired site session. Please sign in to view and then try again.', 'error')
      }else if(res.status===401){
        showToast('Publish failed: not signed in as admin (401).', 'error')
        handleAdminSignOut()
      }else if(res.status===403){
        showToast('Publish failed: CSRF mismatch (403). Try reloading and signing in again.', 'error')
        handleAdminSignOut()
      }else if(res.status===409){
        showToast('Publish failed: conflict (409). Refresh to load latest, then retry.', 'error')
      }else{
        showToast(`Failed to publish. ${res.status?`HTTP ${res.status}`:''} ${res.error?`— ${res.error}`:''}`, 'error')
      }
      return false
    }catch(err:any){
      const message = err?.message ? `Failed to publish: ${err.message}` : 'Failed to publish.'
      showToast(message, 'error')
      return false
    }
  }, [localAgents, workingShifts, workingPto, workingOverrides, calendarSegs, showToast, setShifts, setCalendarSegs, setPto, setOverrides, ensureSiteSession, handleAdminSignOut])
  const handleManualPublish = React.useCallback(async ()=>{
    if(manualPublishPending) return
    setManualPublishPending(true)
    try{
      await publishWorkingToLive()
    }finally{
      setManualPublishPending(false)
    }
  }, [manualPublishPending, publishWorkingToLive])
  const handleAdd = React.useCallback((a:{ firstName:string; lastName:string; tzId:string })=>{
    onAddAgent?.(a)
    setLocalAgents(prev=> prev.concat([{ firstName: a.firstName, lastName: a.lastName, tzId: a.tzId, hidden: false, meetingCohort: undefined }]))
    markDirty()
  },[onAddAgent, markDirty])
  const handleUpdate = React.useCallback((index:number, a:AgentRow)=>{
    onUpdateAgent?.(index, a)
    setLocalAgents(prev=> prev.map((row,i)=> i===index ? a : row))
    markDirty()
  },[onUpdateAgent, markDirty])
  const handleDelete = React.useCallback((index:number)=>{
    onDeleteAgent?.(index)
    setLocalAgents(prev=> prev.filter((_,i)=> i!==index))
    markDirty()
  },[onDeleteAgent, markDirty])
  if (!unlocked) {
    return (
      <section className={["rounded-2xl p-6", dark ? "bg-neutral-900" : "bg-white shadow-sm"].join(' ')}>
        <div className="max-w-md mx-auto space-y-3">
          <div className="text-lg font-semibold">Protected — Manage Data</div>
          <p className="text-sm opacity-80">Sign in to your session.</p>
          <form onSubmit={(e)=>{ e.preventDefault(); (async()=>{
      const res = await login(pwInput)
            if(res.ok){
              try{ await ensureSiteSession(pwInput) }catch{}
              const diag = getCsrfDiagnostics()
              if(hasCsrfToken()){
                setUnlocked(true); setMsg(''); try{ localStorage.setItem('schedule_admin_unlocked','1') }catch{}
        // Proactively push agents metadata so Hidden flags propagate immediately post-login
        try{ cloudPostAgents(mapAgentsToPayloads(agents)) }catch{}
              } else {
                setUnlocked(false); setMsg('Signed in, but CSRF missing. Check cookie Domain/Path and SameSite; reload and try again.')
              }
            } else { setMsg(res.status===401?'Incorrect password':'Login failed') }
          })() }}>
            <div className="flex gap-2">
              <input type="password" autoFocus className={["flex-1 border rounded-xl px-3 py-2", dark && "bg-neutral-900 border-neutral-700"].filter(Boolean).join(' ')} value={pwInput} onChange={(e)=>setPwInput(e.target.value)} placeholder="Password" />
              <button type="submit" className={["rounded-xl px-4 py-2 font-medium border", dark ? "bg-neutral-800 border-neutral-700" : "bg-blue-600 text-white border-blue-600"].join(' ')}>Sign in</button>
            </div>
          </form>
          {msg && (<div className={["text-sm", dark ? "text-red-300" : "text-red-600"].join(' ')}>{msg}</div>)}
          <div className="pt-3 border-t border-neutral-700/30 mt-3">
            <div className="text-sm font-medium mb-1">Or email me a magic link</div>
            <MagicLoginPanel dark={dark} />
          </div>
          <div className="text-xs opacity-70">Your API should set a session cookie and CSRF token on success.</div>
          <div className="text-xs opacity-60 mt-2">
            <div>API base: <code>{apiBase}</code></div>
            <div>API path: <code>{apiPrefix}</code></div>
            <div>Dev proxy: {usingDevProxy? 'on (local only)':'off'}</div>
            {(()=>{ const d = getCsrfDiagnostics(); return (
              <div>
                <div>CSRF token available: {d.token? 'yes':'no'}</div>
                <div className="opacity-75">• cookie readable: {d.cookie? 'yes':'no'}; • memory: {d.memory? 'yes':'no'}</div>
              </div>
            ) })()}
          </div>
        </div>
      </section>
    )
  }

  return (
    <section className={["rounded-2xl p-3 space-y-3", dark?"bg-neutral-900":"bg-white shadow-sm"].join(' ')}>
  <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
        {tabs.map(t=>{
          const active = subtab===t
          const isWip = wipTabs.includes(t)
          return (
            <button
              key={t}
              onClick={()=>setSubtab(t)}
              title={isWip ? `${t} preview — still in progress` : undefined}
              className={[
                "px-3 py-1.5 rounded-lg text-sm border",
                active
                  ? (dark
                      ? "bg-neutral-900 border-neutral-600 text-neutral-200"
                      : "bg-white border-blue-600 text-blue-600")
                  : (dark
                      ? "bg-neutral-900 border-neutral-800 text-neutral-200 hover:bg-neutral-800"
                      : "bg-white border-neutral-200 text-neutral-700 hover:bg-neutral-100")
              ].join(' ')}
            >
              <span className="inline-flex items-center gap-2">
                <span>{t}</span>
                {isWip && (
                  <span
                    className={[
                      "inline-flex items-center gap-1 rounded-md border text-[10px] font-medium px-2 py-[3px] leading-none",
                      dark
                        ? "bg-amber-500/10 border-amber-400/40 text-amber-300"
                        : "bg-amber-50 border-amber-200 text-amber-600"
                    ].join(' ')}
                  >
                    <span aria-hidden className="inline-block h-1.5 w-1.5 rounded-full bg-current"></span>
                    <span>Preview</span>
                  </span>
                )}
              </span>
            </button>
          )
        })}
        </div>

      </div>

{subtab==='Schedule Editor' && (
        <div className={["flex flex-wrap items-center justify-between gap-2 sm:gap-3 text-xs rounded-xl px-2 py-2 border", dark?"bg-neutral-950 border-neutral-800 text-neutral-200":"bg-neutral-50 border-neutral-200 text-neutral-800"].join(' ')}>
          <div className="flex min-w-0 flex-wrap items-center gap-2 sm:gap-3">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="leading-tight">
                <div className="text-xs font-semibold flex items-center gap-1">
                  {isStageMode ? 'Staging mode' : 'Live mode'}
                  {isStageMode && stageChangeCount>0 && (
                    <span className={["inline-flex items-center justify-center rounded-full border px-1.5 py-[1px] text-[10px] font-semibold", dark?"bg-violet-900/50 border-violet-500 text-violet-200":"bg-violet-100 border-violet-300 text-violet-700"].join(' ')}>
                      {stageChangeCount}
                    </span>
                  )}
                </div>
                <div className={modeSubtitleClassName}>
                  {modeSubtitleText}
                </div>
              </div>
              {hasStageInfra && (
                <div className="flex items-center gap-2 ml-2">
                  <Toggle
                    checked={isStageMode}
                    onChange={(next)=> setScheduleMode(next ? 'stage' : 'live')}
                    size="lg"
                    dark={dark}
                    ariaLabel={stageToggleLabel}
                  />
                  <button
                    type="button"
                    onClick={handleStageRefresh}
                    disabled={stageLoading}
                    className={["inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl border text-xs font-medium", stageLoading
                      ? (dark ? "bg-neutral-900 border-neutral-800 text-neutral-500 cursor-not-allowed" : "bg-white border-neutral-200 text-neutral-500 cursor-not-allowed")
                      : (dark ? "bg-neutral-900 border-neutral-700 hover:bg-neutral-800" : "bg-white border-neutral-200 hover:bg-neutral-100")].join(' ')}
                    title="Reload staging snapshot"
                  >
                    {stageLoading ? (
                      <svg aria-hidden className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" opacity="0.25"/><path d="M12 2a10 10 0 0 1 10 10" /></svg>
                    ) : (
                      <svg aria-hidden className={dark?"text-neutral-300":"text-neutral-700"} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.13-3.36L23 10"/><path d="M20.49 15a9 9 0 0 1-14.13 3.36L1 14"/></svg>
                    )}
                    <span>Reload staging</span>
                  </button>
                </div>
              )}
            </div>
            {isStageMode ? (
              <span className={["inline-flex items-center px-2 py-1 rounded-xl border font-medium", stagingStatusBadgeClasses].join(' ')}>
                {stageBadgeText}
              </span>
            ) : (
              <button
                type="button"
                onClick={handleManualPublish}
                disabled={livePublishDisabled}
                title={!isDirty ? 'No unpublished changes' : undefined}
                className={[
                  "inline-flex items-center gap-2 px-2.5 py-1.5 rounded-xl border text-xs font-medium",
                  livePublishDisabled
                    ? (dark ? "bg-neutral-900 border-neutral-800 text-neutral-400 cursor-not-allowed opacity-60" : "bg-white border-neutral-200 text-neutral-500 cursor-not-allowed opacity-60")
                    : (dark ? "bg-blue-600 border-blue-500 text-white hover:bg-blue-500" : "bg-blue-600 border-blue-600 text-white hover:bg-blue-500")
                ].join(' ')}
              >
                {manualPublishPending ? (
                  <svg aria-hidden className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" opacity="0.25"/><path d="M12 2a10 10 0 0 1 10 10" /></svg>
                ) : (
                  <svg aria-hidden width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 13l4 4L19 7"/></svg>
                )}
                <span>{livePublishLabel}</span>
              </button>
            )}
            {isStageMode && (
              <button
                type="button"
                onClick={()=> setShowStageChangesPanel(v=>!v)}
                className={[
                  "inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl border text-xs font-medium",
                  dark ? "bg-neutral-900 border-neutral-700 hover:bg-neutral-800" : "bg-white border-neutral-200 hover:bg-neutral-100"
                ].join(' ')}
              >
                <svg aria-hidden className={dark?"text-violet-300":"text-violet-600"} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                <span>{showStageChangesPanel ? 'Hide staged changes' : `View staged changes${stageChangeEntries.length ? ` (${stageChangeEntries.length})` : ''}`}</span>
              </button>
            )}
            {isStageMode && (
              <button
                type="button"
                onClick={()=> setShowStagePublishConfirm(true)}
                disabled={!canPushStage}
                className={[
                  "inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-medium",
                  !canPushStage
                    ? (dark ? "bg-violet-900/40 border-violet-700/60 text-violet-200 opacity-70 cursor-not-allowed" : "bg-violet-100 border-violet-300 text-violet-600 opacity-70 cursor-not-allowed")
                    : (dark ? "bg-violet-900/40 border-violet-600 text-violet-200 hover:bg-violet-900/60" : "bg-violet-600 text-white border-violet-600 hover:bg-violet-700")
                ].join(' ')}
                title={!canPushStage && stagePublishDisabledReason ? stagePublishDisabledReason : undefined}
              >
                {stagePublishBusy ? (
                  <svg aria-hidden className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" opacity="0.25"/><path d="M12 2a10 10 0 0 1 10 10" /></svg>
                ) : (
                  <svg aria-hidden width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v12"/><path d="M8 7l4-4 4 4"/><path d="M8 15h8"/><path d="M4 19h16"/></svg>
                )}
                <span>Push staging to live</span>
              </button>
            )}
          </div>

          {/* Right: all controls */}
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            {/* View: Sort select (iconified) */}
            <button
              type="button"
              onClick={()=> setSortMode(prev=> prev==='start' ? 'name' : 'start')}
              className={[
                "inline-flex items-center gap-2 px-2.5 py-1.5 rounded-xl border text-xs font-medium",
                dark ? "bg-neutral-900 border-neutral-700 hover:bg-neutral-800" : "bg-white border-neutral-200 hover:bg-neutral-100"
              ].join(' ')}
              title="Toggle agent sort"
            >
              <svg aria-hidden className={dark?"text-neutral-300":"text-neutral-700"} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 6h14"/><path d="M7 12h10"/><path d="M11 18h6"/>
              </svg>
              <span>
                Sort: {sortMode === 'start' ? 'Earliest start' : 'Name (A–Z)'}
              </span>
            </button>
            {/* Toggle: include hidden/off-duty agents (icon button) */}
            <button
              type="button"
              onClick={()=> setIncludeHiddenAgents(v=>!v)}
              aria-pressed={includeHiddenAgents}
              title={includeHiddenAgents?"Hide off-duty agents":"Show off-duty agents"}
              className={[
                "inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl border text-xs font-medium",
                includeHiddenAgents ? (dark?"bg-neutral-900 border-neutral-700 hover:bg-neutral-800":"bg-white border-neutral-300 hover:bg-neutral-100") : (dark?"bg-neutral-900 border-neutral-800 hover:bg-neutral-800":"bg-white border-neutral-200 hover:bg-neutral-100")
              ].join(' ')}
            >
              <svg aria-hidden className={dark?"text-neutral-300":"text-neutral-700"} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                {includeHiddenAgents ? (
                  <>
                    <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7Z"/>
                    <circle cx="12" cy="12" r="3"/>
                  </>
                ) : (
                  <>
                    <path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a21.77 21.77 0 0 1 5.06-5.94"/>
                    <path d="M1 1l22 22"/>
                    <path d="M9.88 9.88A3 3 0 0 0 12 15a3 3 0 0 0 2.12-5.12"/>
                  </>
                )}
              </svg>
            </button>
            {/* Visible days select (1-7) */}
            <div className="inline-flex items-center gap-1" title="Visible days">
              <svg aria-hidden className={dark?"text-neutral-300":"text-neutral-700"} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4"/><path d="M8 2v4"/><path d="M3 10h18"/></svg>
              <div className="relative">
                <select
                  className={["border rounded-xl pl-2 pr-7 py-1 w-[6rem] appearance-none", dark?"bg-neutral-900 border-neutral-700 text-neutral-100":"bg-white border-neutral-300 text-neutral-800"].join(' ')}
                  value={visibleDays}
                  onChange={(e)=> setVisibleDays(Math.max(1, Math.min(7, parseInt(e.target.value,10) || 7)))}
                  aria-label="Visible days"
                >
                  {Array.from({length:7},(_,i)=>i+1).map(n=> (
                    <option key={n} value={n}>{n} day{n===1?'':'s'}</option>
                  ))}
                </select>
                <svg aria-hidden className={"pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 "+(dark?"text-neutral-400":"text-neutral-500")} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
              </div>
              {/* Chunk arrows shown only when fewer than 7 days visible */}
              {visibleDays < 7 && (
                <div className="inline-flex items-center gap-1 ml-1" role="group" aria-label="Scroll days">
                  <button
                    type="button"
                    onClick={()=> setDayChunkIdx(i=> Math.max(0, i-1))}
                    className={["px-2.5 py-1.5 rounded-xl border font-medium", dark?"bg-neutral-900 border-neutral-800 hover:bg-neutral-800":"bg-white border-neutral-200 hover:bg-neutral-100"].join(' ')}
                    title="Earlier days"
                    aria-label="Earlier days"
                    disabled={dayChunkIdx<=0}
                  >
                    <svg aria-hidden className={dayChunkIdx<=0 ? (dark?"text-neutral-600":"text-neutral-400") : (dark?"text-neutral-300":"text-neutral-700")} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
                  </button>
                  <button
                    type="button"
                    onClick={()=> setDayChunkIdx(i=> Math.min(Math.max(1, Math.ceil(7/visibleDays))-1, i+1))}
                    className={["px-2.5 py-1.5 rounded-xl border font-medium", dark?"bg-neutral-900 border-neutral-800 hover:bg-neutral-800":"bg-white border-neutral-200 hover:bg-neutral-100"].join(' ')}
                    title="Later days"
                    aria-label="Later days"
                    disabled={dayChunkIdx>=Math.max(1, Math.ceil(7/visibleDays))-1}
                  >
                    <svg aria-hidden className={dayChunkIdx>=Math.max(1, Math.ceil(7/visibleDays))-1 ? (dark?"text-neutral-600":"text-neutral-400") : (dark?"text-neutral-300":"text-neutral-700")} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
                  </button>
                </div>
              )}
            </div>
            {/* Toggle: show all time labels (icon button) */}
            <button
              type="button"
              onClick={()=> setShowAllTimeLabels(v=>!v)}
              aria-pressed={showAllTimeLabels}
              title="Toggle time labels"
              className={[
                "px-2.5 py-1.5 rounded-xl border font-medium",
                showAllTimeLabels ? (dark?"bg-neutral-900 border-neutral-700 hover:bg-neutral-800":"bg-white border-neutral-300 hover:bg-neutral-100") : (dark?"bg-neutral-900 border-neutral-800 hover:bg-neutral-800":"bg-white border-neutral-200 hover:bg-neutral-100")
              ].join(' ')}
            >
              <svg aria-hidden className={dark?"text-neutral-300":"text-neutral-700"} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
            </button>
            {/* Toggle: show overrides/PTO adjustments */}
            <button
              type="button"
              onClick={()=> setShowScheduleAdjustments(v=>!v)}
              aria-pressed={showScheduleAdjustments}
              title="Toggle overrides/PTO adjustments"
              className={[
                "px-2.5 py-1.5 rounded-xl border font-medium",
                showScheduleAdjustments
                  ? (dark?"bg-emerald-900/40 border-emerald-600 text-emerald-200 hover:bg-emerald-900/60":"bg-emerald-50 border-emerald-300 text-emerald-700 hover:bg-emerald-100")
                  : (dark?"bg-neutral-900 border-neutral-800 hover:bg-neutral-800":"bg-white border-neutral-200 hover:bg-neutral-100")
              ].join(' ')}
            >
              <svg
                aria-hidden
                className={showScheduleAdjustments ? 'text-current' : (dark?"text-neutral-300":"text-neutral-700")}
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="4" y1="6" x2="20" y2="6" />
                <line x1="4" y1="12" x2="20" y2="12" />
                <line x1="4" y1="18" x2="20" y2="18" />
                <circle cx="8" cy="6" r="1.5" />
                <circle cx="16" cy="12" r="1.5" />
                <circle cx="10" cy="18" r="1.5" />
              </svg>
              <span className="ml-1 whitespace-nowrap">Overrides {showScheduleAdjustments ? 'On' : 'Off'}</span>
            </button>
            <div className="inline-flex items-center gap-1 text-[11px]">
              <span className="opacity-60 hidden xl:inline">Week starts</span>
              <div className={["inline-flex rounded-lg overflow-hidden border", dark?"border-neutral-700":"border-neutral-300"].join(' ')}>
                <button
                  type="button"
                  onClick={()=> handleWeekStartModeChange('sun')}
                  className={[
                    "px-2 py-1 text-xs font-medium transition",
                    weekStartMode==='sun'
                      ? (dark?"bg-neutral-900 text-neutral-50":"bg-neutral-200 text-neutral-800")
                      : (dark?"bg-neutral-900/20 text-neutral-300 hover:bg-neutral-800/60":"bg-white text-neutral-600 hover:bg-neutral-100")
                  ].join(' ')}
                >
                  Sun
                </button>
                <button
                  type="button"
                  onClick={()=> handleWeekStartModeChange('mon')}
                  className={[
                    "px-2 py-1 text-xs font-medium transition border-l",
                    dark?"border-neutral-700":"border-neutral-300",
                    weekStartMode==='mon'
                      ? (dark?"bg-neutral-900 text-neutral-50":"bg-neutral-200 text-neutral-800")
                      : (dark?"bg-neutral-900/20 text-neutral-300 hover:bg-neutral-800/60":"bg-white text-neutral-600 hover:bg-neutral-100")
                  ].join(' ')}
                >
                  Mon
                </button>
              </div>
            </div>
            {/* Compliance warnings toggle */}
            <button
              type="button"
              onClick={()=> setShowCompliance(v=>!v)}
              aria-pressed={showCompliance}
              title="Toggle compliance warnings"
              className={["px-2.5 py-1.5 rounded-xl border font-medium", showCompliance ? (dark?"bg-red-950 border-red-700 text-red-200 hover:bg-red-900":"bg-red-50 border-red-300 text-red-700 hover:bg-red-100") : (dark?"bg-neutral-900 border-neutral-800 hover:bg-neutral-800":"bg-white border-neutral-200 hover:bg-neutral-100")].join(' ')}
            >
              <svg aria-hidden width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
            </button>

            {/* Edit: Undo/Redo */}
            <div className="inline-flex items-center gap-1" title="Undo / Redo">
              <button
                type="button"
                disabled={!canUndoShifts}
                onClick={isStageMode ? undoStageShifts : undoShifts}
                className={[
                  "px-2.5 py-1.5 rounded-xl border font-medium",
                  canUndoShifts ? (dark?"bg-neutral-900 border-neutral-700 hover:bg-neutral-800":"bg-white border-neutral-300 hover:bg-neutral-100") : (dark?"bg-neutral-900 border-neutral-800 opacity-50":"bg-white border-neutral-200 opacity-50")
                ].join(' ')}
                title="Undo (Ctrl/Cmd+Z)"
              >
                <svg aria-hidden className={dark?"text-neutral-300":"text-neutral-700"} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 14 4 9 9 4"></polyline><path d="M20 20a8 8 0 0 0-7-12H4"></path></svg>
              </button>
              <button
                type="button"
                disabled={!canRedoShifts}
                onClick={isStageMode ? redoStageShifts : redoShifts}
                className={[
                  "px-2.5 py-1.5 rounded-xl border font-medium",
                  canRedoShifts ? (dark?"bg-neutral-900 border-neutral-700 hover:bg-neutral-800":"bg-white border-neutral-300 hover:bg-neutral-100") : (dark?"bg-neutral-900 border-neutral-800 opacity-50":"bg-white border-neutral-200 opacity-50")
                ].join(' ')}
                title="Redo (Ctrl/Cmd+Shift+Z or Ctrl/Cmd+Y)"
              >
                <svg aria-hidden className={dark?"text-neutral-300":"text-neutral-700"} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 14 20 9 15 4"></polyline><path d="M4 20a8 8 0 0 1 7-12h9"></path></svg>
              </button>
            </div>

          </div>
        </div>
      )}

      {isStageMode && showStagePublishConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-3">
          <div className="absolute inset-0 bg-black/60" aria-hidden onClick={()=> stagePublishBusy ? null : setShowStagePublishConfirm(false)}></div>
          <div className={[
            "relative w-full max-w-md space-y-4 rounded-2xl border p-4 sm:p-6",
            dark?"bg-neutral-900 border-neutral-700 text-neutral-100":"bg-white border-neutral-200 text-neutral-800"
          ].join(' ')} role="dialog" aria-modal="true">
            <div className="space-y-2">
              <div className="text-base font-semibold">Push staging to live</div>
              <p className="text-sm opacity-80">
                This will publish the current staging schedule to the live site for everyone. Are you sure you want to continue?
              </p>
            </div>
            {stageDirty && (
              <div className={["text-xs rounded-lg border px-3 py-2", dark?"bg-amber-900/30 border-amber-600 text-amber-200":"bg-amber-50 border-amber-300 text-amber-700"].join(' ')}>
                Autosave in progress. Wait for staging to finish saving before publishing.
              </div>
            )}
            <div className="rounded-xl border p-3 text-xs">
              <div className="font-semibold mb-1">Pending changes</div>
              <ul className="space-y-1 max-h-32 overflow-y-auto pr-1">
                {stageChangeSummaryLines.map((line, idx)=> (
                  <li key={idx}>{line}</li>
                ))}
              </ul>
            </div>
            {hasLargeStageChange && (
              <div className={["text-xs rounded-lg border px-3 py-2", dark?"bg-amber-900/30 border-amber-600 text-amber-200":"bg-amber-50 border-amber-300 text-amber-700"].join(' ')}>
                {stageChangeCount} changes will be pushed live. Review carefully before confirming.
              </div>
            )}
            {requiresRemovalAck && (
              <label className="flex items-start gap-2 text-xs">
                <input type="checkbox" className="mt-[2px]" checked={stageRemovalAck} onChange={(e)=> setStageRemovalAck(e.target.checked)} />
                <span>
                  I understand this will remove {removalCount} shift{removalCount===1?'':'s'} from the live schedule.
                </span>
              </label>
            )}
            {confirmPublishDisabled && confirmPublishDisabledReason && !stagePublishBusy && (
              <div className={["text-xs rounded-lg border px-3 py-2", dark?"bg-amber-900/30 border-amber-600 text-amber-200":"bg-amber-50 border-amber-300 text-amber-700"].join(' ')}>
                {confirmPublishDisabledReason}
              </div>
            )}
            <div className="flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                onClick={()=> setShowStagePublishConfirm(false)}
                disabled={stagePublishBusy}
                className={[
                  "px-3 py-1.5 rounded-xl border text-xs font-medium",
                  dark?"bg-neutral-900 border-neutral-700 hover:bg-neutral-800":"bg-white border-neutral-200 hover:bg-neutral-100"
                ].join(' ')}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handlePublishStageToLive}
                disabled={confirmPublishDisabled}
                className={[
                  "inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-medium",
                  confirmPublishDisabled
                    ? (dark?"bg-violet-900/40 border-violet-700/70 text-violet-200 opacity-70":"bg-violet-100 border-violet-300 text-violet-600 opacity-70")
                    : (dark?"bg-violet-700 border-violet-500 text-white hover:bg-violet-600":"bg-violet-600 text-white border-violet-600 hover:bg-violet-700")
                ].join(' ')}
                title={confirmPublishDisabledReason || undefined}
              >
                {stagePublishBusy ? (
                  <svg aria-hidden className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" opacity="0.25"/><path d="M12 2a10 10 0 0 1 10 10" /></svg>
                ) : (
                  <svg aria-hidden width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v12"/><path d="M8 7l4-4 4 4"/><path d="M8 15h8"/><path d="M4 19h16"/></svg>
                )}
                <span>Push to live</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {isStageMode && showStageChangesPanel && (
        <div className={["rounded-xl border px-3 py-3 text-sm", dark?"bg-neutral-950 border-neutral-800 text-neutral-100":"bg-neutral-50 border-neutral-200 text-neutral-800"].join(' ')}>
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="font-semibold text-sm">Staged changes</div>
              <div className="text-xs opacity-70">{panelCountText}</div>
            </div>
            <button
              type="button"
              onClick={()=> setShowStageChangesPanel(false)}
              className={["px-2 py-1 rounded-lg border text-[11px] font-medium", dark?"bg-neutral-900 border-neutral-700 hover:bg-neutral-800":"bg-white border-neutral-200 hover:bg-neutral-100"].join(' ')}
            >
              Close
            </button>
          </div>
          {stageChangePersons.length>0 && (
            <div className="mt-3 space-y-2 text-[11px]">
              <div className="flex items-center justify-between font-semibold">
                <span>Filter by agent</span>
                <div className="flex items-center gap-2">
                  <button type="button" onClick={handleSelectAllStageAgents} className={["px-2 py-1 rounded-lg border", dark?"bg-neutral-900 border-neutral-700 hover:bg-neutral-800":"bg-white border-neutral-200 hover:bg-neutral-100"].join(' ')}>All</button>
                  <button type="button" onClick={handleClearStageAgents} className={["px-2 py-1 rounded-lg border", dark?"bg-neutral-900 border-neutral-700 hover:bg-neutral-800":"bg-white border-neutral-200 hover:bg-neutral-100"].join(' ')}>None</button>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {stageChangePersons.map(person=>{
                  const checked = stageFilterAgents === null ? true : stageFilterAgents.has(person)
                  return (
                    <button
                      key={person}
                      type="button"
                      onClick={()=> handleToggleStageFilter(person)}
                      aria-pressed={checked}
                      className={["px-2 py-1 rounded-lg border", checked
                        ? (dark?"bg-violet-900/40 border-violet-600 text-violet-200":"bg-violet-100 border-violet-300 text-violet-700")
                        : (dark?"bg-neutral-900 border-neutral-700 hover:bg-neutral-800":"bg-white border-neutral-200 hover:bg-neutral-100")].join(' ')}
                    >
                      {person}
                    </button>
                  )
                })}
              </div>
            </div>
          )}
          <div className="mt-2 space-y-1.5 max-h-64 overflow-y-auto pr-1">
            {filteredStageCount===0 ? (
              <div className={["text-xs px-3 py-2 rounded-lg border", dark?"bg-neutral-900 border-neutral-800 text-neutral-300":"bg-white border-neutral-200 text-neutral-600"].join(' ')}>
                {panelCountText}
              </div>
            ) : (
              stageFilteredEntries.map(entry=>{
                const { type, person, stage, live } = entry
                const typeLabel = type==='added' ? 'Added' : type==='removed' ? 'Removed' : 'Updated'
                const badgeClass = type==='added'
                  ? (dark ? 'bg-emerald-900/40 border-emerald-600 text-emerald-200' : 'bg-emerald-50 border-emerald-300 text-emerald-700')
                  : type==='removed'
                    ? (dark ? 'bg-red-900/40 border-red-700 text-red-200' : 'bg-red-50 border-red-300 text-red-700')
                    : (dark ? 'bg-violet-900/40 border-violet-600 text-violet-200' : 'bg-violet-50 border-violet-300 text-violet-700')
                const revertLabel = type==='removed' ? 'Restore shift' : 'Remove change'
                const summaryLabel = (()=>{
                  if(type==='updated' && stage && live){
                    return `${briefShiftLabel(live)} → ${briefShiftLabel(stage)}`
                  }
                  if(type==='added' && stage){
                    return briefShiftLabel(stage)
                  }
                  if(type==='removed' && live){
                    return briefShiftLabel(live)
                  }
                  return ''
                })()
                return (
                  <div key={entry.id} className={["rounded-lg border px-3 py-1.5 text-xs", dark?"bg-neutral-900 border-neutral-800":"bg-white border-neutral-200"].join(' ')}>
                    <div className="flex flex-col gap-1.5 lg:flex-row lg:items-center lg:justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 text-sm font-medium">
                          <span className="truncate">{person}</span>
                          <span className={["inline-flex items-center px-2 py-[1px] rounded-md border text-[10px] font-semibold uppercase tracking-wide", badgeClass].join(' ')}>
                            {typeLabel}
                          </span>
                          {summaryLabel && (
                            <span className="inline-flex items-center px-2 py-[1px] rounded-md bg-black/10 dark:bg-white/10 text-[10px] font-medium">
                              {summaryLabel}
                            </span>
                          )}
                        </div>
                        <div className="mt-0.5 text-[11px] grid gap-0.5">
                          {type==='updated' && stage && live && (
                            <>
                              <div className="opacity-70">Live • {describeShiftWindow(live)}</div>
                              <div className="text-violet-500 dark:text-violet-300">Stage • {describeShiftWindow(stage)}</div>
                            </>
                          )}
                          {type==='added' && stage && (
                            <div className="text-violet-500 dark:text-violet-300">Stage • {describeShiftWindow(stage)}</div>
                          )}
                          {type==='removed' && live && (
                            <div className="opacity-70">Live • {describeShiftWindow(live)}</div>
                          )}
                        </div>
                      </div>
                      {hasStageInfra && (
                        <div className="flex shrink-0 items-center gap-2">
                          <button
                            type="button"
                            onClick={()=> handleStageChangeEdit(entry)}
                            className={["px-2 py-1 rounded-lg border font-medium transition", dark?"bg-neutral-900 border-neutral-700 hover:bg-neutral-800":"bg-white border-neutral-300 hover:bg-neutral-100"].join(' ')}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={()=> handleStageChangeRevert(entry)}
                            className={["px-2 py-1 rounded-lg border font-medium transition", dark?"bg-neutral-900 border-neutral-700 hover:bg-neutral-800":"bg-white border-neutral-300 hover:bg-neutral-100"].join(' ')}
                          >
                            {revertLabel}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>
      )}

      {subtab==='Integrations' && (
        <div className={["rounded-xl p-3 border space-y-2", dark?"bg-neutral-950 border-neutral-800":"bg-neutral-50 border-neutral-200"].join(' ')}>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-sm font-semibold">Zoom Phone Connections</div>
              <div className="text-xs opacity-70">Link teammate accounts so the ingester can pull user-scoped call analytics.</div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={loadZoomConnections}
                className={["px-2.5 py-1.5 rounded-xl border text-xs font-medium", dark?"bg-neutral-900 border-neutral-700 hover:bg-neutral-800":"bg-white border-neutral-300 hover:bg-neutral-100"].join(' ')}
              >
                Refresh
              </button>
              <button
                type="button"
                onClick={handleConnectZoom}
                className={["px-2.5 py-1.5 rounded-xl border text-xs font-medium", dark?"bg-blue-500/20 border-blue-400 text-blue-200 hover:bg-blue-500/30":"bg-blue-600 text-white border-blue-600 hover:bg-blue-700"].join(' ')}
              >
                Connect Zoom
              </button>
            </div>
          </div>
          {zoomError && (<div className={["text-xs", dark?"text-red-300":"text-red-600"].join(' ')}>{zoomError}</div>)}
          <div className="space-y-2">
            {zoomLoading && (<div className="text-xs opacity-70">Loading…</div>)}
            {!zoomLoading && zoomConnections.length===0 && (
              <div className={["text-xs px-3 py-2 rounded-lg border", dark?"bg-neutral-900 border-neutral-800 text-neutral-300":"bg-white border-neutral-200 text-neutral-600"].join(' ')}>
                No Zoom accounts linked yet.
              </div>
            )}
            {zoomConnections.map(conn=> (
              <div
                key={conn.id}
                className={["flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between rounded-lg border px-3 py-2", dark?"bg-neutral-900 border-neutral-800":"bg-white border-neutral-200"].join(' ')}
              >
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="text-sm font-semibold truncate">{conn.displayName || conn.email || conn.zoomUserId}</div>
                  <div className="text-xs opacity-70 break-all">Email: {conn.email || '—'}</div>
                  <div className="text-xs opacity-70 break-all">Zoom ID: {conn.zoomUserId}</div>
                  {conn.accountId && (<div className="text-xs opacity-70 break-all">Account: {conn.accountId}</div>)}
                  <div className="text-xs opacity-70">Scope: {conn.scope || '—'}</div>
                  <div className="text-xs opacity-70">Token expires: {formatUnixTs(conn.expiresAt)}</div>
                  <div className="text-xs opacity-70">Last sync: {conn.lastSyncedAt ? formatUnixTs(conn.lastSyncedAt) : '—'}</div>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <button
                    type="button"
                    onClick={()=>handleRemoveZoom(conn.id)}
                    className={["px-2 py-1 text-xs rounded-lg border", dark?"bg-neutral-900 border-neutral-700 hover:bg-neutral-800":"bg-white border-neutral-300 hover:bg-neutral-100"].join(' ')}
                  >
                    Revoke
                  </button>
                  <div className="text-[10px] opacity-60">
                    Updated {formatUnixTs(conn.updatedAt)}
                    {conn.hasSyncCursor ? ' • Cursor retained' : ''}
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="text-[11px] opacity-60">
            Tip: ask teammates to revoke the integration from Zoom’s App Marketplace if they need to expire tokens immediately.
          </div>
          <div className="pt-3 border-t border-neutral-800/30">
            <ZoomAnalyticsMock dark={dark} />
          </div>
          <div className="pt-3 border-t border-neutral-800/30">
            <TeamsCommandsMock dark={dark} />
          </div>
        </div>
      )}

      {subtab==='Clock & Breaks' && (
        <div className={["rounded-xl p-3 border", dark?"bg-neutral-950 border-neutral-800":"bg-neutral-50 border-neutral-200"].join(' ')}>
          <div className="space-y-3">
            <TimeTrackingMock dark={dark} />
            <LunchPlannerMock dark={dark} />
          </div>
        </div>
      )}
      {subtab==='Agents' ? (
        <WeekEditor
          key={`agents-${tz.id}-${weekStart}-${localAgents.length}`}
          dark={dark}
          agents={localAgents}
          onAddAgent={handleAdd}
          onUpdateAgent={handleUpdate}
          onDeleteAgent={handleDelete}
          weekStart={weekStart}
          tz={tz}
          shifts={shifts}
          pto={pto}
          tasks={tasks}
          calendarSegs={calendarSegs}
          onUpdateShift={(id, patch)=>{
            onUpdateShift?.(id, patch)
            // Mirror into Schedule Editor tab when there are no pending local edits
            const noLocalEdits = shiftUndoStack.length===0 && shiftRedoStack.length===0
            if(noLocalEdits){
              setWorkingShifts(prev=> prev.map(s=> s.id===id ? { ...s, ...patch } : s))
            }
          }}
          onDeleteShift={(id)=>{
            onDeleteShift?.(id)
            const noLocalEdits = shiftUndoStack.length===0 && shiftRedoStack.length===0
            if(noLocalEdits){ setWorkingShifts(prev=> prev.filter(s=> s.id!==id)) }
          }}
          onAddShift={(s)=>{
            onAddShift?.(s)
            const noLocalEdits = shiftUndoStack.length===0 && shiftRedoStack.length===0
            if(noLocalEdits){
              setWorkingShifts(prev=> prev.some(x=> x.id===s.id) ? prev : prev.concat([s]))
            }
          }}
          selectedIdx={selectedAgentIdx}
          onSelectIdx={(idx)=> setSelectedAgentIdx(idx)}
        />
      ) : subtab==='Schedule Editor' ? (
        <div className={["rounded-xl p-2 border", dark?"bg-neutral-950 border-neutral-800 text-neutral-200":"bg-neutral-50 border-neutral-200 text-neutral-800"].join(' ')}>
          <AllAgentsWeekRibbons
            dark={dark}
            tz={tz}
            weekStart={weekStart}
            agents={visibleScheduleAgents}
            shifts={scheduleShifts}
            pto={schedulePto}
            /* Hide posture data in this view */
            tasks={undefined as any}
            calendarSegs={undefined as any}
            visibleDays={visibleDays}
            scrollChunk={dayChunkIdx}
            showAllTimeLabels={showAllTimeLabels}
            sortMode={sortMode}
            highlightIds={scheduleHighlightIds}
            complianceHighlightIds={!isStageMode && showCompliance ? complianceHighlightIds : undefined}
            complianceTipsByShiftId={!isStageMode && showCompliance ? (function(){
              const map: Record<string,string[]> = {}
              for(const i of complianceIssues){
                if(!i.shiftId) continue
                const arr = map[i.shiftId] || (map[i.shiftId] = [])
                const ruleName = (i.rule||'').split('_').join(' ')
                const sev = i.severity || 'soft'
                const who = i.person || ''
                const when = i.day ? ` • ${i.day}` : ''
                const details = i.details ? ` — ${i.details}` : ''
                arr.push(`${sev}: ${ruleName}${when}${details}`)
              }
              return map
            })() : undefined}
            selectedIds={selectedShiftIds}
            chipTone={isStageMode ? 'stage' : 'default'}
            highlightColor={adjustmentsHighlightColor}
            onCreateShift={handleCreateShift}
            onToggleSelect={(id)=>{
              setSelectedShiftIds(prev=>{
                const next = new Set(prev)
                if(next.has(id)) next.delete(id); else next.add(id)
                return next
              })
            }}
            onDragAll={(name, delta)=>{
              const sourceShifts = isStageMode ? stageWorkingShifts : workingShifts
              const personsShifts = sourceShifts.filter(s=> s.person===name)
              if(personsShifts.length===0) return
              const prevPatches = personsShifts.map(s=> ({ id: s.id, patch: { day: s.day, start: s.start, end: s.end, endDay: (s as any).endDay } }))
              if(isStageMode) pushStageShiftsUndo(prevPatches)
              else pushShiftsUndo(prevPatches)
              const DAYS_ = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'] as const
              const idxOf = (d:string)=> DAYS_.indexOf(d as any)
              const byIndex = (i:number)=> DAYS_[((i%7)+7)%7] as any
              const toMin = (t:string)=>{ const [h,m]=t.split(':').map(Number); return (h||0)*60+(m||0) }
              const addMin = (t:string, dm:number)=>{
                const [h,m]=t.split(':').map(Number); const tot=((h||0)*60+(m||0)+dm+10080)%1440; const hh=Math.floor(tot/60).toString().padStart(2,'0'); const mm=(tot%60).toString().padStart(2,'0'); return `${hh}:${mm}`
              }
              const moved = personsShifts.map(s=>{
                const sd = idxOf(s.day); const ed = idxOf((s as any).endDay || s.day)
                const sAbs = sd*1440 + toMin(s.start)
                let eAbs = ed*1440 + toMin(s.end); if(eAbs<=sAbs) eAbs+=1440
                const ns = sAbs+delta; const ne = eAbs+delta
                const nsDay = Math.floor(((ns/1440)%7+7)%7)
                const neDay = Math.floor(((ne/1440)%7+7)%7)
                const nsMin = ((ns%1440)+1440)%1440
                const neMin = ((ne%1440)+1440)%1440
                return { ...s, day: byIndex(nsDay), start: addMin('00:00', nsMin), end: addMin('00:00', neMin), endDay: byIndex(neDay) }
              })
              const movedMap = new Map(moved.map(m=> [m.id, m]))
              if(isStageMode){
                updateStageShifts('dragAll:apply', prev=> prev.map(s=> movedMap.get(s.id) || s))
                markStageDirty()
              }else{
                const ids = new Set<string>(modifiedIds)
                setWorkingShifts(prev=> prev.map(s=> movedMap.get(s.id) || s))
                moved.forEach(s=> ids.add(s.id))
                setModifiedIds(ids)
                markDirty()
              }
            }}
            onDragShift={(name, id, delta)=>{
              const DAYS_ = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'] as const
              const idxOf = (d:string)=> DAYS_.indexOf(d as any)
              const byIndex = (i:number)=> DAYS_[((i%7)+7)%7] as any
              const toMin = (t:string)=>{ const [h,m]=t.split(':').map(Number); return (h||0)*60+(m||0) }
              const addMin = (t:string, dm:number)=>{
                const [h,m]=t.split(':').map(Number); const tot=((h||0)*60+(m||0)+dm+10080)%1440; const hh=Math.floor(tot/60).toString().padStart(2,'0'); const mm=(tot%60).toString().padStart(2,'0'); return `${hh}:${mm}`
              }
              const moveIds = new Set<string>(selectedShiftIds)
              moveIds.add(id)
              const sourceShifts = isStageMode ? stageWorkingShifts : workingShifts
              const moveShifts = sourceShifts.filter(s=> moveIds.has(s.id))
              if(moveShifts.length === 0) return
              const prevPatches = moveShifts.map(s=> ({ id: s.id, patch: { day: s.day, start: s.start, end: s.end, endDay: (s as any).endDay } }))
              if(isStageMode) pushStageShiftsUndo(prevPatches)
              else pushShiftsUndo(prevPatches)
              const updates = moveShifts.map(s=>{
                const sd = idxOf(s.day); const ed = idxOf((s as any).endDay || s.day)
                const sAbs = sd*1440 + toMin(s.start)
                let eAbs = ed*1440 + toMin(s.end); if(eAbs<=sAbs) eAbs+=1440
                const ns = sAbs+delta; const ne = eAbs+delta
                const nsDay = Math.floor(((ns/1440)%7+7)%7)
                const neDay = Math.floor(((ne/1440)%7+7)%7)
                const nsMin = ((ns%1440)+1440)%1440
                const neMin = ((ne%1440)+1440)%1440
                return { ...s, day: byIndex(nsDay), start: addMin('00:00', nsMin), end: addMin('00:00', neMin), endDay: byIndex(neDay) }
              })
              if(isStageMode){
                const updatedMap = new Map(updates.map(u=> [u.id, u]))
                updateStageShifts('dragShift:apply', prev=> prev.map(s=> updatedMap.get(s.id) || s))
                markStageDirty()
              }else{
                const updatedMap = new Map(updates.map(u=> [u.id, u]))
                setWorkingShifts(prev=> prev.map(s=> updatedMap.get(s.id) || s))
                const nextModified = new Set<string>(modifiedIds)
                updates.forEach(s=> nextModified.add(s.id))
                setModifiedIds(nextModified)
                markDirty()
              }
            }}
          onResizeShift={(name, id, deltaEdge, delta)=>{
            const DAYS_ = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'] as const
            const idxOf = (d:string)=> DAYS_.indexOf(d as any)
            const byIndex = (i:number)=> DAYS_[((i%7)+7)%7] as any
            const toMin = (t:string)=>{ const [h,m]=t.split(':').map(Number); return (h||0)*60+(m||0) }
            const addMin = (t:string, dm:number)=>{
              const [h,m]=t.split(':').map(Number); const tot=((h||0)*60+(m||0)+dm+10080)%1440; const hh=Math.floor(tot/60).toString().padStart(2,'0'); const mm=(tot%60).toString().padStart(2,'0'); return `${hh}:${mm}`
            }
            const sourceShifts = isStageMode ? stageWorkingShifts : workingShifts
            const s = sourceShifts.find(s=> s.id===id)
            if(!s) return
            const snapshot = [{ id: s.id, patch: { day: s.day, start: s.start, end: s.end, endDay: (s as any).endDay } }]
            if(isStageMode) pushStageShiftsUndo(snapshot)
            else pushShiftsUndo(snapshot)
            const sd = idxOf(s.day); const ed = idxOf((s as any).endDay || s.day)
            const sAbs = sd*1440 + toMin(s.start)
            let eAbs = ed*1440 + toMin(s.end); if(eAbs<=sAbs) eAbs+=1440
            let ns = sAbs; let ne = eAbs
            const MIN = 15
            if(deltaEdge==='start'){
              ns = sAbs + delta
              if(ne - ns < MIN) ns = ne - MIN
            }else{
              ne = eAbs + delta
              if(ne - ns < MIN) ne = ns + MIN
            }
            const nsDay = Math.floor(((ns/1440)%7+7)%7)
            const neDay = Math.floor(((ne/1440)%7+7)%7)
            const nsMin = ((ns%1440)+1440)%1440
            const neMin = ((ne%1440)+1440)%1440
            const patch = { day: byIndex(nsDay), start: addMin('00:00', nsMin), end: addMin('00:00', neMin), endDay: byIndex(neDay) }
            if(isStageMode){
              updateStageShifts('resizeShift:apply', prev=> prev.map(x=> x.id===s.id ? { ...x, ...patch } : x))
              markStageDirty()
            }else{
              setWorkingShifts(prev=> prev.map(x=> x.id===s.id ? { ...x, ...patch } : x))
              setModifiedIds(prev=>{ const n=new Set(prev); n.add(s.id); return n })
              markDirty()
            }
          }}
        />
        {showCompliance && (
          <div className={["mt-2 rounded-xl p-2 border text-xs", dark?"bg-red-950/20 border-red-800 text-red-200":"bg-red-50 border-red-200 text-red-800"].join(' ')}>
            <div className="font-semibold mb-1">Compliance</div>
            {complianceIssues.length===0 ? (
              <div className="opacity-80">No issues detected for this week.</div>
            ) : (
              <ul className="space-y-1 max-h-40 overflow-auto pr-1">
                {complianceIssues.map((i,idx)=> (
                  <li key={idx} className="flex items-start gap-2">
                    <span className={["inline-flex items-center px-1.5 py-0.5 rounded border text-[10px] mt-0.5", i.severity==='hard' ? (dark?"bg-red-900/40 border-red-700":"bg-red-100 border-red-300") : (dark?"bg-amber-900/30 border-amber-700":"bg-amber-100 border-amber-300")].join(' ')}>{i.severity}</span>
                    <span className="truncate">
                      <strong>{i.person}</strong>{i.day?` • ${i.day}`:''}: {(i.rule||'').split('_').join(' ')}{i.details?` — ${i.details}`:''}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
          {(()=>{
            // bottom sticky coverage heatmap aligned with visible agents/days
            const visibleAgents = visibleScheduleAgents
              .map(a=> [a.firstName, a.lastName].filter(Boolean).join(' ').trim())
              .filter(Boolean)
            return (
              <CoverageHeatmap
                dark={dark}
                tz={tz}
                weekStart={weekStart}
                shifts={scheduleShifts}
                visibleAgentNames={visibleAgents}
                visibleDays={visibleDays}
                scrollChunk={dayChunkIdx}
              />
            )
          })()}
        </div>
      ) : (
        subtab==='Postures' ? (
          <div className={["rounded-xl p-3 border", dark?"bg-neutral-950 border-neutral-800 text-neutral-200":"bg-neutral-50 border-neutral-200 text-neutral-800"].join(' ')}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-start">
              {/* Left column: Postures list and assign controls */}
              <div className="md:col-span-1 space-y-3">
                <TaskConfigPanel
                  tasks={tasks}
                  onCreate={(t)=> setTasks(prev=> prev.concat([{ ...t, id: uid() }]))}
                  onUpdate={(t)=> setTasks(prev=> prev.map(x=> x.id===t.id ? t : x))}
                  onArchive={(id)=> setTasks(prev=> prev.map(x=> x.id===id ? { ...x, archived:true } : x))}
                  onDelete={(id)=>{
                    setTasks(prev=> prev.filter(x=> x.id!==id))
                    setCalendarSegs(prev=> prev.filter(cs=> cs.taskId!==id))
                    markDirty()
                  }}
                  dark={dark}
                  selectedId={assignTaskId}
                  onSelect={(id)=> setAssignTaskId(id)}
                />

                <div className={["rounded-xl p-3 border", dark?"border-neutral-800":"border-neutral-200"].join(' ')}>
                  <div className="text-sm font-medium mb-2">Assign posture to agent</div>
                  <div className="grid grid-cols-1 gap-3">
                    <label className="text-sm flex flex-col">
                      <span className="mb-1">Agent</span>
                      <ComboBox
                        value={assignee}
                        onChange={setAssignee}
                        options={allPeople}
                        placeholder="Type or select agent"
                        dark={dark}
                        inputClassName="px-3 py-2"
                      />
                    </label>
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-[1.1fr_1.1fr_1fr_1fr] md:items-end">
                      <label className="text-sm flex flex-col">
                        <span className="mb-1">Day</span>
                        <select className={["w-full border rounded-xl px-3 py-2", dark&&"bg-neutral-900 border-neutral-700 text-neutral-100 focus:border-neutral-500"].filter(Boolean).join(' ')} value={assignDay} onChange={e=>handleAssignDayChange(e.target.value as any)}>
                          {DAYS.map(d=> <option key={d} value={d}>{d}</option>)}
                        </select>
                      </label>
                      <label className="text-sm flex flex-col">
                        <span className="mb-1">End Day</span>
                        <select className={["w-full border rounded-xl px-3 py-2", dark&&"bg-neutral-900 border-neutral-700 text-neutral-100 focus:border-neutral-500"].filter(Boolean).join(' ')} value={assignEndDay} onChange={e=>handleAssignEndDayChange(e.target.value as any)}>
                          {DAYS.map(d=> <option key={d} value={d}>{d}</option>)}
                        </select>
                      </label>
                      <label className="text-sm flex flex-col">
                        <span className="mb-1">Start</span>
                        <input type="time" className={["w-full border rounded-xl px-3 py-2 tabular-nums", dark&&"bg-neutral-900 border-neutral-700 text-neutral-100 focus:border-neutral-500"].filter(Boolean).join(' ')} value={assignStart} onChange={e=>handleAssignStartChange(e.target.value)} />
                      </label>
                      <label className="text-sm flex flex-col">
                        <span className="mb-1">End</span>
                        <input type="time" className={["w-full border rounded-xl px-3 py-2 tabular-nums", dark&&"bg-neutral-900 border-neutral-700 text-neutral-100 focus:border-neutral-500"].filter(Boolean).join(' ')} value={assignEnd} onChange={e=>handleAssignEndChange(e.target.value)} />
                      </label>
                    </div>
                    <button
                      onClick={()=>{
                        if(!assignee) return alert('Choose an agent')
                        if(!assignTaskId) return alert('Choose a posture')
                        const aS = toMin(assignStart), aE = toMin(assignEnd)
                          if(assignEndDay===assignDay && !(aE>aS)) return alert('End must be after start (or choose a later End Day)')
                        const dayShiftsLocal = shiftsForDayInTZ(shifts, assignDay as any, tz.offset).filter(s=>s.person===assignee)
                        const overlaps = dayShiftsLocal.some(s=>{ const sS=toMin(s.start); const sE = s.end==='24:00'?1440:toMin(s.end); return aS < sE && aE > sS })
                        // If no overlapping shift exists, proceed silently; posture may not display until overlap exists
                        setCalendarSegs(prev=> prev.concat([{ person: assignee, agentId: agentIdByName(localAgents as any, assignee), day: assignDay, endDay: assignEndDay, start: assignStart, end: assignEnd, taskId: assignTaskId } as any]))
                        markDirty()
                        const nextStartDay = assignEndDay
                        const nextStartTime = assignEnd
                        setAssignDay(nextStartDay)
                        setAssignStart(nextStartTime)
                        const { endDay: nextDefaultEndDay, endTime: nextDefaultEnd } = computeDefaultPostureEnd(nextStartDay, nextStartTime)
                        setAssignEnd(nextDefaultEnd)
                        setAssignEndDay(nextDefaultEndDay)
                      }}
                      className={["h-10 rounded-xl border font-medium px-4", dark?"bg-neutral-800 border-neutral-700":"bg-blue-600 border-blue-600 text-white"].join(' ')}
                    >Add assignment</button>
                  </div>
                </div>
              </div>

              {/* Right column: Assigned list (compact) */}
              <div className="md:col-span-1 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-medium">Assigned postures</div>
                  {assignTaskId && (
                    <div className="text-xs opacity-70">
                      Filtered to: {tasks.find(t=>t.id===assignTaskId)?.name || assignTaskId}
                    </div>
                  )}
                </div>
                {(()=>{
                  const dayIndex = new Map(DAYS.map((d,i)=>[d,i]))
                  const segs = calendarSegs.map((cs,_idx)=> ({...cs, _idx}))
                  const visiblePostures = tasks.filter(t=> !t.archived && (!assignTaskId || t.id===assignTaskId))
                  const sections: JSX.Element[] = []
                  for(const t of visiblePostures){
                    const pSegs = segs.filter(s=> s.taskId===t.id)
                    if(pSegs.length===0) continue
                    const byPerson = new Map<string, typeof pSegs>()
                    for(const s of pSegs){ const arr = byPerson.get(s.person) || []; arr.push(s); byPerson.set(s.person, arr) }
                    const people = Array.from(byPerson.keys()).sort()
                    sections.push(
                      <div key={t.id} className={["rounded-xl border overflow-hidden", dark?"border-neutral-800":"border-neutral-200"].join(' ')}>
                        <div className={["px-3 py-2 flex items-center justify-between rounded-t-xl", dark?"bg-neutral-900":"bg-white"].join(' ')}>
                          <span className="inline-flex items-center gap-2">
                            <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: t.color || '#888' }}></span>
                            <span className="font-medium text-sm">{t.name}</span>
                          </span>
                          <span className="text-xs opacity-70">{pSegs.length} item{pSegs.length===1?'':'s'}</span>
                        </div>
                        <div className={"divide-y " + (dark?"divide-neutral-800":"divide-neutral-200")}>
                          {people.map(person=>{
                            const rows = byPerson.get(person)!.slice().sort((a,b)=>{
                              const dA = (dayIndex.get(a.day as any) ?? 0) - (dayIndex.get(b.day as any) ?? 0)
                              if(dA!==0) return dA
                              const tA = toMin(a.start) - toMin(b.start)
                              if(tA!==0) return tA
                              return a.end.localeCompare(b.end)
                            })
                            return (
                              <details key={person}>
                                <summary className={["px-3 py-1.5 cursor-pointer select-none flex items-center justify-between", dark?"hover:bg-neutral-900":"hover:bg-neutral-50"].join(' ')}>
                                  <span className="text-sm">{agentDisplayName(localAgents as any, rows[0]?.agentId, person)}</span>
                                  <span className="text-xs opacity-70">{rows.length} shift{rows.length===1?'':'s'}</span>
                                </summary>
                                <div className="px-3 py-1.5 space-y-1">
                                  {rows.map(r=> (
                  <div key={`${r._idx}-${r.day}-${r.start}-${r.end}`} className="flex items-center justify-between gap-2 text-sm">
                                      <div className="flex items-center gap-3">
                    <span className="w-[12ch] opacity-70">{r.day}{(r as any).endDay && (r as any).endDay !== r.day ? ` → ${(r as any).endDay}` : ''}</span>
                    <span className="w-[11ch] tabular-nums">{r.start}–{r.end}</span>
                                      </div>
                                      <div className="shrink-0 flex gap-1.5">
                    <button onClick={()=>{ setEditingIdx(r._idx); setEaPerson(r.person); setEaDay(r.day as any); setEaStart(r.start); setEaEnd(r.end); setEaTaskId(r.taskId); setEaEndDay((r as any).endDay || (r.day as any)) }} className={["px-2 py-1 rounded border text-xs", dark?"border-neutral-700":"border-neutral-300"].join(' ')}>Edit</button>
                                        <button onClick={()=>{ if(confirm('Remove this assignment?')){ setCalendarSegs(prev=> prev.filter((_,i)=> i!==r._idx)); markDirty() } }} className={["px-2 py-1 rounded border text-xs", "bg-red-600 border-red-600 text-white"].join(' ')}>Delete</button>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </details>
                            )
                          })}
                        </div>
                      </div>
                    )
                  }
                  if(sections.length===0){
                    return <div className="text-sm opacity-70">No assigned postures.</div>
                  }
                  // Fix container height to avoid layout jump when expanding/collapsing
                  return <div className="space-y-3 h-[28rem] overflow-auto pr-1">{sections}</div>
                })()}

                {/* Inline editor row */}
                {editingIdx!=null && (
                  <div className={["rounded-xl p-3 border", dark?"border-neutral-800 bg-neutral-900":"border-neutral-200 bg-white"].join(' ')}>
                    <div className="text-sm font-medium mb-2">Edit assignment</div>
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-[1.6fr_1.8fr_1fr_1fr_1fr_1fr] md:items-end">
                      <label className="text-sm flex flex-col">
                        <span className="mb-1">Agent</span>
                        <ComboBox
                          value={eaPerson}
                          onChange={setEaPerson}
                          options={allPeople}
                          placeholder="Type or select agent"
                          dark={dark}
                          inputClassName="px-2 py-1"
                        />
                      </label>
                      <label className="text-sm flex flex-col">
                        <span className="mb-1">Posture</span>
                        <select className={["w-full border rounded px-2 py-1", dark&&"bg-neutral-900 border-neutral-700 text-neutral-100 focus:border-neutral-500"].filter(Boolean).join(' ')} value={eaTaskId} onChange={e=>setEaTaskId(e.target.value)}>
                          {tasks.filter(t=>!t.archived).map(t=> <option key={t.id} value={t.id}>{t.name}</option>)}
                        </select>
                      </label>
                      <label className="text-sm flex flex-col">
                        <span className="mb-1">Day</span>
                        <select className={["w-full border rounded px-2 py-1", dark&&"bg-neutral-900 border-neutral-700 text-neutral-100 focus:border-neutral-500"].filter(Boolean).join(' ')} value={eaDay} onChange={e=>setEaDay(e.target.value as any)}>
                          {DAYS.map(d=> <option key={d} value={d}>{d}</option>)}
                        </select>
                      </label>
                      <label className="text-sm flex flex-col">
                        <span className="mb-1">End Day</span>
                        <select className={["w-full border rounded px-2 py-1", dark&&"bg-neutral-900 border-neutral-700 text-neutral-100 focus:border-neutral-500"].filter(Boolean).join(' ')} value={eaEndDay} onChange={e=>setEaEndDay(e.target.value as any)}>
                          {DAYS.map(d=> <option key={d} value={d}>{d}</option>)}
                        </select>
                      </label>
                      <label className="text-sm flex flex-col"><span className="mb-1">Start</span><input type="time" className={["w-full border rounded px-2 py-1 tabular-nums", dark&&"bg-neutral-900 border-neutral-700 text-neutral-100 focus:border-neutral-500"].filter(Boolean).join(' ')} value={eaStart} onChange={e=>setEaStart(e.target.value)} /></label>
                      <label className="text-sm flex flex-col"><span className="mb-1">End</span><input type="time" className={["w-full border rounded px-2 py-1 tabular-nums", dark&&"bg-neutral-900 border-neutral-700 text-neutral-100 focus:border-neutral-500"].filter(Boolean).join(' ')} value={eaEnd} onChange={e=>setEaEnd(e.target.value)} /></label>
                      <div className="md:col-span-full flex gap-2">
                        <button onClick={()=>{
                          if(editingIdx==null) return
                          if(!eaPerson.trim()) return alert('Choose an agent')
                          if(!eaTaskId) return alert('Choose a posture')
                          const aS=toMin(eaStart), aE=toMin(eaEnd)
                          if(eaEndDay===eaDay && !(aE>aS)) return alert('End must be after start (or choose a later End Day)')
                          const dayShiftsLocal = shiftsForDayInTZ(shifts, eaDay as any, tz.offset).filter(s=>s.person===eaPerson)
                          const overlaps = dayShiftsLocal.some(s=>{ const sS=toMin(s.start); const sE=s.end==='24:00'?1440:toMin(s.end); return aS < sE && aE > sS })
                          // If no overlapping shift exists, proceed silently; posture may not display until overlap exists
                          setCalendarSegs(prev=> prev.map((cs,i)=> i===editingIdx ? { person: eaPerson.trim(), agentId: agentIdByName(localAgents as any, eaPerson.trim()), day: eaDay, endDay: eaEndDay, start: eaStart, end: eaEnd, taskId: eaTaskId } as any : cs))
                          markDirty()
                          setEditingIdx(null)
                        }} className={["px-3 py-1.5 rounded border text-sm", dark?"bg-neutral-800 border-neutral-700":"bg-blue-600 border-blue-600 text-white"].join(' ')}>Save</button>
                        <button onClick={()=>setEditingIdx(null)} className={["px-3 py-1.5 rounded border text-sm", dark?"border-neutral-700":"border-neutral-300"].join(' ')}>Cancel</button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Bottom calendars: one per populated posture (packed) */}
            <div className="mt-3 space-y-3">
              {activeTasks
                .filter(t=> calendarSegs.some(cs=> cs.taskId===t.id))
                .sort((a,b)=> a.name.localeCompare(b.name))
                .map(t=> (
                  <WeeklyPosturesCalendar
                    key={t.id}
                    dark={dark}
                    weekStart={weekStart}
                    calendarSegs={calendarSegs}
                    tasks={tasks}
                    agents={localAgents as any}
                    filterTaskId={t.id}
                    packed
                    title={`Weekly ${t.name} calendar`}
                    subtitle={`All times ${tz.label}`}
                  />
                ))}
            </div>
          </div>
        ) : subtab==='PTO & Overrides' ? (
          <div>
            <div className="flex flex-col sm:flex-row gap-3 items-start">
              <div className="space-y-4 flex-1 min-w-0">
              <section className={["rounded-lg border overflow-hidden", dark ? "border-neutral-800 bg-neutral-950" : "border-neutral-200 bg-white"].join(' ')}>
                <div className={["flex items-center justify-between px-3 py-2 border-b", dark ? "border-neutral-800 bg-neutral-900 text-neutral-100" : "border-neutral-200 bg-neutral-50 text-neutral-800"].join(' ')}>
                  <span className="text-sm font-semibold">PTO entries</span>
                  <span className="text-xs opacity-70">{filteredPto.length} total</span>
                </div>
                <div className="px-3 py-3 space-y-4">
                  <form
                    className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm"
                    onSubmit={(e)=>{
                      e.preventDefault()
                      const person = pt_agent.trim()
                      if(!person){ alert('Choose an agent'); return }
                      if(!pt_start || !pt_end){ alert('Choose start and end dates'); return }
                      if(pt_end < pt_start){ alert('End date must be on/after start date'); return }
                      const newItem: PTO = { id: uid(), person, agentId: agentIdByName(localAgents as any, person), startDate: pt_start, endDate: pt_end, notes: pt_notes.trim() ? pt_notes.trim() : undefined }
                      setWorkingPto(prev=> prev.concat([newItem]))
                      setPtAgent(''); setPtStart(''); setPtEnd(''); setPtNotes('')
                      markDirty()
                    }}
                  >
                    <label className="flex flex-col gap-1">
                      <span className="text-xs font-medium uppercase tracking-wide opacity-70">Agent</span>
                      <ComboBox
                        value={pt_agent}
                        onChange={(next)=> setPtAgent(next)}
                        options={allPeople}
                        placeholder="Type or select agent"
                        dark={dark}
                      />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="text-xs font-medium uppercase tracking-wide opacity-70">Start date</span>
                      <input
                        type="date"
                        className={["w-full border rounded-lg px-2 py-1.5", dark ? "bg-neutral-900 border-neutral-700 text-neutral-100" : "bg-white border-neutral-300 text-neutral-800"].join(' ')}
                        value={pt_start}
                        onChange={(e)=> setPtStart(e.target.value)}
                      />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="text-xs font-medium uppercase tracking-wide opacity-70">End date</span>
                      <input
                        type="date"
                        className={["w-full border rounded-lg px-2 py-1.5", dark ? "bg-neutral-900 border-neutral-700 text-neutral-100" : "bg-white border-neutral-300 text-neutral-800"].join(' ')}
                        value={pt_end}
                        onChange={(e)=> setPtEnd(e.target.value)}
                      />
                    </label>
                    <div className="md:col-span-3 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
                      <label className="flex flex-col gap-1 md:flex-1">
                        <span className="text-xs font-medium uppercase tracking-wide opacity-70">Notes</span>
                        <input
                          type="text"
                          placeholder="Optional"
                          className={["w-full border rounded-lg px-2 py-1.5", dark ? "bg-neutral-900 border-neutral-700 text-neutral-100" : "bg-white border-neutral-300 text-neutral-800"].join(' ')}
                          value={pt_notes}
                          onChange={(e)=> setPtNotes(e.target.value)}
                        />
                      </label>
                      <div className="flex justify-end gap-2">
                        <button
                          type="submit"
                          className={["inline-flex items-center rounded-lg px-3 py-2 text-sm font-medium border", dark ? "bg-neutral-900 border-neutral-700 text-neutral-100 hover:bg-neutral-800" : "bg-blue-600 border-blue-600 text-white hover:bg-blue-500"].join(' ')}
                        >Add PTO</button>
                      </div>
                    </div>
                  </form>
                  <div className="overflow-x-auto">
                    {filteredPto.length===0 ? (
                      <div className="text-sm opacity-70 px-1 py-4">No PTO entries.</div>
                    ) : (
                      <table className="min-w-full text-sm">
                        <thead className={dark?"bg-neutral-900":"bg-neutral-50"}>
                          <tr>
                            <th className="px-3 py-2 text-left text-xs font-semibold">Agent</th>
                            <th className="px-3 py-2 text-left text-xs font-semibold">Dates</th>
                            <th className="px-3 py-2 text-left text-xs font-semibold">Notes</th>
                            <th className="px-3 py-2 text-right text-xs font-semibold w-32">Actions</th>
                          </tr>
                        </thead>
                        <tbody className={dark?"divide-y divide-neutral-800":"divide-y divide-neutral-200"}>
                          {filteredPto.map(r=>{
                            const display = agentDisplayName(localAgents as any, r.agentId, r.person)
                            return (
                              <tr key={r.id} className={dark?"hover:bg-neutral-900":"hover:bg-neutral-50"}>
                                <td className="px-3 py-2 font-medium">{display}</td>
                                <td className="px-3 py-2 tabular-nums">{r.startDate} → {r.endDate}</td>
                                <td className="px-3 py-2 text-xs">{r.notes ? <span className="opacity-80">{r.notes}</span> : <span className="opacity-50">—</span>}</td>
                                <td className="px-3 py-2">
                                  <div className="flex justify-end gap-2">
                                    <button
                                      type="button"
                                      className={["px-2 py-1 rounded border text-xs", dark ? "border-neutral-700 text-neutral-100 hover:bg-neutral-900" : "border-neutral-300 text-neutral-700 hover:bg-neutral-100"].join(' ')}
                                      onClick={()=> startPtoEdit(r)}
                                    >Edit</button>
                                    <button
                                      type="button"
                                      className={["px-2 py-1 rounded border text-xs", "bg-red-600 border-red-600 text-white hover:bg-red-500"].join(' ')}
                                      onClick={()=>{
                                        if(confirm('Delete PTO?')){
                                          setWorkingPto(prev=> prev.filter(x=> x.id!==r.id))
                                          markDirty()
                                        }
                                      }}
                                    >Delete</button>
                                  </div>
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    )}
                  </div>
                </div>
              </section>
              {ptoEditing && (
                <section className={["rounded-lg border overflow-hidden", dark?"border-neutral-800 bg-neutral-950":"border-neutral-200 bg-white"].join(' ')}>
                  <div className={["flex items-center justify-between px-3 py-2 border-b", dark?"border-neutral-800 bg-neutral-900 text-neutral-100":"border-neutral-200 bg-neutral-50 text-neutral-800"].join(' ')}>
                    <span className="text-sm font-semibold">Edit PTO</span>
                    <span className="text-xs opacity-70">{agentDisplayName(localAgents as any, ptoEditing.agentId, ptoEditing.person)}</span>
                  </div>
                  <form
                    className="px-3 py-3 grid grid-cols-1 md:grid-cols-3 gap-3 text-sm"
                    onSubmit={(e)=>{
                      e.preventDefault()
                      if(!ptoEditing) return
                      if(!pt_e_person.trim()) return alert('Choose an agent')
                      if(!pt_e_start || !pt_e_end) return alert('Choose start/end')
                      if(pt_e_end < pt_e_start) return alert('End date must be on/after start date')
                      setWorkingPto(prev=> prev.map(x=> x.id===ptoEditing.id ? {
                        ...x,
                        person: pt_e_person.trim(),
                        agentId: agentIdByName(localAgents as any, pt_e_person.trim()),
                        startDate: pt_e_start,
                        endDate: pt_e_end,
                        notes: pt_e_notes.trim() ? pt_e_notes.trim() : undefined
                      } : x))
                      clearPtoEdit()
                      markDirty()
                    }}
                  >
                    <label className="flex flex-col gap-1">
                      <span className="text-xs font-medium uppercase tracking-wide opacity-70">Agent</span>
                      <ComboBox
                        value={pt_e_person}
                        onChange={(next)=> setPtEPerson(next)}
                        options={allPeople}
                        placeholder="Type or select agent"
                        dark={dark}
                      />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="text-xs font-medium uppercase tracking-wide opacity-70">Start date</span>
                      <input
                        type="date"
                        className={["w-full border rounded-lg px-2 py-1.5", dark ? "bg-neutral-900 border-neutral-700 text-neutral-100" : "bg-white border-neutral-300 text-neutral-800"].join(' ')}
                        value={pt_e_start}
                        onChange={(e)=> setPtEStart(e.target.value)}
                      />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="text-xs font-medium uppercase tracking-wide opacity-70">End date</span>
                      <input
                        type="date"
                        className={["w-full border rounded-lg px-2 py-1.5", dark ? "bg-neutral-900 border-neutral-700 text-neutral-100" : "bg-white border-neutral-300 text-neutral-800"].join(' ')}
                        value={pt_e_end}
                        onChange={(e)=> setPtEEnd(e.target.value)}
                      />
                    </label>
                    <div className="md:col-span-3 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
                      <label className="flex flex-col gap-1 md:flex-1">
                        <span className="text-xs font-medium uppercase tracking-wide opacity-70">Notes</span>
                        <input
                          type="text"
                          className={["w-full border rounded-lg px-2 py-1.5", dark ? "bg-neutral-900 border-neutral-700 text-neutral-100" : "bg-white border-neutral-300 text-neutral-800"].join(' ')}
                          value={pt_e_notes}
                          onChange={(e)=> setPtENotes(e.target.value)}
                        />
                      </label>
                      <div className="flex justify-end gap-2">
                        <button
                          type="submit"
                          className={["px-3 py-2 rounded-lg text-sm font-medium border", dark ? "bg-neutral-900 border-neutral-700 text-neutral-100 hover:bg-neutral-800" : "bg-blue-600 border-blue-600 text-white hover:bg-blue-500"].join(' ')}
                        >Save</button>
                        <button
                          type="button"
                          className={["px-3 py-2 rounded-lg text-sm font-medium border", dark ? "border-neutral-700 text-neutral-200 hover:bg-neutral-900" : "border-neutral-300 text-neutral-700 hover:bg-neutral-100"].join(' ')}
                          onClick={clearPtoEdit}
                        >Cancel</button>
                      </div>
                    </div>
                  </form>
                </section>
              )}
            </div>
              <div className="space-y-4 flex-1 min-w-0">
                <section className={["rounded-lg border overflow-hidden", dark ? "border-neutral-800 bg-neutral-950" : "border-neutral-200 bg-white"].join(' ')}>
                  <div className={["flex items-center justify-between px-3 py-2 border-b", dark ? "border-neutral-800 bg-neutral-900 text-neutral-100" : "border-neutral-200 bg-neutral-50 text-neutral-800"].join(' ')}>
                    <span className="text-sm font-semibold">Overrides</span>
                    <span className="text-xs opacity-70">{filteredOverrides.length} total</span>
                  </div>
                <div className="px-3 py-3 space-y-4">
                  <form
                    className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-3 text-sm"
                    onSubmit={(e)=>{
                      e.preventDefault()
                      const person = ov_agent.trim()
                      if(!person){ alert('Choose an agent'); return }
                      if(!ov_start || !ov_end){ alert('Choose start and end dates'); return }
                      if(ov_end < ov_start){ alert('End date must be on/after start date'); return }
                      if((ov_tstart && !ov_tend) || (!ov_tstart && ov_tend)){ alert('Provide both start and end times, or leave both blank'); return }
                      const entry: Override = {
                        id: uid(),
                        person,
                        agentId: agentIdByName(localAgents as any, person),
                        startDate: ov_start,
                        endDate: ov_end,
                        start: ov_tstart || undefined,
                        end: ov_tend || undefined,
                        kind: ov_kind.trim() ? ov_kind.trim() : undefined,
                        notes: ov_notes.trim() ? ov_notes.trim() : undefined,
                        recurrence: ov_recurring ? { rule: 'weekly', until: ov_until || undefined } : undefined
                      }
                      setWorkingOverrides(prev=> prev.concat([entry]))
                      setOvAgent(''); setOvStart(''); setOvEnd(''); setOvTStart(''); setOvTEnd(''); setOvKind(''); setOvNotes(''); setOvRecurring(false); setOvUntil('')
                      markDirty()
                    }}
                  >
                    <label className="flex flex-col gap-1 lg:col-span-2">
                      <span className="text-xs font-medium uppercase tracking-wide opacity-70">Agent</span>
                      <ComboBox
                        value={ov_agent}
                        onChange={(next)=> setOvAgent(next)}
                        options={allPeople}
                        placeholder="Type or select agent"
                        dark={dark}
                      />
                    </label>
                    <label className="flex flex-col gap-1 lg:col-span-2">
                      <span className="text-xs font-medium uppercase tracking-wide opacity-70">Start date</span>
                      <input
                        type="date"
                        className={["w-full border rounded-lg px-2 py-1.5", dark ? "bg-neutral-900 border-neutral-700 text-neutral-100" : "bg-white border-neutral-300 text-neutral-800"].join(' ')}
                        value={ov_start}
                        onChange={(e)=> setOvStart(e.target.value)}
                      />
                    </label>
                    <label className="flex flex-col gap-1 lg:col-span-2">
                      <span className="text-xs font-medium uppercase tracking-wide opacity-70">End date</span>
                      <input
                        type="date"
                        className={["w-full border rounded-lg px-2 py-1.5", dark ? "bg-neutral-900 border-neutral-700 text-neutral-100" : "bg-white border-neutral-300 text-neutral-800"].join(' ')}
                        value={ov_end}
                        onChange={(e)=> setOvEnd(e.target.value)}
                      />
                    </label>
                    <label className="flex flex-col gap-1 lg:col-span-2">
                      <span className="text-xs font-medium uppercase tracking-wide opacity-70">Start time (optional)</span>
                      <input
                        type="time"
                        className={["w-full border rounded-lg px-2 py-1.5 text-left", dark ? "bg-neutral-900 border-neutral-700 text-neutral-100" : "bg-white border-neutral-300 text-neutral-800"].join(' ')}
                        value={ov_tstart}
                        onChange={(e)=>{
                          const val = e.target.value
                          const addMin = (t:string, m:number)=> minToHHMM(((toMin(t)+m)%1440+1440)%1440)
                          const prevDefault = ov_tstart ? addMin(ov_tstart, 510) : null
                          setOvTStart(val)
                          if(val){
                            const nextDefault = addMin(val, 510)
                            if(!ov_tend || (prevDefault && ov_tend===prevDefault)){
                              setOvTEnd(nextDefault)
                            }
                          }
                        }}
                      />
                    </label>
                    <label className="flex flex-col gap-1 lg:col-span-2">
                      <span className="text-xs font-medium uppercase tracking-wide opacity-70">End time (optional)</span>
                      <input
                        type="time"
                        className={["w-full border rounded-lg px-2 py-1.5 text-left", dark ? "bg-neutral-900 border-neutral-700 text-neutral-100" : "bg-white border-neutral-300 text-neutral-800"].join(' ')}
                        value={ov_tend}
                        onChange={(e)=> setOvTEnd(e.target.value)}
                      />
                    </label>
                    <label className="flex flex-col gap-1 lg:col-span-3">
                      <span className="text-xs font-medium uppercase tracking-wide opacity-70">Kind</span>
                      <input
                        type="text"
                        placeholder="e.g., Swap, Half-day"
                        className={["w-full border rounded-lg px-2 py-1.5", dark ? "bg-neutral-900 border-neutral-700 text-neutral-100" : "bg-white border-neutral-300 text-neutral-800"].join(' ')}
                        value={ov_kind}
                        onChange={(e)=> setOvKind(e.target.value)}
                      />
                    </label>
                    <label className="flex flex-col gap-1 lg:col-span-3">
                      <span className="text-xs font-medium uppercase tracking-wide opacity-70">Notes</span>
                      <input
                        type="text"
                        placeholder="Optional"
                        className={["w-full border rounded-lg px-2 py-1.5", dark ? "bg-neutral-900 border-neutral-700 text-neutral-100" : "bg-white border-neutral-300 text-neutral-800"].join(' ')}
                        value={ov_notes}
                        onChange={(e)=> setOvNotes(e.target.value)}
                      />
                    </label>
                    <div className="flex flex-wrap items-center gap-3 lg:col-span-6">
                      <label className="inline-flex items-center gap-2 text-sm">
                        <Toggle ariaLabel="Weekly recurrence" dark={dark} size="md" checked={ov_recurring} onChange={(v)=> setOvRecurring(v)} />
                        <span>Weekly recurrence</span>
                      </label>
                      {ov_recurring && (
                        <label className="flex items-center gap-2 text-sm">
                          <span className="opacity-70">Until</span>
                          <input
                            type="date"
                            className={["border rounded-lg px-2 py-1.5", dark ? "bg-neutral-900 border-neutral-700 text-neutral-100" : "bg-white border-neutral-300 text-neutral-800"].join(' ')}
                            value={ov_until}
                            onChange={(e)=> setOvUntil(e.target.value)}
                          />
                        </label>
                      )}
                      <button
                        type="submit"
                        className={["ml-auto inline-flex items-center rounded-lg px-3 py-2 text-sm font-medium border", dark ? "bg-blue-600 border-blue-600 text-white hover:opacity-95" : "bg-blue-600 border-blue-600 text-white hover:bg-blue-500"].join(' ')}
                      >Add Override</button>
                    </div>
                  </form>
                  <div className="overflow-x-auto">
                    {filteredOverrides.length===0 ? (
                      <div className="text-sm opacity-70 px-1 py-4">No overrides.</div>
                    ) : (
                      <table className="min-w-full text-sm">
                        <thead className={dark?"bg-neutral-900":"bg-neutral-50"}>
                          <tr>
                            <th className="px-3 py-2 text-left text-xs font-semibold">Agent</th>
                            <th className="px-3 py-2 text-left text-xs font-semibold">Dates</th>
                            <th className="px-3 py-2 text-left text-xs font-semibold">Details</th>
                            <th className="px-3 py-2 text-left text-xs font-semibold">Recurrence</th>
                            <th className="px-3 py-2 text-right text-xs font-semibold w-32">Actions</th>
                          </tr>
                        </thead>
                        <tbody className={dark?"divide-y divide-neutral-800":"divide-y divide-neutral-200"}>
                          {filteredOverrides.map(o=>{
                            const display = agentDisplayName(localAgents as any, o.agentId, o.person)
                            const recurrenceText = o.recurrence?.rule==='weekly'
                              ? `Weekly${o.recurrence.until ? ` until ${o.recurrence.until}` : ''}`
                              : '—'
                            return (
                              <tr key={o.id} className={dark?"hover:bg-neutral-900":"hover:bg-neutral-50"}>
                                <td className="px-3 py-2 font-medium">{display}</td>
                                <td className="px-3 py-2 tabular-nums">
                                  {o.startDate} → {o.endDate}
                                  {o.start && o.end && (
                                    <div className="text-xs opacity-70">{o.start}–{o.end}</div>
                                  )}
                                </td>
                                <td className="px-3 py-2 text-xs">
                                  {o.kind && <div className="font-medium">{o.kind}</div>}
                                  {o.notes && <div className="opacity-70 truncate">{o.notes}</div>}
                                  {!o.kind && !o.notes && <span className="opacity-50">—</span>}
                                </td>
                                <td className="px-3 py-2 text-xs opacity-80">{recurrenceText}</td>
                                <td className="px-3 py-2">
                                  <div className="flex justify-end gap-2">
                                    <button
                                      type="button"
                                      className={["px-2 py-1 rounded border text-xs", dark ? "border-neutral-700 text-neutral-200 hover:bg-neutral-900" : "border-neutral-300 text-neutral-700 hover:bg-neutral-100"].join(' ')}
                                      onClick={()=> startOverrideEdit(o)}
                                    >Edit</button>
                                    <button
                                      type="button"
                                      className={["px-2 py-1 rounded border text-xs", "bg-red-600 border-red-600 text-white hover:bg-red-500"].join(' ')}
                                      onClick={()=>{
                                        if(confirm('Delete override?')){
                                          setWorkingOverrides(prev=> prev.filter(x=> x.id!==o.id))
                                          markDirty()
                                          if(overrideEditing && overrideEditing.id===o.id){
                                            clearOverrideEdit()
                                          }
                                        }
                                      }}
                                    >Delete</button>
                                  </div>
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    )}
                  </div>
                </div>
              </section>
              {overrideEditing && (
                <section className={["rounded-lg border overflow-hidden", dark ? "border-neutral-800 bg-neutral-950" : "border-neutral-200 bg-white"].join(' ')}>
                  <div className={["flex items-center justify-between px-3 py-2 border-b", dark ? "border-neutral-800 bg-neutral-900 text-neutral-100" : "border-neutral-200 bg-neutral-50 text-neutral-800"].join(' ')}>
                    <span className="text-sm font-semibold">Edit Override</span>
                    <span className="text-xs opacity-70">{agentDisplayName(localAgents as any, overrideEditing.agentId, overrideEditing.person)}</span>
                  </div>
                  <form
                    className="px-3 py-3 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-3 text-sm"
                    onSubmit={(e)=>{
                      e.preventDefault()
                      if(!overrideEditing) return
                      const person = ov_e_agent.trim()
                      if(!person){ alert('Choose an agent'); return }
                      if(!ov_e_start || !ov_e_end){ alert('Choose start and end dates'); return }
                      if(ov_e_end < ov_e_start){ alert('End date must be on/after start date'); return }
                      if((ov_e_tstart && !ov_e_tend) || (!ov_e_tstart && ov_e_tend)){ alert('Provide both start and end times, or leave both blank'); return }
                      setWorkingOverrides(prev=> prev.map(x=> x.id===overrideEditing.id ? {
                        ...x,
                        person,
                        agentId: agentIdByName(localAgents as any, person),
                        startDate: ov_e_start,
                        endDate: ov_e_end,
                        start: ov_e_tstart || undefined,
                        end: ov_e_tend || undefined,
                        kind: ov_e_kind.trim() ? ov_e_kind.trim() : undefined,
                        notes: ov_e_notes.trim() ? ov_e_notes.trim() : undefined,
                        recurrence: ov_e_recurring ? { rule: 'weekly', until: ov_e_until || undefined } : undefined
                      } : x))
                      clearOverrideEdit()
                      markDirty()
                    }}
                  >
                    <label className="flex flex-col gap-1 lg:col-span-2">
                      <span className="text-xs font-medium uppercase tracking-wide opacity-70">Agent</span>
                      <ComboBox
                        value={ov_e_agent}
                        onChange={(next)=> setOvEAgent(next)}
                        options={allPeople}
                        placeholder="Type or select agent"
                        dark={dark}
                      />
                    </label>
                    <label className="flex flex-col gap-1 lg:col-span-2">
                      <span className="text-xs font-medium uppercase tracking-wide opacity-70">Start date</span>
                      <input
                        type="date"
                        className={["w-full border rounded-lg px-2 py-1.5", dark ? "bg-neutral-900 border-neutral-700 text-neutral-100" : "bg-white border-neutral-300 text-neutral-800"].join(' ')}
                        value={ov_e_start}
                        onChange={(e)=> setOvEStart(e.target.value)}
                      />
                    </label>
                    <label className="flex flex-col gap-1 lg:col-span-2">
                      <span className="text-xs font-medium uppercase tracking-wide opacity-70">End date</span>
                      <input
                        type="date"
                        className={["w-full border rounded-lg px-2 py-1.5", dark ? "bg-neutral-900 border-neutral-700 text-neutral-100" : "bg-white border-neutral-300 text-neutral-800"].join(' ')}
                        value={ov_e_end}
                        onChange={(e)=> setOvEEnd(e.target.value)}
                      />
                    </label>
                    <label className="flex flex-col gap-1 lg:col-span-2">
                      <span className="text-xs font-medium uppercase tracking-wide opacity-70">Start time (optional)</span>
                      <input
                        type="time"
                        className={["w-full border rounded-lg px-2 py-1.5 text-left", dark ? "bg-neutral-900 border-neutral-700 text-neutral-100" : "bg-white border-neutral-300 text-neutral-800"].join(' ')}
                        value={ov_e_tstart}
                        onChange={(e)=>{
                          const val = e.target.value
                          const addMin = (t:string, m:number)=> minToHHMM(((toMin(t)+m)%1440+1440)%1440)
                          const prevDefault = ov_e_tstart ? addMin(ov_e_tstart, 510) : null
                          setOvETStart(val)
                          if(val){
                            const nextDefault = addMin(val, 510)
                            if(!ov_e_tend || (prevDefault && ov_e_tend===prevDefault)){
                              setOvETEnd(nextDefault)
                            }
                          }
                        }}
                      />
                    </label>
                    <label className="flex flex-col gap-1 lg:col-span-2">
                      <span className="text-xs font-medium uppercase tracking-wide opacity-70">End time (optional)</span>
                      <input
                        type="time"
                        className={["w-full border rounded-lg px-2 py-1.5 text-left", dark ? "bg-neutral-900 border-neutral-700 text-neutral-100" : "bg-white border-neutral-300 text-neutral-800"].join(' ')}
                        value={ov_e_tend}
                        onChange={(e)=> setOvETEnd(e.target.value)}
                      />
                    </label>
                    <label className="flex flex-col gap-1 lg:col-span-3">
                      <span className="text-xs font-medium uppercase tracking-wide opacity-70">Kind</span>
                      <input
                        type="text"
                        placeholder="e.g., Swap, Half-day"
                        className={["w-full border rounded-lg px-2 py-1.5", dark ? "bg-neutral-900 border-neutral-700 text-neutral-100" : "bg-white border-neutral-300 text-neutral-800"].join(' ')}
                        value={ov_e_kind}
                        onChange={(e)=> setOvEKind(e.target.value)}
                      />
                    </label>
                    <label className="flex flex-col gap-1 lg:col-span-3">
                      <span className="text-xs font-medium uppercase tracking-wide opacity-70">Notes</span>
                      <input
                        type="text"
                        placeholder="Optional"
                        className={["w-full border rounded-lg px-2 py-1.5", dark ? "bg-neutral-900 border-neutral-700 text-neutral-100" : "bg-white border-neutral-300 text-neutral-800"].join(' ')}
                        value={ov_e_notes}
                        onChange={(e)=> setOvENotes(e.target.value)}
                      />
                    </label>
                    <div className="flex flex-wrap items-center gap-3 lg:col-span-6">
                      <label className="inline-flex items-center gap-2 text-sm">
                        <Toggle ariaLabel="Weekly recurrence" dark={dark} size="md" checked={ov_e_recurring} onChange={(v)=>{
                          setOvERecurring(v)
                          if(!v) setOvEUntil('')
                        }} />
                        <span>Weekly recurrence</span>
                      </label>
                      {ov_e_recurring && (
                        <label className="flex items-center gap-2 text-sm">
                          <span className="opacity-70">Until</span>
                          <input
                            type="date"
                            className={["border rounded-lg px-2 py-1.5", dark ? "bg-neutral-900 border-neutral-700 text-neutral-100" : "bg-white border-neutral-300 text-neutral-800"].join(' ')}
                            value={ov_e_until}
                            onChange={(e)=> setOvEUntil(e.target.value)}
                          />
                        </label>
                      )}
                      <div className="ml-auto flex gap-2">
                        <button
                          type="submit"
                          className={["inline-flex items-center rounded-lg px-3 py-2 text-sm font-medium border", dark ? "bg-neutral-900 border-neutral-700 text-neutral-100 hover:bg-neutral-800" : "bg-blue-600 border-blue-600 text-white hover:bg-blue-500"].join(' ')}
                        >Save</button>
                        <button
                          type="button"
                          className={["inline-flex items-center rounded-lg px-3 py-2 text-sm font-medium border", dark ? "border-neutral-700 text-neutral-200 hover:bg-neutral-900" : "border-neutral-300 text-neutral-700 hover:bg-neutral-100"].join(' ')}
                          onClick={clearOverrideEdit}
                        >Cancel</button>
                      </div>
                    </div>
                  </form>
                </section>
              )}
            </div>
          </div>
          <div className={["mt-4 rounded-lg border overflow-hidden", dark?"bg-neutral-900 border-neutral-800":"bg-white border-neutral-200"].join(' ')}>
            <div className={["flex items-center justify-between px-3 py-2 border-b", dark?"border-neutral-800 bg-neutral-900 text-neutral-100":"border-neutral-200 bg-neutral-50 text-neutral-800"].join(' ')}>
              <span className="text-sm font-semibold">Weekly PTO calendar</span>
              <span className="text-xs opacity-70">Full-day entries by person</span>
            </div>
            <div className="px-3 pb-3 space-y-6">
              {calendarWeeks.map(({ key, label, startDate })=>{
                const H_PX = 220
                const dayHeight = 22
                const ymds = DAYS.map((_, i)=> fmtYMD(addDays(startDate, i)))
                return (
                  <div key={key}>
                    <div className="flex items-baseline justify-between mb-2">
                      <span className="text-sm font-semibold">{label}</span>
                      <span className="text-xs opacity-70">Week of {fmtNice(startDate)}</span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-7 gap-3 text-sm">
                      {DAYS.map((day, di)=>{
                        const ymd = ymds[di]
                        const dayItems = workingPto
                          .filter(p=> p.startDate <= ymd && p.endDate >= ymd)
                          .slice()
                          .sort((a,b)=> a.person.localeCompare(b.person) || a.startDate.localeCompare(b.startDate))
                        const laneByPerson = new Map<string, number>()
                        let nextLane = 0
                        const placed = dayItems.map(p=>{
                          let lane = laneByPerson.get(p.person)
                          if(lane==null){ lane = nextLane++; laneByPerson.set(p.person, lane) }
                          return { p, lane }
                        })
                        const heightPx = Math.min(H_PX, Math.max(placed.length * (dayHeight+6) + 28, 120))
                        return (
                          <div key={`${key}-${day}`} className={["rounded-lg p-2 relative overflow-hidden", dark?"bg-neutral-950":"bg-neutral-50"].join(' ')} style={{ height: heightPx }}>
                            <div className="font-medium mb-1 flex items-baseline justify-between">
                              <span>{day}</span>
                              <span className="text-xs opacity-70">{parseInt(ymd.slice(8), 10)}</span>
                            </div>
                            <div className="absolute left-2 right-2 bottom-2 top-7">
                              {placed.map(({p, lane})=>{
                                const top = lane * (dayHeight + 6)
                                const disp = agentDisplayName(localAgents as any, p.agentId, p.person)
                                return (
                                  <div key={`${p.id}-${key}-${ymd}`} className={["absolute left-0 right-0 rounded-md px-2 h-[22px] flex items-center justify-between", dark?"bg-neutral-800 text-neutral-100 border border-neutral-700":"bg-white text-neutral-900 border border-neutral-300 shadow-sm"].join(' ')} style={{ top }} title={`${disp} • ${p.startDate} → ${p.endDate}${p.notes ? ` • ${p.notes}` : ''}`}>
                                    <span className="truncate">{disp}</span>
                                    {p.notes && (<span className="ml-2 text-[11px] opacity-70 truncate">{p.notes}</span>)}
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
              })}
            </div>
          </div>
          <div className={["mt-4 rounded-lg border overflow-hidden", dark?"bg-neutral-900 border-neutral-800":"bg-white border-neutral-200"].join(' ')}>
            <div className={["flex items-center justify-between px-3 py-2 border-b", dark?"border-neutral-800 bg-neutral-900 text-neutral-100":"border-neutral-200 bg-neutral-50 text-neutral-800"].join(' ')}>
              <span className="text-sm font-semibold">Overrides calendar</span>
              <span className="text-xs opacity-70">Current + next week</span>
            </div>
            <div className="px-3 pb-3 space-y-6">
              {overrideCalendarData.map(({ key, label, startDate, days })=>(
                <div key={key}>
                  <div className="flex items-baseline justify-between mb-2">
                    <span className="text-sm font-semibold">{label}</span>
                    <span className="text-xs opacity-70">Week of {fmtNice(startDate)}</span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-7 gap-3 text-sm">
                    {days.map(({ day, ymd, entries })=>{
                      const dayNumber = parseInt(ymd.slice(8), 10)
                      return (
                        <div key={`${key}-${ymd}`} className={["rounded-lg p-2", dark?"bg-neutral-950":"bg-neutral-50"].join(' ')}>
                          <div className="font-medium mb-1 flex items-baseline justify-between">
                            <span>{day}</span>
                            <span className="text-xs opacity-70">{dayNumber}</span>
                          </div>
                          <div className="space-y-2 text-xs">
                            {entries.length===0 ? (
                              <div className="opacity-60">No overrides</div>
                            ) : (
                              entries.map((entry, idx)=>{
                                const { override: ov, occurrenceStart, occurrenceEnd } = entry
                                const disp = agentDisplayName(localAgents as any, ov.agentId, ov.person)
                                let timeLabel = 'All day'
                                let titleWindow = 'All day'
                                if(ov.start && ov.end){
                                  const startValue = ov.start
                                  const endValue = ov.end
                                  const overnight = endValue !== '24:00' && toMin(endValue) <= toMin(startValue)
                                  const endLabel = ov.endDay && ov.endDay !== day ? `${ov.endDay} ${endValue}` : (overnight ? `${endValue} (+1)` : endValue)
                                  timeLabel = `${startValue} – ${endLabel}`
                                  titleWindow = `${startValue} – ${endValue}`
                                }
                                const metaParts: string[] = []
                                if(ov.kind) metaParts.push(ov.kind)
                                if(ov.notes) metaParts.push(ov.notes)
                                const metaLabel = metaParts.join(' • ')
                                const recurrenceLabel = ov.recurrence?.rule === 'weekly'
                                  ? `Weekly${ov.recurrence.until ? ` until ${ov.recurrence.until}` : ''}`
                                  : null
                                const titleParts = [
                                  disp,
                                  `${occurrenceStart} → ${occurrenceEnd}`,
                                  titleWindow,
                                  metaLabel || null,
                                  recurrenceLabel
                                ].filter(Boolean)
                                return (
                                  <div key={`${ov.id}:${occurrenceStart}:${idx}`} className={["rounded-md border px-2 py-2", dark?"bg-neutral-900 border-neutral-700 text-neutral-100":"bg-white border-neutral-300 text-neutral-900 shadow-sm"].join(' ')} title={titleParts.join(' • ')}>
                                    <div className="flex items-center justify-between gap-2">
                                      <span className="font-medium truncate">{disp}</span>
                                      <span className="text-[11px] opacity-70 shrink-0">{timeLabel}</span>
                                    </div>
                                    {metaLabel && <div className="text-[11px] opacity-70 truncate mt-1">{metaLabel}</div>}
                                    {recurrenceLabel && <div className="text-[10px] uppercase tracking-wide opacity-60 mt-1">{recurrenceLabel}</div>}
                                  </div>
                                )
                              })
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null
    )}

      {unlocked && (
        <div className="mt-8 text-center">
          <button
            type="button"
            onClick={()=> handleAdminSignOut()}
            className={[
              "inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-medium",
              dark
                ? "bg-red-900/40 border-red-700/60 text-red-200 hover:bg-red-900/60"
                : "bg-red-50 border-red-200 text-red-600 hover:bg-red-100"
            ].join(' ')}
          >
            <svg aria-hidden width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 17l5-5-5-5"/><path d="M15 12H3"/><path d="M21 19V5"/></svg>
            <span>Sign out admin</span>
          </button>
        </div>
      )}

      {toast && (
        <div className="fixed right-4 bottom-4 z-50">
          <div
            role="status"
            aria-live="polite"
            className={[
              "min-w-[220px] max-w-[360px] px-3 py-2 rounded-xl border shadow-md text-sm",
              toast.kind==='success'
                ? (dark?"bg-neutral-800 border-green-700 text-green-300":"bg-white border-green-500 text-green-700")
                : (dark?"bg-neutral-800 border-red-700 text-red-300":"bg-white border-red-500 text-red-700")
            ].join(' ')}
          >
            {toast.text}
          </div>
        </div>
      )}
    </section>
  )
}
