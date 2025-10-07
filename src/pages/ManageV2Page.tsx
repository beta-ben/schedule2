import React from 'react'
import Toggle from '../components/Toggle'
// Legacy local password gate removed. Admin auth now uses dev proxy cookie+CSRF only.
import { cloudPostDetailed, ensureSiteSession, login, getApiBase, getApiPrefix, isUsingDevProxy, hasCsrfToken, getCsrfDiagnostics, cloudPostAgents, requestMagicLink, cloudCreateProposal, cloudListProposals, cloudGetProposal, cloudGet, getZoomAuthorizeUrl, getZoomConnections, deleteZoomConnection, cloudUpdateProposal, cloudMergeProposal } from '../lib/api'
import type { ZoomConnectionSummary } from '../lib/api'
import WeekEditor from '../components/v2/WeekEditor'
import ComboBox from '../components/ComboBox'
import WeeklyPosturesCalendar from '../components/WeeklyPosturesCalendar'
import ProposalDiffVisualizer from '../components/ProposalDiffVisualizer'
import AllAgentsWeekRibbons from '../components/AllAgentsWeekRibbons'
import CoverageHeatmap from '../components/CoverageHeatmap'
import type { PTO, Shift, Task, Override, MeetingCohort } from '../types'
import type { CalendarSegment } from '../lib/utils'
import TaskConfigPanel from '../components/TaskConfigPanel'
import { DAYS } from '../constants'
import { uid, toMin, shiftsForDayInTZ, agentIdByName, agentDisplayName, parseYMD, addDays, fmtYMD, minToHHMM, applyOverrides } from '../lib/utils'
import { mapAgentsToPayloads } from '../lib/agents'
import ZoomAnalyticsMock from '../components/ZoomAnalyticsMock'
import TimeTrackingMock from '../components/TimeTrackingMock'
import LunchPlannerMock from '../components/LunchPlannerMock'
import TeamsCommandsMock from '../components/TeamsCommandsMock'
import { computeComplianceWarnings } from '../domain/compliance'

type AgentRow = { firstName: string; lastName: string; tzId?: string; hidden?: boolean; isSupervisor?: boolean; supervisorId?: string|null; notes?: string; meetingCohort?: MeetingCohort | null }

const DEFAULT_POSTURE_DURATION_MIN = 3 * 60

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

export default function ManageV2Page({ dark, agents, onAddAgent, onUpdateAgent, onDeleteAgent, weekStart, tz, shifts, pto, overrides, tasks, calendarSegs, onUpdateShift, onDeleteShift, onAddShift, setTasks, setCalendarSegs, setPto, setOverrides }:{ dark:boolean; agents: AgentRow[]; onAddAgent?: (a:{ firstName:string; lastName:string; tzId:string })=>void; onUpdateAgent?: (index:number, a:AgentRow)=>void; onDeleteAgent?: (index:number)=>void; weekStart: string; tz:{ id:string; label:string; offset:number }; shifts: Shift[]; pto: PTO[]; overrides: Override[]; tasks: Task[]; calendarSegs: CalendarSegment[]; onUpdateShift?: (id:string, patch: Partial<Shift>)=>void; onDeleteShift?: (id:string)=>void; onAddShift?: (s: Shift)=>void; setTasks: (f:(prev:Task[])=>Task[])=>void; setCalendarSegs: (f:(prev:CalendarSegment[])=>CalendarSegment[])=>void; setPto: (f:(prev:PTO[])=>PTO[])=>void; setOverrides: (f:(prev:Override[])=>Override[])=>void }){
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
  const tabs = ['Agents','Shifts','Postures','PTO & Overrides','Proposals','Integrations','Clock & Breaks'] as const
  type Subtab = typeof tabs[number]
  const [subtab, setSubtab] = React.useState<Subtab>('Agents')
  const [zoomConnections, setZoomConnections] = React.useState<ZoomConnectionSummary[]>([])
  const [zoomLoading, setZoomLoading] = React.useState(false)
  const [zoomError, setZoomError] = React.useState<string | null>(null)
  const zoomInitializedRef = React.useRef(false)
  // Shifts tab: show time labels for all shifts
  const [showAllTimeLabels, setShowAllTimeLabels] = React.useState(false)
  const [sortMode, setSortMode] = React.useState<'start'|'end'|'name'|'count'|'total'|'tz'|'firstDay'>('start')
  const [sortDir, setSortDir] = React.useState<'asc'|'desc'>('asc')
  // Shifts tab: option to include hidden agents (default off, persisted)
  const INCLUDE_HIDDEN_KEY = React.useMemo(()=> `schedule2.v2.shifts.includeHidden.${weekStart}.${tz.id}`, [weekStart, tz.id])
  const [includeHiddenAgents, setIncludeHiddenAgents] = React.useState<boolean>(()=>{
    try{ const v = localStorage.getItem(INCLUDE_HIDDEN_KEY); return v ? v==='1' : false }catch{ return false }
  })
  React.useEffect(()=>{ try{ localStorage.setItem(INCLUDE_HIDDEN_KEY, includeHiddenAgents ? '1':'0') }catch{} }, [includeHiddenAgents, INCLUDE_HIDDEN_KEY])
  // Shifts tab: number of visible days (1-7)
  const DAYS_VISIBLE_KEY = React.useMemo(()=> `schedule2.v2.shifts.daysVisible.${weekStart}.${tz.id}`, [weekStart, tz.id])
  const [visibleDays, setVisibleDays] = React.useState<number>(()=>{
    try{ const v = localStorage.getItem(DAYS_VISIBLE_KEY); const n = v? parseInt(v,10): 7; return Number.isFinite(n) && n>=1 && n<=7 ? n : 7 }catch{ return 7 }
  })
  React.useEffect(()=>{ try{ localStorage.setItem(DAYS_VISIBLE_KEY, String(visibleDays)) }catch{} }, [visibleDays, DAYS_VISIBLE_KEY])
  // Shifts tab: scrollable chunk index when visibleDays < 7
  const [dayChunkIdx, setDayChunkIdx] = React.useState(0)
  React.useEffect(()=>{ setDayChunkIdx(0) }, [visibleDays, weekStart])
  // Load proposals list and live doc for diff when switching to Proposals tab
  React.useEffect(()=>{
    if(subtab !== 'Proposals') return
    let cancelled = false
    ;(async()=>{
      setLoadingProposals(true)
      const list = await cloudListProposals()
      if(cancelled) return
      setLoadingProposals(false)
      if(list.ok){ setProposals(list.proposals||[]) } else { setProposals([]) }
      const live = await cloudGet()
      if(cancelled) return
      setLiveDoc(live)
    })()
    return ()=>{ cancelled = true }
  }, [subtab])
  // Shifts tab: working copy (draft) of shifts
  const [workingShifts, setWorkingShifts] = React.useState<Shift[]>(shifts)
  // PTO tab: working copy (draft) of PTO entries
  const [workingPto, setWorkingPto] = React.useState<PTO[]>(pto)
  const [workingOverrides, setWorkingOverrides] = React.useState<Override[]>(overrides)
  const [isDirty, setIsDirty] = React.useState(false)
  // Import panel state
  const [showImport, setShowImport] = React.useState(false)
  const [importUrl, setImportUrl] = React.useState<string>('https://team-schedule-api.bsteward.workers.dev/v1/schedule')
  const [importText, setImportText] = React.useState<string>('')
  const [importMsg, setImportMsg] = React.useState<string>('')
  // Publish: optionally route publish through a Proposal (create -> merge)
  const PUBLISH_VIA_PROP_KEY = React.useMemo(()=> `schedule2.v2.publishViaProposal`, [])
  const [publishViaProposal, setPublishViaProposal] = React.useState<boolean>(()=>{
    try{ const v = localStorage.getItem(PUBLISH_VIA_PROP_KEY); return v==='1' }catch{ return false }
  })
  React.useEffect(()=>{ try{ localStorage.setItem(PUBLISH_VIA_PROP_KEY, publishViaProposal ? '1' : '0') }catch{} }, [publishViaProposal, PUBLISH_VIA_PROP_KEY])
  // Proposals tab state
  type ProposalMeta = { id:string; title?:string; status:string; createdAt:number; updatedAt:number; weekStart?:string; tzId?:string }
  const [proposals, setProposals] = React.useState<ProposalMeta[]>([])
  const [loadingProposals, setLoadingProposals] = React.useState(false)
  const [selectedProposalId, setSelectedProposalId] = React.useState<string>('')
  const [proposalDetail, setProposalDetail] = React.useState<any>(null)
  const [proposalActing, setProposalActing] = React.useState<boolean>(false)
  const [liveDoc, setLiveDoc] = React.useState<any>(null)
  const [diffMsg, setDiffMsg] = React.useState<string>('')
  const [showVisualDiff, setShowVisualDiff] = React.useState<boolean>(false)
  // Compliance warnings (Shifts tab)
  const [showCompliance, setShowCompliance] = React.useState<boolean>(false)
  const [complianceIssues, setComplianceIssues] = React.useState<Array<{ rule:string; severity:'hard'|'soft'; person:string; day?:string; shiftId?:string; details?:string }>>([])
  const complianceHighlightIds = React.useMemo(()=>{
    const set = new Set<string>()
    for(const i of complianceIssues){ if(i.shiftId) set.add(i.shiftId) }
    return set
  }, [complianceIssues])
  // Track whether the working session started from live (so full undo returns to Live)
  const startedFromLiveRef = React.useRef(false)
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
          setIsDirty(true)
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
          setIsDirty(true)
          startedFromLiveRef.current = false
          try{ localStorage.setItem(UNPUB_KEY, JSON.stringify(payload)) }catch{}
        }
        try{ localStorage.removeItem(LEGACY_DRAFT_KEY) }catch{}
      }
    }catch{}
  }, [UNPUB_KEY, LEGACY_DRAFT_KEY])
  // Autosave unpublished changes (debounced)
  React.useEffect(()=>{
    if(!isDirty) return
    const t = setTimeout(()=>{
      try{ localStorage.setItem(UNPUB_KEY, JSON.stringify({ schema: 1, weekStart, tzId: tz.id, shifts: workingShifts, pto: workingPto, overrides: workingOverrides, updatedAt: new Date().toISOString() })) }catch{}
    }, 300)
    return ()=> clearTimeout(t)
  }, [isDirty, workingShifts, workingPto, workingOverrides, UNPUB_KEY, weekStart, tz.id])
  // Track modified shifts to show edge time labels next render
  const [modifiedIds, setModifiedIds] = React.useState<Set<string>>(new Set())
  // Shifts tab: multi-select of shifts by id
  const [selectedShiftIds, setSelectedShiftIds] = React.useState<Set<string>>(new Set())
  // Shifts tab: multi-level undo stack (keep last 10 actions)
  const [shiftUndoStack, setShiftUndoStack] = React.useState<Array<Array<{ id:string; patch: Partial<Shift> }>>>([])
  // Redo stack mirrors undo with forward patches
  const [shiftRedoStack, setShiftRedoStack] = React.useState<Array<Array<{ id:string; patch: Partial<Shift> }>>>([])
  const canUndoShifts = shiftUndoStack.length > 0
  const canRedoShifts = shiftRedoStack.length > 0
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
  // Shallow equality for relevant shift fields (ignores segments)
  function eqShift(a: Shift, b: Shift){
    return a.id===b.id && a.day===b.day && a.start===b.start && a.end===b.end && (a as any).endDay=== (b as any).endDay
  }
  function eqShifts(a: Shift[], b: Shift[]){
    if(a.length!==b.length) return false
    const map = new Map(a.map(s=> [s.id, s]))
    for(const s of b){ const m = map.get(s.id); if(!m || !eqShift(m, s)) return false }
    return true
  }
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
    setIsDirty(true)
  }, [isDirty, workingShifts, shifts])
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
    setIsDirty(true)
    // If we've undone the very first change from live, revert to live
    const remaining = shiftUndoStack.length - 1
    if(remaining===0 && startedFromLiveRef.current){
      setWorkingShifts(shifts)
      setIsDirty(false)
      startedFromLiveRef.current = false
    }
  }, [shiftUndoStack, workingShifts, shifts])
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
    setIsDirty(true)
  }, [shiftRedoStack, workingShifts])

  // Compute effective shifts for display by applying Overrides as replacements.
  // - No-time overrides: remove the agent's shifts for the covered day(s).
  // - Time overrides: replace the agent's shifts on the covered day(s) with the provided time window.
  // Weekly recurrence is respected.
  const effectiveWorkingShifts = React.useMemo(()=>{
    try{ return applyOverrides(workingShifts, workingOverrides, weekStart, localAgents as any) }
    catch{ return workingShifts }
  }, [workingShifts, workingOverrides, weekStart, localAgents])
  // When switching into Shifts tab, if there are no local edits pending, refresh from live
  React.useEffect(()=>{
    if(subtab!== 'Shifts') return
    const noLocalEdits = shiftUndoStack.length===0 && shiftRedoStack.length===0 && modifiedIds.size===0
    if(noLocalEdits){ setWorkingShifts(shifts) }
  }, [subtab, shifts, shiftUndoStack, shiftRedoStack, modifiedIds])
  // Keyboard shortcuts for Shifts tab (Undo/Redo, Escape)
  React.useEffect(()=>{
    const onKey = (e: KeyboardEvent)=>{
      if(subtab!=='Shifts') return
      const isUndo = (e.ctrlKey || e.metaKey) && !e.shiftKey && (e.key==='z' || e.key==='Z')
      const isRedo = ((e.ctrlKey || e.metaKey) && (e.shiftKey && (e.key==='z' || e.key==='Z'))) || ((e.ctrlKey || e.metaKey) && (e.key==='y' || e.key==='Y'))
      if(isUndo){ e.preventDefault(); undoShifts() }
      else if(isRedo){ e.preventDefault(); redoShifts() }
      if(e.key === 'Escape'){
        // Clear selection to allow single-shift moves without grouping
        setSelectedShiftIds(new Set())
      }
    }
    window.addEventListener('keydown', onKey)
    return ()=> window.removeEventListener('keydown', onKey)
  }, [subtab, undoShifts, redoShifts])

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
  function discardWorkingDraft(){
    setWorkingShifts(shifts)
    setIsDirty(false)
    setShiftUndoStack([]); setShiftRedoStack([]); setModifiedIds(new Set())
    startedFromLiveRef.current = false
    try{ localStorage.removeItem(UNPUB_KEY) }catch{}
  }
  async function publishWorkingToLive(){
    // Include agents in publish so metadata like supervisor persists
    const agentsPayload = mapAgentsToPayloads(localAgents)
    if(publishViaProposal){
      // Publish by creating a proposal and merging it
      const title = `Publish via Proposal — ${new Date().toLocaleString()}`
      // Capture current live updatedAt to enable conflict messaging
      let baseUpdatedAt: string | undefined
      try{ const live = await cloudGet(); if(live && typeof (live as any).updatedAt === 'string') baseUpdatedAt = (live as any).updatedAt }catch{}
      const created = await cloudCreateProposal({ title, weekStart, tzId: tz.id, baseUpdatedAt, shifts: workingShifts, pto: workingPto, overrides: workingOverrides, calendarSegs, agents: agentsPayload as any })
      if(!created.ok || !created.id){ showToast('Failed to create proposal for publish.', 'error'); return }
      let merged = await cloudMergeProposal(created.id)
      if(!merged.ok && merged.status===409){
        const confirmForce = window.confirm('Live data changed since base. Merge anyway and overwrite with current proposal?')
        if(!confirmForce) return
        merged = await cloudMergeProposal(created.id, { force: true })
      }
      if(merged.ok){
        setIsDirty(false)
        showToast('Published via proposal.', 'success')
        startedFromLiveRef.current = false
        setModifiedIds(new Set())
        try{ localStorage.removeItem(UNPUB_KEY) }catch{}
        setPto(()=> workingPto)
        setOverrides(()=> workingOverrides)
        return
      } else {
        showToast('Publish via proposal failed.', 'error')
        return
      }
    }
    // Direct publish to schedule endpoint
    const res = await cloudPostDetailed({ shifts: workingShifts, pto: workingPto, overrides: workingOverrides, calendarSegs, agents: agentsPayload as any, updatedAt: new Date().toISOString() })
    if(res.ok){
      setIsDirty(false)
      showToast('Published to live.', 'success')
      startedFromLiveRef.current = false
      // Clear modified markers so shift ribbons no longer show edited tags
      setModifiedIds(new Set())
      try{ localStorage.removeItem(UNPUB_KEY) }catch{}
      // Update parent state to reflect published PTO/Overrides immediately
      setPto(()=> workingPto)
      setOverrides(()=> workingOverrides)
    }else{
      if(res.status===404 || res.error==='missing_site_session' || (res.bodyText||'').includes('missing_site_session')){
        await ensureSiteSession()
        showToast('Publish failed: missing or expired site session. Please sign in to view and then try again.', 'error')
      }else if(res.status===401){
        showToast('Publish failed: not signed in as admin (401).', 'error')
      }else if(res.status===403){
        showToast('Publish failed: CSRF mismatch (403). Try reloading and signing in again.', 'error')
      }else if(res.status===409){
        showToast('Publish failed: conflict (409). Refresh to load latest, then retry.', 'error')
      }else{
        showToast(`Failed to publish. ${res.status?`HTTP ${res.status}`:''} ${res.error?`— ${res.error}`:''}`, 'error')
      }
    }
  }
  // Create a proposal from current working changes
  async function createProposalFromWorking(){
    const title = prompt('Proposal title', new Date().toLocaleString()) || new Date().toLocaleString()
    // Include agents to preserve metadata like hidden/supervisor on review
    const agentsPayload = mapAgentsToPayloads(localAgents)
    const res = await cloudCreateProposal({
      title,
      weekStart,
      tzId: tz.id,
      shifts: workingShifts,
      pto: workingPto,
      overrides: workingOverrides,
      calendarSegs,
      agents: agentsPayload as any
    })
    if(res.ok){
      showToast('Proposal created.', 'success')
    } else {
      showToast('Failed to create proposal.', 'error')
    }
  }
  // Proposal diff helpers
  function diffById<T extends { id: string }>(liveArr: T[] = [], propArr: T[] = [], eq: (a:T,b:T)=>boolean){
    const liveMap = new Map(liveArr.map(x=> [x.id, x]))
    const propMap = new Map(propArr.map(x=> [x.id, x]))
    const added: T[] = []
    const removed: T[] = []
    const changed: Array<{ before: T; after: T }> = []
    for(const [id, after] of propMap){
      const before = liveMap.get(id)
      if(!before) added.push(after)
      else if(!eq(before, after)) changed.push({ before, after })
    }
    for(const [id, before] of liveMap){ if(!propMap.has(id)) removed.push(before) }
    return { added, removed, changed }
  }
  const eqShiftLite = (a: any, b: any)=> a && b && a.id===b.id && a.person===b.person && a.day===b.day && a.start===b.start && a.end===b.end && ((a as any).endDay||'')===((b as any).endDay||'')
  const eqPtoLite = (a: any, b: any)=> a && b && a.id===b.id && a.person===b.person && a.startDate===b.startDate && a.endDate===b.endDate && (a.notes||'')===(b.notes||'')
  const eqOverrideLite = (a: any, b: any)=> a && b && a.id===b.id && a.person===b.person && a.startDate===b.startDate && a.endDate===b.endDate && (a.start||'')===(b.start||'') && (a.end||'')===(b.end||'') && ((a as any).endDay||'')===((b as any).endDay||'') && (a.kind||'')===(b.kind||'') && (a.notes||'')===(b.notes||'')
  async function loadProposalDetail(id: string){
    setSelectedProposalId(id)
    setProposalDetail(null)
    setDiffMsg('')
    const res = await cloudGetProposal(id)
    if(!res.ok || !res.proposal){ setDiffMsg('Failed to load proposal'); return }
    setProposalDetail(res.proposal)
  }

  async function approveSelectedProposal(){
    if(!selectedProposalId) return
    setProposalActing(true)
    const r = await cloudUpdateProposal(selectedProposalId, { status: 'approved' })
    setProposalActing(false)
    if(r.ok){
      showToast('Proposal approved.', 'success')
      setProposalDetail((prev:any)=> prev ? { ...prev, status: 'approved' } : prev)
      // Refresh list lightweight
      setProposals(prev=> prev.map(p=> p.id===selectedProposalId ? { ...p, status: 'approved' } : p))
    } else {
      showToast('Failed to approve proposal.', 'error')
    }
  }
  async function rejectSelectedProposal(){
    if(!selectedProposalId) return
    if(!window.confirm('Reject this proposal?')) return
    setProposalActing(true)
    const r = await cloudUpdateProposal(selectedProposalId, { status: 'rejected' })
    setProposalActing(false)
    if(r.ok){
      showToast('Proposal rejected.', 'success')
      setProposalDetail((prev:any)=> prev ? { ...prev, status: 'rejected' } : prev)
      setProposals(prev=> prev.map(p=> p.id===selectedProposalId ? { ...p, status: 'rejected' } : p))
    } else {
      showToast('Failed to reject proposal.', 'error')
    }
  }
  async function mergeSelectedProposal(){
    if(!selectedProposalId) return
    if(!window.confirm('Merge this proposal into live?')) return
    setProposalActing(true)
    let r = await cloudMergeProposal(selectedProposalId)
    if(!r.ok && r.status===409){
      setProposalActing(false)
      const again = window.confirm('Live data changed since this proposal was created. Merge anyway and overwrite with proposal?')
      if(!again) return
      setProposalActing(true)
      r = await cloudMergeProposal(selectedProposalId, { force: true })
    }
    setProposalActing(false)
    if(r.ok){
      showToast('Proposal merged to live.', 'success')
      setProposalDetail((prev:any)=> prev ? { ...prev, status: 'merged' } : prev)
      setProposals(prev=> prev.map(p=> p.id===selectedProposalId ? { ...p, status: 'merged' } : p))
      // Refresh live doc for diff view
      try{ const live = await cloudGet(); setLiveDoc(live) }catch{}
    } else {
      const msg = r.error==='conflict' ? 'Merge conflict. Refresh live and retry.' : 'Merge failed.'
      showToast(msg, 'error')
    }
  }
  const handleAdd = React.useCallback((a:{ firstName:string; lastName:string; tzId:string })=>{
  onAddAgent?.(a); setLocalAgents(prev=> prev.concat([{ firstName: a.firstName, lastName: a.lastName, tzId: a.tzId, hidden: false, meetingCohort: undefined }]))
  },[onAddAgent])
  const handleUpdate = React.useCallback((index:number, a:AgentRow)=>{
    onUpdateAgent?.(index, a); setLocalAgents(prev=> prev.map((row,i)=> i===index ? a : row))
  },[onUpdateAgent])
  const handleDelete = React.useCallback((index:number)=>{
    onDeleteAgent?.(index); setLocalAgents(prev=> prev.filter((_,i)=> i!==index))
  },[onDeleteAgent])
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
          return (
            <button
              key={t}
              onClick={()=>setSubtab(t)}
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
              <span className="relative inline-block">
                <span>{t}</span>
                {(t==='Integrations' || t==='Clock & Breaks') && (
                  <span
                    aria-hidden
                    className={[
                      'pointer-events-none select-none absolute -right-2 -top-2 rotate-45 text-[9px] leading-none uppercase font-bold px-[3px] py-[2px] shadow-sm',
                      dark ? 'bg-red-600 text-white' : 'bg-red-600 text-white'
                    ].join(' ')}
                    style={{ borderRadius: 2 }}
                  >WIP</span>
                )}
              </span>
            </button>
          )
        })}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={!isDirty}
            onClick={discardWorkingDraft}
            className={[
              "px-2.5 py-1.5 rounded-xl border font-medium shrink-0",
              isDirty ? (dark?"bg-neutral-900 border-neutral-700 hover:bg-neutral-800":"bg-white border-neutral-300 hover:bg-neutral-100") : (dark?"bg-neutral-900 border-neutral-800 opacity-50":"bg-white border-neutral-200 opacity-50")
            ].join(' ')}
            title="Discard working changes"
            aria-label="Discard"
          >
            <span className="inline-flex items-center gap-1">
              <svg aria-hidden className={dark?"text-neutral-300":"text-neutral-700"} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2 2L5 6"></path><path d="M10 11v6"></path><path d="M14 11v6"></path></svg>
              <span>Discard</span>
            </span>
          </button>
          <label className="flex items-center gap-1 text-xs select-none">
            <input type="checkbox" className="accent-blue-600" checked={publishViaProposal} onChange={(e)=> setPublishViaProposal(e.target.checked)} />
            <span className={dark?"text-neutral-300":"text-neutral-700"}>via proposal</span>
          </label>
          <button
            onClick={publishWorkingToLive}
            className="px-3 py-1.5 rounded-xl border font-semibold bg-blue-600 border-blue-600 text-white hover:bg-blue-500 shrink-0"
            title="Publish working changes to live"
            aria-label="Publish"
          >
            <span className="inline-flex items-center gap-1">
              <svg aria-hidden width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14"></path><path d="M5 12h14"></path><path d="M16 5h2a2 2 0 0 1 2 2v2"></path></svg>
              <span>Publish</span>
            </span>
          </button>
        </div>
      </div>

  {subtab==='Shifts' && (
        <div className={["flex flex-wrap items-center justify-between gap-2 sm:gap-3 text-xs rounded-xl px-2 py-2 border", dark?"bg-neutral-950 border-neutral-800 text-neutral-200":"bg-neutral-50 border-neutral-200 text-neutral-800"].join(' ')}>
          {/* Left: status badge */}
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            <span className={["inline-flex items-center px-2 py-1 rounded-xl border font-medium", isDirty ? (dark?"bg-neutral-900 border-amber-600 text-amber-400":"bg-white border-amber-500 text-amber-700") : (dark?"bg-neutral-900 border-neutral-800 text-neutral-400":"bg-white border-neutral-200 text-neutral-500")].join(' ')}>
              {isDirty ? 'Unpublished changes' : 'Live'}
            </span>
          </div>

          {/* Right: all controls */}
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            {/* View: Sort select (iconified) */}
            <div className="inline-flex items-center gap-1" title="Sort ribbons">
              <svg aria-hidden className={dark?"text-neutral-300":"text-neutral-700"} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h14"/><path d="M7 12h10"/><path d="M11 18h6"/></svg>
              <div className="relative">
                <select
                  className={["border rounded-xl pl-2 pr-7 py-1 w-[9.5rem] sm:w-[11rem] appearance-none", dark?"bg-neutral-900 border-neutral-700 text-neutral-100":"bg-white border-neutral-300 text-neutral-800"].join(' ')}
                  value={sortMode}
                  onChange={(e)=> setSortMode((e.target.value as any))}
                  aria-label="Sort ribbons"
                >
                  <option value="start">Earliest start</option>
                  <option value="end">Latest end</option>
                  <option value="count">Shift count</option>
                  <option value="total">Total minutes</option>
                  <option value="firstDay">First day</option>
                  <option value="tz">Timezone</option>
                  <option value="name">Name (A–Z)</option>
                </select>
                <svg aria-hidden className={"pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 "+(dark?"text-neutral-400":"text-neutral-500")} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
              </div>
              <button
                type="button"
                onClick={()=> setSortDir(d=> d==='asc'?'desc':'asc')}
                aria-pressed={sortDir==='desc'}
                title={sortDir==='asc' ? 'Ascending' : 'Descending'}
                className={[
                  "ml-1 px-2.5 py-1.5 rounded-xl border font-medium",
                  dark?"bg-neutral-900 border-neutral-800 hover:bg-neutral-800":"bg-white border-neutral-200 hover:bg-neutral-100"
                ].join(' ')}
              >
                {sortDir==='asc' ? (
                  <svg aria-hidden className={dark?"text-neutral-300":"text-neutral-700"} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 19V5"/><path d="m5 12 7-7 7 7"/></svg>
                ) : (
                  <svg aria-hidden className={dark?"text-neutral-300":"text-neutral-700"} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14"/><path d="m19 12-7 7-7-7"/></svg>
                )}
              </button>
            </div>
            {/* Toggle: include hidden/off-duty agents (icon button) */}
            <button
              type="button"
              onClick={()=> setIncludeHiddenAgents(v=>!v)}
              aria-pressed={includeHiddenAgents}
              title={includeHiddenAgents?"Hide off-duty agents":"Show off-duty agents"}
              className={[
                "px-2.5 py-1.5 rounded-xl border font-medium",
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
                onClick={undoShifts}
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
                onClick={redoShifts}
                className={[
                  "px-2.5 py-1.5 rounded-xl border font-medium",
                  canRedoShifts ? (dark?"bg-neutral-900 border-neutral-700 hover:bg-neutral-800":"bg-white border-neutral-300 hover:bg-neutral-100") : (dark?"bg-neutral-900 border-neutral-800 opacity-50":"bg-white border-neutral-200 opacity-50")
                ].join(' ')}
                title="Redo (Ctrl/Cmd+Shift+Z or Ctrl/Cmd+Y)"
              >
                <svg aria-hidden className={dark?"text-neutral-300":"text-neutral-700"} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 14 20 9 15 4"></polyline><path d="M4 20a8 8 0 0 1 7-12h9"></path></svg>
              </button>
            </div>

            {/* Removed: draft save/load UI — drafts are deprecated */}

            {/* Create proposal */}
            <button
              type="button"
              onClick={createProposalFromWorking}
              className={["px-2.5 py-1.5 rounded-xl border font-medium shrink-0", dark?"bg-neutral-900 border-neutral-700 hover:bg-neutral-800":"bg-white border-neutral-300 hover:bg-neutral-100"].join(' ')}
              title="Create a proposal from current changes"
              aria-label="Create proposal"
            >
              <span className="inline-flex items-center gap-1">
                <svg aria-hidden className={dark?"text-neutral-300":"text-neutral-700"} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14"></path><path d="M5 12h14"></path></svg>
                <span>Proposal</span>
              </span>
            </button>

            {/* Import legacy */}
            <button
              type="button"
              onClick={()=>{ setShowImport(v=>!v); setImportMsg('') }}
              className={["px-2.5 py-1.5 rounded-xl border font-medium shrink-0", dark?"bg-neutral-900 border-neutral-700 hover:bg-neutral-800":"bg-white border-neutral-300 hover:bg-neutral-100"].join(' ')}
              title="Import shifts/PTO/postures from a legacy JSON URL or paste"
              aria-label="Import"
            >
              <svg aria-hidden className={dark?"text-neutral-300":"text-neutral-700"} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14"></path><path d="M5 12h14"></path><polyline points="8 17 12 21 16 17"></polyline></svg>
            </button>

            {/* Publish area: discard then publish at far right */}
            <button
              disabled={!isDirty}
              onClick={discardWorkingDraft}
              className={["px-2.5 py-1.5 rounded-xl border font-medium shrink-0", isDirty ? (dark?"bg-neutral-900 border-neutral-700 hover:bg-neutral-800":"bg-white border-neutral-300 hover:bg-neutral-100") : (dark?"bg-neutral-900 border-neutral-800 opacity-50":"bg-white border-neutral-200 opacity-50")].join(' ')}
              title="Discard working changes"
              aria-label="Discard"
            >
              <svg aria-hidden className={dark?"text-neutral-300":"text-neutral-700"} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2 2L5 6"></path><path d="M10 11v6"></path><path d="M14 11v6"></path></svg>
            </button>
            {/* Publish button moved to global header */}
          </div>
        </div>
      )}

      {subtab==='Proposals' && (
        <div className={["rounded-xl p-3 border", dark?"bg-neutral-950 border-neutral-800":"bg-neutral-50 border-neutral-200"].join(' ')}>
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="text-sm font-semibold">Proposals</div>
            <div className="flex items-center gap-2">
              <button onClick={()=>{ setLoadingProposals(true); cloudListProposals().then(r=>{ setLoadingProposals(false); setProposals(r.ok?(r.proposals||[]):[]) }) }} className={["px-2.5 py-1.5 rounded-xl border text-xs", dark?"bg-neutral-900 border-neutral-700 hover:bg-neutral-800":"bg-white border-neutral-300 hover:bg-neutral-100"].join(' ')}>Refresh</button>
            </div>
          </div>
          {proposalDetail && (
            <div className={["rounded-xl p-2 border flex flex-wrap items-center gap-2 mb-3", dark?"bg-neutral-900 border-neutral-800":"bg-white border-neutral-200"].join(' ')}>
              <div className="text-xs font-medium">Status: <span className="opacity-80">{proposalDetail.status||'open'}</span></div>
              <div className="flex items-center gap-2 ml-auto">
                <button
                  type="button"
                  disabled={proposalActing}
                  onClick={approveSelectedProposal}
                  className={["px-2.5 py-1.5 rounded-xl border text-xs font-medium", dark?"bg-neutral-900 border-neutral-700 hover:bg-neutral-800":"bg-white border-neutral-300 hover:bg-neutral-100"].join(' ')}
                >Approve</button>
                <button
                  type="button"
                  disabled={proposalActing}
                  onClick={rejectSelectedProposal}
                  className={["px-2.5 py-1.5 rounded-xl border text-xs font-medium", dark?"bg-neutral-900 border-neutral-700 hover:bg-neutral-800":"bg-white border-neutral-300 hover:bg-neutral-100"].join(' ')}
                >Reject</button>
                <button
                  type="button"
                  disabled={proposalActing}
                  onClick={mergeSelectedProposal}
                  className={["px-2.5 py-1.5 rounded-xl border text-xs font-semibold", dark?"bg-blue-500/20 border-blue-400 text-blue-200 hover:bg-blue-500/30":"bg-blue-600 text-white border-blue-600 hover:bg-blue-700"].join(' ')}
                >Merge to Live</button>
              </div>
            </div>
          )}
          <div className="space-y-3">
            <div className={["rounded-xl p-2 border", dark?"bg-neutral-900 border-neutral-800":"bg-white border-neutral-200"].join(' ')}>
              <div className="text-xs font-medium mb-2">List</div>
              <div className="flex flex-col gap-1 max-h-56 overflow-auto">
                {loadingProposals && (<div className="text-xs opacity-70">Loading…</div>)}
                {(!loadingProposals && proposals.length===0) && (<div className="text-xs opacity-70">No proposals</div>)}
                {proposals.map(p=> (
                  <button key={p.id} onClick={()=> loadProposalDetail(p.id)} className={["text-left px-2 py-1 rounded-lg border text-xs", selectedProposalId===p.id ? (dark?"bg-neutral-800 border-neutral-700":"bg-neutral-100 border-neutral-300") : (dark?"bg-neutral-900 border-neutral-800 hover:bg-neutral-800":"bg-white border-neutral-200 hover:bg-neutral-100")].join(' ')}>
                    <div className="font-medium truncate">{p.title || p.id}</div>
                    <div className="opacity-70 truncate">{p.status} • {new Date((p.updatedAt||0)*1000).toLocaleString()}</div>
                  </button>
                ))}
              </div>
            </div>
            <div className={["rounded-xl p-2 border", dark?"bg-neutral-900 border-neutral-800":"bg-white border-neutral-200"].join(' ')}>
              <div className="flex items-center justify-between mb-2">
                <div className="text-xs font-medium">Diff</div>
                <button
                  type="button"
                  onClick={()=> setShowVisualDiff(v=>!v)}
                  className={["px-2.5 py-1 rounded-lg border text-[11px]", dark?"bg-neutral-900 border-neutral-700 hover:bg-neutral-800":"bg-white border-neutral-300 hover:bg-neutral-100"].join(' ')}
                  aria-pressed={showVisualDiff}
                >{showVisualDiff? 'Hide visual':'Show visual'}</button>
              </div>
              {diffMsg && (<div className="text-xs text-red-600 dark:text-red-300">{diffMsg}</div>)}
              {proposalDetail && liveDoc && (()=>{
                const patch = proposalDetail.patch||{}
                const live = { shifts: liveDoc?.shifts||[], pto: liveDoc?.pto||[], overrides: liveDoc?.overrides||[] }
                const dShifts = diffById(live.shifts, patch.shifts||[], eqShiftLite)
                const dPto = diffById(live.pto, patch.pto||[], eqPtoLite)
                const dOv = diffById(live.overrides, patch.overrides||[], eqOverrideLite)
                const Badge = ({kind}:{kind:'added'|'removed'|'changed'})=> (
                  <span className={[
                    'text-[10px] px-1.5 py-0.5 rounded border',
                    kind==='added' ? (dark? 'bg-green-900/30 border-green-800 text-green-300':'bg-green-50 border-green-200 text-green-700') :
                    kind==='removed' ? (dark? 'bg-red-900/30 border-red-800 text-red-300':'bg-red-50 border-red-200 text-red-700') :
                    (dark? 'bg-amber-900/30 border-amber-800 text-amber-300':'bg-amber-50 border-amber-200 text-amber-700')
                  ].join(' ')}>{kind}</span>
                )
                const Row = ({text,kind}:{text:string;kind:'added'|'removed'|'changed'})=> (
                  <div className="flex items-center gap-2 text-xs">
                    <Badge kind={kind} />
                    <div className="truncate" title={text}>{text}</div>
                  </div>
                )
                const fmtShift = (s:any)=> `${s.person||''} — ${s.day||''} ${s.start||''}–${s.end||''}${s.endDay && s.endDay!==s.day?` (${s.endDay})`:''}`
                const fmtPto = (p:any)=> `${p.person||''} — ${p.startDate||''} → ${p.endDate||''}${p.notes?` (${p.notes})`:''}`
                const fmtOv = (o:any)=> `${o.person||''} — ${o.startDate||''} → ${o.endDate||''}${o.start?` ${o.start}`:''}${o.end?`–${o.end}`:''}${o.endDay?` (${o.endDay})`:''}${o.kind?` [${o.kind}]`:''}${o.notes?` (${o.notes})`:''}`
                const liveHighlights = new Set<string>([
                  ...dShifts.removed.map((s:any)=> s.id),
                  ...dShifts.changed.map((c:any)=> c.before?.id).filter(Boolean),
                ])
                const proposalHighlights = new Set<string>([
                  ...dShifts.added.map((s:any)=> s.id),
                  ...dShifts.changed.map((c:any)=> c.after?.id).filter(Boolean),
                ])
                return (
                  <div className="space-y-3">
                    <div>
                      <div className="text-xs font-semibold mb-1">Shifts</div>
                      <div className="space-y-1">
                        {dShifts.added.map((s:any)=> <Row key={'a-'+s.id} kind="added" text={fmtShift(s)} />)}
                        {dShifts.removed.map((s:any)=> <Row key={'r-'+s.id} kind="removed" text={fmtShift(s)} />)}
                        {dShifts.changed.map(({before,after}:any)=> <Row key={'c-'+after.id} kind="changed" text={`${fmtShift(before)} → ${fmtShift(after)}`} />)}
                        {(dShifts.added.length+dShifts.removed.length+dShifts.changed.length===0) && (<div className="text-xs opacity-60">No changes</div>)}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs font-semibold mb-1">PTO</div>
                      <div className="space-y-1">
                        {dPto.added.map((p:any)=> <Row key={'pa-'+p.id} kind="added" text={fmtPto(p)} />)}
                        {dPto.removed.map((p:any)=> <Row key={'pr-'+p.id} kind="removed" text={fmtPto(p)} />)}
                        {dPto.changed.map(({before,after}:any)=> <Row key={'pc-'+after.id} kind="changed" text={`${fmtPto(before)} → ${fmtPto(after)}`} />)}
                        {(dPto.added.length+dPto.removed.length+dPto.changed.length===0) && (<div className="text-xs opacity-60">No changes</div>)}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs font-semibold mb-1">Overrides</div>
                      <div className="space-y-1">
                        {dOv.added.map((o:any)=> <Row key={'oa-'+o.id} kind="added" text={fmtOv(o)} />)}
                        {dOv.removed.map((o:any)=> <Row key={'or-'+o.id} kind="removed" text={fmtOv(o)} />)}
                        {dOv.changed.map(({before,after}:any)=> <Row key={'oc-'+after.id} kind="changed" text={`${fmtOv(before)} → ${fmtOv(after)}`} />)}
                        {(dOv.added.length+dOv.removed.length+dOv.changed.length===0) && (<div className="text-xs opacity-60">No changes</div>)}
                      </div>
                    </div>
                    {showVisualDiff && (
                      <div className="pt-2 border-t border-neutral-800/30">
                        <ProposalDiffVisualizer
                          dark={dark}
                          tz={tz}
                          weekStart={weekStart}
                          agents={localAgents}
                          live={{ shifts: live.shifts, pto: live.pto }}
                          proposal={{ shifts: patch.shifts||[], pto: patch.pto||[] }}
                          highlightLiveIds={liveHighlights}
                          highlightProposalIds={proposalHighlights}
                          tasks={tasks}
                          calendarSegs={calendarSegs}
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
        </div>
                    )}
                  </div>
                )
              })()}
              {(!proposalDetail || !liveDoc) && (<div className="text-xs opacity-60">Select a proposal to see its diff</div>)}
            </div>
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
      {showImport && (
        <div className={["mt-2 rounded-xl p-3 border", dark?"bg-neutral-950 border-neutral-800":"bg-neutral-50 border-neutral-200"].join(' ')}>
          <div className="text-sm font-semibold mb-2">Import legacy data</div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
            <label className="text-sm flex flex-col md:col-span-2">
              <span className="mb-1">From URL</span>
              <input className={["w-full border rounded-xl px-3 py-2", dark&&"bg-neutral-900 border-neutral-700"].filter(Boolean).join(' ')} value={importUrl} onChange={(e)=>setImportUrl(e.target.value)} placeholder="https://…/schedule.json" />
            </label>
            <div className="flex gap-2">
              <button
                className={["h-10 rounded-xl px-4 border font-medium", dark?"bg-neutral-900 border-neutral-700 hover:bg-neutral-800":"bg-blue-600 border-blue-600 text-white"].join(' ')}
                onClick={async()=>{
                  setImportMsg('')
                  try{
                    const r = await fetch(importUrl, { credentials: 'omit' })
                    if(!r.ok){ setImportMsg(`Fetch failed: ${r.status}`); return }
                    const j = await r.json()
                    if(!Array.isArray(j.shifts)) { setImportMsg('Invalid JSON: missing shifts[]'); return }
                    const importedShifts = (j.shifts as any[]).map((s,i)=> ({ id: s.id || `imp-${i}-${Math.random().toString(36).slice(2)}`, person: s.person, day: s.day, start: s.start, end: s.end, endDay: (s as any).endDay }))
                    setWorkingShifts(importedShifts as Shift[])
                    // Merge PTO
                    if(Array.isArray(j.pto)){
                      setWorkingPto(j.pto as PTO[])
                    }
                    // Merge Overrides
                    if(Array.isArray(j.overrides)){
                      setWorkingOverrides(j.overrides as Override[])
                    }
                    // Merge calendar segments into parent list via setter
                    if(Array.isArray(j.calendarSegs)){
                      setCalendarSegs(prev=> j.calendarSegs as any)
                    }
                    setIsDirty(true)
                    setImportMsg(`Imported ${importedShifts.length} shifts${Array.isArray(j.pto)?`, ${j.pto.length} PTO`:''}${Array.isArray(j.overrides)?`, ${j.overrides.length} overrides`:''}${Array.isArray(j.calendarSegs)?`, ${j.calendarSegs.length} postures`:''}. Review then Publish.`)
                  }catch(e:any){ setImportMsg(e?.message || 'Import failed') }
                }}>Fetch</button>
              <button
                className={["h-10 rounded-xl px-4 border font-medium", dark?"border-neutral-700":"border-neutral-300"].join(' ')}
                onClick={()=>{ setImportText(t=> t.trim() ? t : '{\n  "shifts": [],\n  "pto": [],\n  "calendarSegs": []\n}') }}
              >Paste JSON…</button>
            </div>
            <div className="md:col-span-3">
              {importText!=='' && (
                <div className="space-y-2">
                  <textarea className={["w-full h-40 border rounded-xl p-2 font-mono text-xs", dark&&"bg-neutral-900 border-neutral-700"].filter(Boolean).join(' ')} value={importText} onChange={(e)=>setImportText(e.target.value)} />
                  <div className="flex gap-2">
                    <button className={["h-9 rounded-xl px-4 border font-medium", dark?"bg-neutral-900 border-neutral-700 hover:bg-neutral-800":"bg-blue-600 border-blue-600 text-white"].join(' ')} onClick={()=>{
                      setImportMsg('')
                      try{
                        const j = JSON.parse(importText)
                        if(!Array.isArray(j.shifts)) { setImportMsg('Invalid JSON: missing shifts[]'); return }
                        const importedShifts = (j.shifts as any[]).map((s,i)=> ({ id: s.id || `imp-${i}-${Math.random().toString(36).slice(2)}`, person: s.person, day: s.day, start: s.start, end: s.end, endDay: (s as any).endDay }))
                        setWorkingShifts(importedShifts as Shift[])
                        if(Array.isArray(j.calendarSegs)) setCalendarSegs(j.calendarSegs as any)
                        if(Array.isArray(j.pto)) setWorkingPto(j.pto as PTO[])
                        if(Array.isArray(j.overrides)) setWorkingOverrides(j.overrides as Override[])
                        setIsDirty(true)
                        setImportMsg(`Imported ${importedShifts.length} shifts${Array.isArray(j.pto)?`, ${j.pto.length} PTO`:''}${Array.isArray(j.overrides)?`, ${j.overrides.length} overrides`:''}${Array.isArray(j.calendarSegs)?`, ${j.calendarSegs.length} postures`:''}. Review then Publish.`)
                      }catch(e:any){ setImportMsg(e?.message || 'Invalid JSON') }
                    }}>Load</button>
                    <button className={["h-9 rounded-xl px-4 border font-medium", dark?"border-neutral-700":"border-neutral-300"].join(' ')} onClick={()=> setImportText('')}>Clear</button>
                  </div>
                </div>
              )}
            </div>
            {importMsg && (
              <div className={["md:col-span-3 text-sm", importMsg.startsWith('Imported') ? (dark?"text-green-300":"text-green-700") : (dark?"text-red-300":"text-red-700")].join(' ')}>{importMsg}</div>
            )}
            <div className="md:col-span-3 text-xs opacity-70">Note: After import, click Publish to write the data to live. Agents list will update automatically from shift names.</div>
          </div>
        </div>
      )}

  {subtab==='Agents' ? (
        <WeekEditor
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
            // Mirror into Shifts tab when there are no pending local edits
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
      ) : subtab==='Shifts' ? (
  <div className={["rounded-xl p-2 border", dark?"bg-neutral-950 border-neutral-800 text-neutral-200":"bg-neutral-50 border-neutral-200 text-neutral-800"].join(' ')}>
          <AllAgentsWeekRibbons
            dark={dark}
            tz={tz}
            weekStart={weekStart}
            agents={includeHiddenAgents ? localAgents : localAgents.filter(a=> !a.hidden)}
            shifts={effectiveWorkingShifts}
            pto={pto}
            /* Hide posture data in this view */
            tasks={undefined as any}
            calendarSegs={undefined as any}
            visibleDays={visibleDays}
            scrollChunk={dayChunkIdx}
            showAllTimeLabels={showAllTimeLabels}
            sortMode={sortMode}
            sortDir={sortDir}
            highlightIds={modifiedIds}
            complianceHighlightIds={showCompliance ? complianceHighlightIds : undefined}
            complianceTipsByShiftId={showCompliance ? (function(){
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
            onToggleSelect={(id)=>{
              setSelectedShiftIds(prev=>{
                const next = new Set(prev)
                if(next.has(id)) next.delete(id); else next.add(id)
                return next
              })
            }}
            onDragAll={(name, delta)=>{
              const personsShifts = workingShifts.filter(s=> s.person===name)
              // Capture pre-change snapshot for undo (all shifts for this person)
              const prevPatches = personsShifts.map(s=> ({ id: s.id, patch: { day: s.day, start: s.start, end: s.end, endDay: (s as any).endDay } }))
              pushShiftsUndo(prevPatches)
              // Apply same delta to all their shifts, respecting wrap and endDay
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
              // Apply updates and mark modified ids so tags show
              const ids = new Set<string>(modifiedIds)
              const movedMap = new Map(moved.map(m=> [m.id, m]))
              setWorkingShifts(prev=> prev.map(s=> movedMap.get(s.id) || s))
              moved.forEach(s=> ids.add(s.id))
              setModifiedIds(ids)
              setIsDirty(true)
            }}
          onDragShift={(name, id, delta)=>{
              const DAYS_ = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'] as const
              const idxOf = (d:string)=> DAYS_.indexOf(d as any)
              const byIndex = (i:number)=> DAYS_[((i%7)+7)%7] as any
              const toMin = (t:string)=>{ const [h,m]=t.split(':').map(Number); return (h||0)*60+(m||0) }
              const addMin = (t:string, dm:number)=>{
                const [h,m]=t.split(':').map(Number); const tot=((h||0)*60+(m||0)+dm+10080)%1440; const hh=Math.floor(tot/60).toString().padStart(2,'0'); const mm=(tot%60).toString().padStart(2,'0'); return `${hh}:${mm}`
              }
              // Move the union of selected shifts and the dragged shift
              const moveIds = new Set<string>(selectedShiftIds)
              moveIds.add(id)
              const moveShifts = workingShifts.filter(s=> moveIds.has(s.id))
              if(moveShifts.length === 0) return
              if(moveShifts.length === 1){
                // Default single-shift move
                const s = moveShifts[0]
                pushShiftsUndo([{ id: s.id, patch: { day: s.day, start: s.start, end: s.end, endDay: (s as any).endDay } }])
                const sd = idxOf(s.day); const ed = idxOf((s as any).endDay || s.day)
                const sAbs = sd*1440 + toMin(s.start)
                let eAbs = ed*1440 + toMin(s.end); if(eAbs<=sAbs) eAbs+=1440
                const ns = sAbs+delta; const ne = eAbs+delta
                const nsDay = Math.floor(((ns/1440)%7+7)%7)
                const neDay = Math.floor(((ne/1440)%7+7)%7)
                const nsMin = ((ns%1440)+1440)%1440
                const neMin = ((ne%1440)+1440)%1440
                const patch = { day: byIndex(nsDay), start: addMin('00:00', nsMin), end: addMin('00:00', neMin), endDay: byIndex(neDay) }
                setWorkingShifts(prev=> prev.map(x=> x.id===s.id ? { ...x, ...patch } : x))
                setModifiedIds(prev=>{ const n=new Set(prev); n.add(s.id); return n })
                setIsDirty(true)
                return
              }
              // Multi-shift move for union
              const prevPatches = moveShifts.map(s=> ({ id: s.id, patch: { day: s.day, start: s.start, end: s.end, endDay: (s as any).endDay } }))
              pushShiftsUndo(prevPatches)
              const nextModified = new Set<string>(modifiedIds)
              for(const s of moveShifts){
                const sd = idxOf(s.day); const ed = idxOf((s as any).endDay || s.day)
                const sAbs = sd*1440 + toMin(s.start)
                let eAbs = ed*1440 + toMin(s.end); if(eAbs<=sAbs) eAbs+=1440
                const ns = sAbs+delta; const ne = eAbs+delta
                const nsDay = Math.floor(((ns/1440)%7+7)%7)
                const neDay = Math.floor(((ne/1440)%7+7)%7)
                const nsMin = ((ns%1440)+1440)%1440
                const neMin = ((ne%1440)+1440)%1440
                const patched = { ...s, day: byIndex(nsDay), start: addMin('00:00', nsMin), end: addMin('00:00', neMin), endDay: byIndex(neDay) }
                setWorkingShifts(prev=> prev.map(x=> x.id===patched.id ? patched : x))
                nextModified.add(patched.id)
              }
              setModifiedIds(nextModified)
              setIsDirty(true)
          }}
          onResizeShift={(name, id, deltaEdge, delta)=>{
            // Resize only this shift; keep other selected shifts unchanged
            const DAYS_ = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'] as const
            const idxOf = (d:string)=> DAYS_.indexOf(d as any)
            const byIndex = (i:number)=> DAYS_[((i%7)+7)%7] as any
            const toMin = (t:string)=>{ const [h,m]=t.split(':').map(Number); return (h||0)*60+(m||0) }
            const addMin = (t:string, dm:number)=>{
              const [h,m]=t.split(':').map(Number); const tot=((h||0)*60+(m||0)+dm+10080)%1440; const hh=Math.floor(tot/60).toString().padStart(2,'0'); const mm=(tot%60).toString().padStart(2,'0'); return `${hh}:${mm}`
            }
            const s = workingShifts.find(s=> s.id===id)
            if(!s) return
            // Undo snapshot
            pushShiftsUndo([{ id: s.id, patch: { day: s.day, start: s.start, end: s.end, endDay: (s as any).endDay } }])
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
            setWorkingShifts(prev=> prev.map(x=> x.id===s.id ? { ...x, ...patch } : x))
            setModifiedIds(prev=>{ const n=new Set(prev); n.add(s.id); return n })
            setIsDirty(true)
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
            const visibleAgents = (includeHiddenAgents ? localAgents : localAgents.filter(a=> !a.hidden))
              .map(a=> [a.firstName, a.lastName].filter(Boolean).join(' ').trim())
              .filter(Boolean)
            return (
              <CoverageHeatmap
                dark={dark}
                tz={tz}
                weekStart={weekStart}
                shifts={effectiveWorkingShifts}
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
                  onDelete={(id)=>{ setTasks(prev=> prev.filter(x=> x.id!==id)); setCalendarSegs(prev=> prev.filter(cs=> cs.taskId!==id)) }}
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
                                        <button onClick={()=>{ if(confirm('Remove this assignment?')) setCalendarSegs(prev=> prev.filter((_,i)=> i!==r._idx)) }} className={["px-2 py-1 rounded border text-xs", "bg-red-600 border-red-600 text-white"].join(' ')}>Delete</button>
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
                      setIsDirty(true)
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
                                          setIsDirty(true)
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
                      setIsDirty(true)
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
                      setIsDirty(true)
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
                            <th className="px-3 py-2 text-right text-xs font-semibold w-24">Actions</th>
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
                                  <div className="flex justify-end">
                                    <button
                                      type="button"
                                      className={["px-2 py-1 rounded border text-xs", "bg-red-600 border-red-600 text-white hover:bg-red-500"].join(' ')}
                                      onClick={()=>{
                                        if(confirm('Delete override?')){
                                          setWorkingOverrides(prev=> prev.filter(x=> x.id!==o.id))
                                          setIsDirty(true)
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
            </div>
          </div>
          <div className={["mt-4 rounded-lg border overflow-hidden", dark?"bg-neutral-900 border-neutral-800":"bg-white border-neutral-200"].join(' ')}>
            <div className={["flex items-center justify-between px-3 py-2 border-b", dark?"border-neutral-800 bg-neutral-900 text-neutral-100":"border-neutral-200 bg-neutral-50 text-neutral-800"].join(' ')}>
              <span className="text-sm font-semibold">Weekly PTO calendar</span>
              <span className="text-xs opacity-70">Full-day entries by person</span>
            </div>
            <div className="px-3 pb-3">
              {(()=>{
                const H_PX = 220
                const dayHeight = 22
                const week0 = parseYMD(weekStart)
                const ymds = DAYS.map((_,i)=> fmtYMD(addDays(week0, i)))
                return (
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
                        <div key={day} className={["rounded-lg p-2 relative overflow-hidden", dark?"bg-neutral-950":"bg-neutral-50"].join(' ')} style={{ height: heightPx }}>
                          <div className="font-medium mb-1 flex items-baseline justify-between">
                            <span>{day}</span>
                            <span className="text-xs opacity-70">{parseInt(ymd.slice(8), 10)}</span>
                          </div>
                          <div className="absolute left-2 right-2 bottom-2 top-7">
                            {placed.map(({p, lane})=>{
                              const top = lane * (dayHeight + 6)
                              const disp = agentDisplayName(localAgents as any, p.agentId, p.person)
                              return (
                                <div key={`${p.id}-${ymd}`} className={["absolute left-0 right-0 rounded-md px-2 h-[22px] flex items-center justify-between", dark?"bg-neutral-800 text-neutral-100 border border-neutral-700":"bg-white text-neutral-900 border border-neutral-300 shadow-sm"].join(' ')} style={{ top }} title={`${disp} • ${p.startDate} → ${p.endDate}`}>
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
                )
              })()}
            </div>
          </div>
          </div>
        ) : null
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

function MagicLoginPanel({ dark }:{ dark:boolean }){
  const [email, setEmail] = React.useState('')
  const [msg, setMsg] = React.useState('')
  const [link, setLink] = React.useState<string|undefined>(undefined)
  return (
    <form onSubmit={(e)=>{ e.preventDefault(); (async()=>{
      setMsg(''); setLink(undefined)
      const r = await requestMagicLink(email, 'admin')
      if(r.ok){
        if(r.link){ setLink(r.link); setMsg('Dev mode: click the link below to sign in.') }
        else setMsg('Check your inbox for the sign-in link.')
      }else{
        setMsg('Failed to request link. Check email format and try again.')
      }
    })() }}>
      <div className="flex gap-2 items-center">
        <input type="email" required className={["flex-1 border rounded-xl px-3 py-2", dark && "bg-neutral-900 border-neutral-700"].filter(Boolean).join(' ')} value={email} onChange={(e)=>setEmail(e.target.value)} placeholder="you@company.com" />
        <button type="submit" className={["rounded-xl px-3 py-2 text-sm font-medium border", dark ? "bg-neutral-800 border-neutral-700" : "bg-blue-600 text-white border-blue-600"].join(' ')}>Email link</button>
      </div>
      {msg && (<div className="text-xs mt-2 opacity-80">{msg}</div>)}
      {link && (
        <div className="mt-2 text-xs break-all">
          <a className="underline" href={link} target="_blank" rel="noreferrer">{link}</a>
        </div>
      )}
    </form>
  )
}
