import { toMin, minToHHMM, uid, startOfWeek, addDays, fmtDateRange, fmtYMD, nowInTZ, tzAbbrev, shiftsForDayInTZ, agentDisplayName, agentIdByName } from '../lib/utils'
import { hasPersonShiftConflict } from '../lib/overlap'
import React from 'react'
import Toggle from '../components/Toggle'
// Legacy local password gate removed. Admin auth now uses dev proxy cookie+CSRF only.
<<<<<<< HEAD
import { cloudPost, cloudPostDetailed, login, logout, getApiBase, getApiPrefix, hasCsrfToken, getCsrfDiagnostics, cloudPostAgents } from '../lib/api'
=======
import { cloudPost, cloudPostDetailed, ensureSiteSession, login, logout, getApiBase, getApiPrefix, isUsingDevProxy, hasCsrfCookie, hasCsrfToken, getCsrfDiagnostics, cloudPostAgents, requestMagicLink, cloudCreateProposal, cloudListProposals, cloudGetProposal, cloudGet } from '../lib/api'
>>>>>>> c76a6b2a8c4404b7ec7131ea39ccd1b1d3b55a13
import WeekEditor from '../components/v2/WeekEditor'
import WeeklyPosturesCalendar from '../components/WeeklyPosturesCalendar'
import ProposalDiffVisualizer from '../components/ProposalDiffVisualizer'
import AllAgentsWeekRibbons from '../components/AllAgentsWeekRibbons'
import CoverageHeatmap from '../components/CoverageHeatmap'
import type { PTO, Shift, Task, Override } from '../types'
import type { CalendarSegment } from '../lib/utils'
import TaskConfigPanel from '../components/TaskConfigPanel'
import { DAYS } from '../constants'
import { uid, toMin, shiftsForDayInTZ, agentIdByName, agentDisplayName, parseYMD, addDays, fmtYMD, minToHHMM } from '../lib/utils'

type AgentRow = { firstName: string; lastName: string; tzId?: string; hidden?: boolean; isSupervisor?: boolean; supervisorId?: string|null; notes?: string }

<<<<<<< HEAD
export default function ManageV2Page({ dark, agents, onAddAgent, onUpdateAgent, onDeleteAgent, weekStart, tz, shifts, pto, tasks, calendarSegs, onUpdateShift, onDeleteShift, onAddShift, setTasks, setCalendarSegs, setPto }:{ dark:boolean; agents: AgentRow[]; onAddAgent?: (a:{ firstName:string; lastName:string; tzId:string })=>void; onUpdateAgent?: (index:number, a:AgentRow)=>void; onDeleteAgent?: (index:number)=>void; weekStart: string; tz:{ id:string; label:string; offset:number }; shifts: Shift[]; pto: PTO[]; tasks: Task[]; calendarSegs: CalendarSegment[]; onUpdateShift?: (id:string, patch: Partial<Shift>)=>void; onDeleteShift?: (id:string)=>void; onAddShift?: (s: Shift)=>void; setTasks: (f:(prev:Task[])=>Task[])=>void; setCalendarSegs: (f:(prev:CalendarSegment[])=>CalendarSegment[])=>void; setPto: (f:(prev:PTO[])=>PTO[])=>void }){
  // Auto-unlocked in dev; in prod we still require login once.
=======
export default function ManageV2Page({ dark, agents, onAddAgent, onUpdateAgent, onDeleteAgent, weekStart, tz, shifts, pto, overrides, tasks, calendarSegs, onUpdateShift, onDeleteShift, onAddShift, setTasks, setCalendarSegs, setPto, setOverrides }:{ dark:boolean; agents: AgentRow[]; onAddAgent?: (a:{ firstName:string; lastName:string; tzId:string })=>void; onUpdateAgent?: (index:number, a:AgentRow)=>void; onDeleteAgent?: (index:number)=>void; weekStart: string; tz:{ id:string; label:string; offset:number }; shifts: Shift[]; pto: PTO[]; overrides: Override[]; tasks: Task[]; calendarSegs: CalendarSegment[]; onUpdateShift?: (id:string, patch: Partial<Shift>)=>void; onDeleteShift?: (id:string)=>void; onAddShift?: (s: Shift)=>void; setTasks: (f:(prev:Task[])=>Task[])=>void; setCalendarSegs: (f:(prev:CalendarSegment[])=>CalendarSegment[])=>void; setPto: (f:(prev:PTO[])=>PTO[])=>void; setOverrides: (f:(prev:Override[])=>Override[])=>void }){
  // Admin auth gate: unlocked if CSRF cookie exists (dev proxy or prod API)
>>>>>>> c76a6b2a8c4404b7ec7131ea39ccd1b1d3b55a13
  const [unlocked, setUnlocked] = React.useState(false)
  const [autoTried, setAutoTried] = React.useState(false)
  const [msg, setMsg] = React.useState('')
<<<<<<< HEAD
=======
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
>>>>>>> c76a6b2a8c4404b7ec7131ea39ccd1b1d3b55a13
  const apiBase = React.useMemo(()=> getApiBase(), [])
  const apiPrefix = React.useMemo(()=> getApiPrefix(), [])
  React.useEffect(()=>{
    if(hasCsrfToken()){
      setUnlocked(true); setMsg('')
    } else if(!autoTried){
      setAutoTried(true)
      // Attempt implicit dev auto-login with blank password (DEV_MODE server accepts)
      login('').then(r=>{ if(r.ok && hasCsrfToken()) setUnlocked(true) })
    }
  },[autoTried])
  const [localAgents, setLocalAgents] = React.useState<AgentRow[]>(agents)
  React.useEffect(()=>{ setLocalAgents(agents) }, [agents])
  const tabs = ['Agents','Shifts','Postures','PTO & Overrides','Proposals'] as const
  type Subtab = typeof tabs[number]
  const [subtab, setSubtab] = React.useState<Subtab>('Agents')
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
  // Proposals tab state
  type ProposalMeta = { id:string; title?:string; status:string; createdAt:number; updatedAt:number; weekStart?:string; tzId?:string }
  const [proposals, setProposals] = React.useState<ProposalMeta[]>([])
  const [loadingProposals, setLoadingProposals] = React.useState(false)
  const [selectedProposalId, setSelectedProposalId] = React.useState<string>('')
  const [proposalDetail, setProposalDetail] = React.useState<any>(null)
  const [liveDoc, setLiveDoc] = React.useState<any>(null)
  const [diffMsg, setDiffMsg] = React.useState<string>('')
  const [showVisualDiff, setShowVisualDiff] = React.useState<boolean>(false)
  // Track whether the working session started from live (so full undo returns to Live)
  const startedFromLiveRef = React.useRef(false)
  // Local autosave for unpublished changes (single snapshot per week/tz)
  const UNPUB_KEY = React.useMemo(()=> `schedule2.v2.unpublished.${weekStart}.${tz.id}`,[weekStart,tz.id])
  const LEGACY_DRAFT_KEY = React.useMemo(()=> `schedule2.v2.draft.${weekStart}.${tz.id}`,[weekStart,tz.id])
  // Keep working copy synced to live only when not dirty
  React.useEffect(()=>{ if(!isDirty) setWorkingShifts(shifts) },[shifts,isDirty])
  React.useEffect(()=>{ if(!isDirty) setWorkingPto(pto) },[pto,isDirty])
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
<<<<<<< HEAD
      try{ localStorage.removeItem(DRAFT_KEY) }catch{}
=======
>>>>>>> c76a6b2a8c4404b7ec7131ea39ccd1b1d3b55a13
    }
<<<<<<< HEAD
=======
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
    try{
      const orig: Shift[] = Array.isArray(workingShifts) ? workingShifts : []
      // Pre-split any overnight shifts into day-bounded pieces so day-level replacement is precise
      const pieces: Shift[] = []
      for(const s of orig){
        const sMin = toMin(s.start)
        const eMinRaw = s.end==='24:00' ? 1440 : toMin(s.end)
        const crosses = typeof (s as any).endDay === 'string' ? ((s as any).endDay !== s.day) : (eMinRaw < sMin && s.end !== '24:00')
        if(crosses){
          const endDay = (s as any).endDay || (['Sun','Mon','Tue','Wed','Thu','Fri','Sat'] as const)[((['Sun','Mon','Tue','Wed','Thu','Fri','Sat'] as const).indexOf(s.day as any)+1)%7]
          pieces.push({ ...s, end: '24:00', endDay } as any)
          pieces.push({ ...s, day: endDay as any, start: '00:00', end: s.end, endDay } as any)
        }else{
          pieces.push(s)
        }
      }
      const ovs: Override[] = Array.isArray(workingOverrides) ? workingOverrides : []
      if(ovs.length===0) return pieces
      const week0 = parseYMD(weekStart)
      const week6 = addDays(week0, 6)
      const inWeek = (ymd: string)=> ymd >= fmtYMD(week0) && ymd <= fmtYMD(week6)
      const dayStr = (d: Date)=> ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d.getDay()] as any
      const addDaysY = (d: Date, n: number)=> addDays(d, n)
      const toY = (d: Date)=> fmtYMD(d)
      const skipAddForYmd = new Set<string>()
      const removeWindowFor = (person:string, day:string, rmStartMin:number, rmEndMin:number)=>{
        const clamp = (n:number)=> Math.max(0, Math.min(1440, n))
        const R0 = clamp(rmStartMin), R1 = clamp(rmEndMin)
        if(!(R1>R0)) return
        for(let i=pieces.length-1; i>=0; i--){
          const p = pieces[i]
          if(p.person!==person || p.day!==day) continue
          const pS = toMin(p.start)
          const pE = p.end==='24:00' ? 1440 : toMin(p.end)
          const L = Math.max(pS, R0)
          const U = Math.min(pE, R1)
          if(!(U> L)) continue
          // overlap exists: split/trim
          const beforeLen = L - pS
          const afterLen = pE - U
          // Remove the original
          pieces.splice(i,1)
          const makePiece = (startMin:number, endMin:number, suffix:string)=>{
            const endStr = endMin>=1440 ? '24:00' : `${String(Math.floor(endMin/60)).padStart(2,'0')}:${String(endMin%60).padStart(2,'0')}`
            const startStr = `${String(Math.floor(startMin/60)).padStart(2,'0')}:${String(startMin%60).padStart(2,'0')}`
            const np: any = { ...p, id: `${p.id}${suffix}`, start: startStr, end: endStr }
            // If not ending at 24:00 anymore, ensure no cross-midnight flag remains
            if(endStr !== '24:00' && np.endDay && np.endDay !== np.day){ delete np.endDay }
            return np as Shift
          }
          // Push in reverse order to maintain original relative ordering after splice
          if(afterLen>0){ pieces.splice(i, 0, makePiece(U, pE, '-b')) }
          if(beforeLen>0){ pieces.splice(i, 0, makePiece(pS, L, '-a')) }
        }
      }
      const applyOccurrence = (start: Date, end: Date, ov: Override)=>{
        // iterate each day of this occurrence
        let cur = new Date(start)
        const last = new Date(end)
        while(cur <= last){
          const ymd = toY(cur)
          if(inWeek(ymd)){
            const dStr = dayStr(cur)
            if(ov.start && ov.end){
              // Replace the whole day for this person, then add the override window
              for(let i = pieces.length - 1; i >= 0; i--){
                const p = pieces[i]
                if(p.person === ov.person && p.day === dStr) pieces.splice(i,1)
              }
              if(!skipAddForYmd.has(ymd)){
                const s = ov.start
                const e = ov.end
                const sMin = toMin(s)
                const eMin = toMin(e)
                const overnight = (eMin <= sMin) && !(e==='24:00')
                const endDay = overnight ? dayStr(addDaysY(cur, 1)) : undefined
                pieces.push({
                  id: `ov:${ov.id}:${ymd}`,
                  person: ov.person,
                  agentId: agentIdByName(localAgents as any, ov.person),
                  day: dStr,
                  start: s,
                  end: e,
                  ...(endDay ? { endDay } : {})
                } as any)
                if(overnight){
                  // On the following day, trim from 00:00 up to max(end, 08:00)
                  const nextDay = dayStr(addDaysY(cur, 1))
                  const blackoutEnd = Math.max(eMin % 1440, 480) // minutes
                  removeWindowFor(ov.person, nextDay, 0, blackoutEnd)
                  // Avoid double-adding on the next day when loop advances
                  const nextY = fmtYMD(addDaysY(cur, 1))
                  skipAddForYmd.add(nextY)
                }
              }
            } else {
              // No-time override: trim 8 hours starting at earliest shift start on that day
              let anchor: number | null = null
              for(const p of pieces){
                if(p.person===ov.person && p.day===dStr){
                  const st = toMin(p.start)
                  if(anchor==null || st < anchor) anchor = st
                }
              }
              if(anchor!=null){
                removeWindowFor(ov.person, dStr, anchor, anchor + 480)
              }
            }
          }
          cur = addDaysY(cur, 1)
        }
      }
      for(const ov of ovs){
        let s = parseYMD(ov.startDate)
        let e = parseYMD(ov.endDate)
        if(ov.recurrence?.rule === 'weekly'){
          const until = ov.recurrence.until ? parseYMD(ov.recurrence.until) : null
          // fast-forward whole range by weeks until it overlaps the current week window
          let guard = 0
          while(e < week0 && guard < 200){
            s = addDaysY(s, 7)
            e = addDaysY(e, 7)
            guard++
            if(until && s > until) break
          }
          // Push each weekly occurrence that starts within or before the week and overlaps it
          while(s <= week6 && (!until || s <= until)){
            applyOccurrence(s, e, ov)
            s = addDaysY(s, 7)
            e = addDaysY(e, 7)
          }
        } else {
          applyOccurrence(s, e, ov)
        }
      }
      return pieces
    }catch{
      return workingShifts
    }
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
>>>>>>> c76a6b2a8c4404b7ec7131ea39ccd1b1d3b55a13
  }, [localAgents, shifts, calendarSegs, pto])
  // If still not unlocked, show fast, minimal status (rare in dev).
  if(!unlocked){
    return <section className={["rounded-2xl p-6", dark?"bg-neutral-900":"bg-white shadow-sm"].join(' ')}>
      <div className="text-sm opacity-70">Initializing session… {msg}</div>
    </section>
  }
  const activeTasks = React.useMemo(()=> tasks.filter(t=>!t.archived), [tasks])
  const [assignee, setAssignee] = React.useState<string>('')
  const [assignDay, setAssignDay] = React.useState<typeof DAYS[number]>('Mon' as any)
  const [assignStart, setAssignStart] = React.useState('09:00')
  const [assignEnd, setAssignEnd] = React.useState('10:00')
  const [assignTaskId, setAssignTaskId] = React.useState<string>('')
  const [assignEndDay, setAssignEndDay] = React.useState<typeof DAYS[number]>('Mon' as any)
  React.useEffect(()=>{ if(!assignTaskId && activeTasks[0]) setAssignTaskId(activeTasks[0].id) },[activeTasks, assignTaskId])
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
  const [pt_filter, setPtFilter] = React.useState('')
  const [ptoEditing, setPtoEditing] = React.useState<PTO | null>(null)
  const [pt_e_person, setPtEPerson] = React.useState('')
  const [pt_e_start, setPtEStart] = React.useState('')
  const [pt_e_end, setPtEEnd] = React.useState('')
  const [pt_e_notes, setPtENotes] = React.useState('')
  const startPtoEdit = (r: PTO)=>{ setPtoEditing(r); setPtEPerson(r.person); setPtEStart(r.startDate); setPtEEnd(r.endDate); setPtENotes(r.notes||'') }
  const clearPtoEdit = ()=>{ setPtoEditing(null); setPtEPerson(''); setPtEStart(''); setPtEEnd(''); setPtENotes('') }

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
    const agentsPayload = localAgents.map(a=> ({
      id: (a as any).id || Math.random().toString(36).slice(2),
      firstName: a.firstName||'',
      lastName: a.lastName||'',
      tzId: a.tzId,
      hidden: !!a.hidden,
      isSupervisor: !!(a as any).isSupervisor,
      supervisorId: (a as any).supervisorId ?? null,
      notes: (a as any).notes
    }))
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
    const agentsPayload = localAgents.map(a=> ({
      id: (a as any).id || Math.random().toString(36).slice(2),
      firstName: a.firstName||'',
      lastName: a.lastName||'',
      tzId: a.tzId,
      hidden: !!a.hidden,
      isSupervisor: !!(a as any).isSupervisor,
      supervisorId: (a as any).supervisorId ?? null,
      notes: (a as any).notes
    }))
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
  const handleAdd = React.useCallback((a:{ firstName:string; lastName:string; tzId:string })=>{
  onAddAgent?.(a); setLocalAgents(prev=> prev.concat([{ firstName: a.firstName, lastName: a.lastName, tzId: a.tzId, hidden: false }]))
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
            setMsg('')
            const res = await login(pwInput)
            if(res.ok){
              // Try to establish site session (dev proxy may need different password; we optimistically reuse admin pw)
              try{ await ensureSiteSession(pwInput) }catch{}
              // Extra probe: confirm schedule readable (site session gate)
              let siteOk = true
              try{
                const r2 = await fetch(`${apiBase}${apiPrefix}/schedule`, { method:'GET', credentials:'include' })
                if(!r2.ok){
                  siteOk = false
                  if(r2.status===401){
                    try{ const j = await r2.clone().json(); if(j?.error==='missing_site_session'){
                      setMsg('Admin session ok but secondary session missing; reload if persists.')
                    } }catch{}
                  }
                }
              }catch{}
              const diag = getCsrfDiagnostics()
              if(hasCsrfToken() && siteOk){
                setUnlocked(true); setMsg(''); try{ localStorage.setItem('schedule_admin_unlocked','1') }catch{}
<<<<<<< HEAD
                // Proactively push agents metadata so Hidden flags propagate immediately post-login
                try{ cloudPostAgents(agents.map(a=> ({ id: (a as any).id || Math.random().toString(36).slice(2), firstName: a.firstName||'', lastName: a.lastName||'', tzId: a.tzId, hidden: !!a.hidden }))) }catch{}
              } else if(!siteOk){
                setUnlocked(false)
=======
        // Proactively push agents metadata so Hidden flags propagate immediately post-login
        try{ cloudPostAgents(agents.map(a=> ({ id: (a as any).id || Math.random().toString(36).slice(2), firstName: a.firstName||'', lastName: a.lastName||'', tzId: a.tzId, hidden: !!a.hidden, isSupervisor: !!(a as any).isSupervisor, supervisorId: (a as any).supervisorId ?? null, notes: (a as any).notes }))) }catch{}
>>>>>>> c76a6b2a8c4404b7ec7131ea39ccd1b1d3b55a13
              } else {
                setUnlocked(false); setMsg('Signed in, but CSRF missing. Check cookie Domain/Path and SameSite; reload and try again.')
              }
            } else {
              setMsg(res.status===401?'Incorrect password':'Login failed')
            }
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
            >{t}</button>
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
                let ns = sAbs+delta; let ne = eAbs+delta
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
          />
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
                      <select className={["w-full border rounded-xl px-3 py-2", dark&&"bg-neutral-900 border-neutral-700"].filter(Boolean).join(' ')} value={assignee} onChange={e=>setAssignee(e.target.value)}>
                        <option value="">—</option>
                        {allPeople.map(p=> <option key={p} value={p}>{p}</option>)}
                      </select>
                    </label>
                    <div className="grid grid-cols-4 gap-3">
                      <label className="text-sm flex flex-col col-span-1">
                        <span className="mb-1">Day</span>
                        <select className={["w-full border rounded-xl px-3 py-2", dark&&"bg-neutral-900 border-neutral-700"].filter(Boolean).join(' ')} value={assignDay} onChange={e=>setAssignDay(e.target.value as any)}>
                          {DAYS.map(d=> <option key={d} value={d}>{d}</option>)}
                        </select>
                      </label>
                      <label className="text-sm flex flex-col col-span-1">
                        <span className="mb-1">Start</span>
                        <input type="time" className={["w-full border rounded-xl px-3 py-2", dark&&"bg-neutral-900 border-neutral-700"].filter(Boolean).join(' ')} value={assignStart} onChange={e=>setAssignStart(e.target.value)} />
                      </label>
                      <label className="text-sm flex flex-col col-span-1">
                        <span className="mb-1">End</span>
                        <input type="time" className={["w-full border rounded-xl px-3 py-2", dark&&"bg-neutral-900 border-neutral-700"].filter(Boolean).join(' ')} value={assignEnd} onChange={e=>setAssignEnd(e.target.value)} />
                      </label>
                        <label className="text-sm flex flex-col col-span-1">
                          <span className="mb-1">End Day</span>
                          <select className={["w-full border rounded-xl px-3 py-2", dark&&"bg-neutral-900 border-neutral-700"].filter(Boolean).join(' ')} value={assignEndDay} onChange={e=>setAssignEndDay(e.target.value as any)}>
                            {DAYS.map(d=> <option key={d} value={d}>{d}</option>)}
                          </select>
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
<<<<<<< HEAD
                        const overlaps = !hasPersonShiftConflict(dayShiftsLocal as any, assignee, assignDay as any, assignStart, assignEnd, assignEndDay as any)
                        if(!overlaps){ alert('No shift overlaps that time for this agent on that day. This posture will be saved but won\'t display until there is an overlapping shift.'); }
=======
                        // If no overlapping shift exists, proceed silently; posture may not display until overlap exists
>>>>>>> c76a6b2a8c4404b7ec7131ea39ccd1b1d3b55a13
                          setCalendarSegs(prev=> prev.concat([{ person: assignee, agentId: agentIdByName(localAgents as any, assignee), day: assignDay, endDay: assignEndDay, start: assignStart, end: assignEnd, taskId: assignTaskId } as any]))
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
                    <div className="grid grid-cols-1 md:grid-cols-6 gap-3 items-end">
                      <label className="text-sm flex flex-col">
                        <span className="mb-1">Agent</span>
                        <select className={["w-full border rounded px-2 py-1", dark&&"bg-neutral-900 border-neutral-700"].filter(Boolean).join(' ')} value={eaPerson} onChange={e=>setEaPerson(e.target.value)}>
                          {allPeople.map(p=> <option key={p} value={p}>{p}</option>)}
                        </select>
                      </label>
                      <label className="text-sm flex flex-col">
                        <span className="mb-1">Day</span>
                        <select className={["w-full border rounded px-2 py-1", dark&&"bg-neutral-900 border-neutral-700"].filter(Boolean).join(' ')} value={eaDay} onChange={e=>setEaDay(e.target.value as any)}>
                          {DAYS.map(d=> <option key={d} value={d}>{d}</option>)}
                        </select>
                      </label>
                      <label className="text-sm flex flex-col"><span className="mb-1">Start</span><input type="time" className={["w-full border rounded px-2 py-1", dark&&"bg-neutral-900 border-neutral-700"].filter(Boolean).join(' ')} value={eaStart} onChange={e=>setEaStart(e.target.value)} /></label>
                      <label className="text-sm flex flex-col"><span className="mb-1">End</span><input type="time" className={["w-full border rounded px-2 py-1", dark&&"bg-neutral-900 border-neutral-700"].filter(Boolean).join(' ')} value={eaEnd} onChange={e=>setEaEnd(e.target.value)} /></label>
                      <label className="text-sm flex flex-col">
                        <span className="mb-1">End Day</span>
                        <select className={["w-full border rounded px-2 py-1", dark&&"bg-neutral-900 border-neutral-700"].filter(Boolean).join(' ')} value={eaEndDay} onChange={e=>setEaEndDay(e.target.value as any)}>
                          {DAYS.map(d=> <option key={d} value={d}>{d}</option>)}
                        </select>
                      </label>
                      <label className="text-sm flex flex-col">
                        <span className="mb-1">Posture</span>
                        <select className={["w-full border rounded px-2 py-1", dark&&"bg-neutral-900 border-neutral-700"].filter(Boolean).join(' ')} value={eaTaskId} onChange={e=>setEaTaskId(e.target.value)}>
                          {tasks.filter(t=>!t.archived).map(t=> <option key={t.id} value={t.id}>{t.name}</option>)}
                        </select>
                      </label>
                      <div className="md:col-span-6 flex gap-2">
                        <button onClick={()=>{
                          if(editingIdx==null) return
                          if(!eaPerson.trim()) return alert('Choose an agent')
                          if(!eaTaskId) return alert('Choose a posture')
                          const aS=toMin(eaStart), aE=toMin(eaEnd)
                          if(eaEndDay===eaDay && !(aE>aS)) return alert('End must be after start (or choose a later End Day)')
                          const dayShiftsLocal = shiftsForDayInTZ(shifts, eaDay as any, tz.offset).filter(s=>s.person===eaPerson)
                          const overlaps = dayShiftsLocal.some(s=>{ const sS=toMin(s.start); const sE=s.end==='24:00'?1440:toMin(s.end); return aS < sE && aE > sS })
<<<<<<< HEAD
                          const overlaps = !hasPersonShiftConflict(dayShiftsLocal as any, eaPerson, eaDay as any, eaStart, eaEnd, eaEndDay as any)
                          if(!overlaps){ alert('No shift overlaps that time for this agent on that day. This posture will be saved but won\'t display until there is an overlapping shift.') }
=======
                          // If no overlapping shift exists, proceed silently; posture may not display until overlap exists
>>>>>>> c76a6b2a8c4404b7ec7131ea39ccd1b1d3b55a13
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
                  />
                ))}
            </div>
          </div>
        ) : subtab==='PTO & Overrides' ? (
          <div>
          {/* Weekly PTO calendar */}
          <div className={["mt-3 rounded-xl p-3 border", dark?"bg-neutral-900 border-neutral-800":"bg-white border-neutral-200"].join(' ')}>
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm font-medium">Weekly PTO calendar</div>
              <div className="text-xs opacity-70">Full-day entries by person</div>
            </div>
            {(()=>{
              const H_PX = 220
              const dayHeight = 22
              const week0 = parseYMD(weekStart)
              const ymds = DAYS.map((_,i)=> fmtYMD(addDays(week0, i)))
              // Precompute per-day grouped pto entries
              return (
                <div className="grid grid-cols-1 md:grid-cols-7 gap-3 text-sm">
                  {DAYS.map((day, di)=>{
                    const ymd = ymds[di]
                    const dayItems = workingPto
                      .filter(p=> (!pt_filter || p.person===pt_filter) && p.startDate <= ymd && p.endDate >= ymd)
                      .slice()
                      .sort((a,b)=> a.person.localeCompare(b.person) || a.startDate.localeCompare(b.startDate))
                    // Assign lanes per person for the day to avoid overlap
                    const laneByPerson = new Map<string, number>()
                    let nextLane = 0
                    const placed = dayItems.map(p=>{
                      let lane = laneByPerson.get(p.person)
                      if(lane==null){ lane = nextLane++; laneByPerson.set(p.person, lane) }
                      return { p, lane }
                    })
                    const laneCount = Math.max(placed.length, 1)
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
          <div className="flex flex-col sm:flex-row gap-3 items-start">
            <div className="space-y-3 flex-1 min-w-0">
              <div className={["rounded-xl p-3 border", dark?"bg-neutral-950 border-neutral-800 text-neutral-200":"bg-neutral-50 border-neutral-200 text-neutral-800"].join(' ')}>
            <div className="text-sm font-medium mb-2">Add PTO</div>
            <div className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end mb-3">
              <label className="text-sm flex flex-col">
                <span className="mb-1">Agent</span>
                <select className={["w-full border rounded-xl px-3 py-2", dark&&"bg-neutral-900 border-neutral-700"].filter(Boolean).join(' ')} value={pt_agent} onChange={(e)=> setPtAgent(e.target.value)}>
                  <option value="">—</option>
                  {allPeople.map(p=> <option key={p} value={p}>{p}</option>)}
                </select>
              </label>
              <label className="text-sm flex flex-col">
                <span className="mb-1">Start date</span>
                <input type="date" className={["w-full border rounded-xl px-3 py-2", dark&&"bg-neutral-900 border-neutral-700"].filter(Boolean).join(' ')} value={pt_start} onChange={(e)=> setPtStart(e.target.value)} />
              </label>
              <label className="text-sm flex flex-col">
                <span className="mb-1">End date</span>
                <input type="date" className={["w-full border rounded-xl px-3 py-2", dark&&"bg-neutral-900 border-neutral-700"].filter(Boolean).join(' ')} value={pt_end} onChange={(e)=> setPtEnd(e.target.value)} />
              </label>
              <label className="text-sm flex flex-col md:col-span-2">
                <span className="mb-1">Notes</span>
                <input type="text" placeholder="Optional" className={["w-full border rounded-xl px-3 py-2", dark&&"bg-neutral-900 border-neutral-700"].filter(Boolean).join(' ')} value={pt_notes} onChange={(e)=> setPtNotes(e.target.value)} />
              </label>
              <div className="md:col-span-5 flex gap-2">
                <button className={["h-10 rounded-xl px-4 border font-medium", dark?"bg-neutral-900 border-neutral-700":"bg-blue-600 border-blue-600 text-white"].join(' ')} onClick={()=>{
                  if(!pt_agent) return alert('Choose an agent')
                  if(!pt_start || !pt_end) return alert('Choose start and end dates')
                  if(pt_end < pt_start) return alert('End date must be on/after start date')
                  const newItem: PTO = { id: uid(), person: pt_agent, agentId: agentIdByName(localAgents as any, pt_agent), startDate: pt_start, endDate: pt_end, notes: pt_notes || undefined }
                  setWorkingPto(prev=> prev.concat([newItem] as any))
                  setPtAgent(''); setPtStart(''); setPtEnd(''); setPtNotes('')
                  setIsDirty(true)
                }}>Add PTO</button>
                <div className="ml-auto inline-flex items-center gap-2">
                  <span className={dark?"text-neutral-300":"text-neutral-700"}>Filter</span>
                  <select className={["border rounded-xl px-2 py-1", dark?"bg-neutral-900 border-neutral-700":"bg-white border-neutral-300"].join(' ')} value={pt_filter} onChange={(e)=> setPtFilter(e.target.value)}>
                    <option value="">All</option>
                    {allPeople.map(p=> <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
              </div>
            </div>

            {(()=>{
              // component state
              return null
            })()}

            {(()=>{
              // Render grouped PTO list (collapsible per agent)
              const entries = workingPto
                .filter(x=> !pt_filter || x.person===pt_filter)
                .slice()
                .sort((a,b)=> a.person.localeCompare(b.person) || a.startDate.localeCompare(b.startDate))
              if(entries.length===0) return <div className="text-sm opacity-70">No PTO entries.</div>
              const byPerson = new Map<string, PTO[]>()
              for(const p of entries){ const arr = byPerson.get(p.person)||[]; arr.push(p); byPerson.set(p.person, arr) }
              const people = Array.from(byPerson.keys()).sort()
              return (
                <div className="space-y-3">
                  {people.map(person=>{
                    const rows = byPerson.get(person)!.slice().sort((a,b)=> a.startDate.localeCompare(b.startDate))
                    return (
                      <details key={person} className={["rounded-xl border overflow-hidden", dark?"border-neutral-800":"border-neutral-200"].join(' ')} open>
                        <summary className={["px-3 py-2 cursor-pointer select-none flex items-center justify-between", dark?"bg-neutral-900":"bg-white"].join(' ')}>
                          <span className="text-sm font-medium">{agentDisplayName(localAgents as any, rows[0]?.agentId, person)}</span>
                          <span className="text-xs opacity-70">{rows.length} item{rows.length===1?'':'s'}</span>
                        </summary>
                        <div className={"divide-y "+(dark?"divide-neutral-800":"divide-neutral-200")}>
                          {rows.map((r)=> (
                            <div key={r.id} className="px-3 py-2 flex items-center justify-between gap-2 text-sm">
                              <div className="flex items-center gap-3">
                                <span className="tabular-nums">{r.startDate} → {r.endDate}</span>
                                {r.notes && <span className={"opacity-70 max-w-[40ch] truncate"}>{r.notes}</span>}
                              </div>
                              <div className="shrink-0 inline-flex gap-1.5">
                                <button className={["px-2 py-1 rounded border text-xs", dark?"border-neutral-700":"border-neutral-300"].join(' ')} onClick={()=> startPtoEdit(r)}>Edit</button>
                                <button className={["px-2 py-1 rounded border text-xs", "bg-red-600 border-red-600 text-white"].join(' ')} onClick={()=>{ if(confirm('Delete PTO?')) setWorkingPto(prev=> prev.filter(x=> x.id!==r.id)) }}>Delete</button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </details>
                    )
                  })}
                </div>
              )
            })()}

            {ptoEditing && (
              <div className={["rounded-xl p-3 border", dark?"border-neutral-800 bg-neutral-900":"border-neutral-200 bg-white"].join(' ')}>
                <div className="text-sm font-medium mb-2">Edit PTO</div>
                <div className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
                  <label className="text-sm flex flex-col">
                    <span className="mb-1">Agent</span>
                    <select className={["w-full border rounded px-2 py-1", dark&&"bg-neutral-900 border-neutral-700"].filter(Boolean).join(' ')} value={pt_e_person} onChange={(e)=> setPtEPerson(e.target.value)}>
                      {allPeople.map(p=> <option key={p} value={p}>{p}</option>)}
                    </select>
                  </label>
                  <label className="text-sm flex flex-col">
                    <span className="mb-1">Start</span>
                    <input type="date" className={["w-full border rounded px-2 py-1", dark&&"bg-neutral-900 border-neutral-700"].filter(Boolean).join(' ')} value={pt_e_start} onChange={(e)=> setPtEStart(e.target.value)} />
                  </label>
                  <label className="text-sm flex flex-col">
                    <span className="mb-1">End</span>
                    <input type="date" className={["w-full border rounded px-2 py-1", dark&&"bg-neutral-900 border-neutral-700"].filter(Boolean).join(' ')} value={pt_e_end} onChange={(e)=> setPtEEnd(e.target.value)} />
                  </label>
                  <label className="text-sm flex flex-col md:col-span-2">
                    <span className="mb-1">Notes</span>
                    <input type="text" className={["w-full border rounded px-2 py-1", dark&&"bg-neutral-900 border-neutral-700"].filter(Boolean).join(' ')} value={pt_e_notes} onChange={(e)=> setPtENotes(e.target.value)} />
                  </label>
                  <div className="md:col-span-5 flex gap-2">
                    <button className={["px-3 py-1.5 rounded border text-sm", dark?"bg-neutral-800 border-neutral-700":"bg-blue-600 border-blue-600 text-white"].join(' ')} onClick={()=>{
                      if(!ptoEditing) return
                      if(!pt_e_person.trim()) return alert('Choose an agent')
                      if(!pt_e_start || !pt_e_end) return alert('Choose start/end')
                      if(pt_e_end < pt_e_start) return alert('End date must be on/after start date')
                      setWorkingPto(prev=> prev.map(x=> x.id===ptoEditing.id ? { ...x, person: pt_e_person.trim(), agentId: agentIdByName(localAgents as any, pt_e_person.trim()), startDate: pt_e_start, endDate: pt_e_end, notes: pt_e_notes || undefined } : x))
                      clearPtoEdit()
                      setIsDirty(true)
                    }}>Save</button>
                    <button className={["px-3 py-1.5 rounded border text-sm", dark?"border-neutral-700":"border-neutral-300"].join(' ')} onClick={clearPtoEdit}>Cancel</button>
                  </div>
                </div>
              </div>
            )}
            </div>
            <div className="space-y-3 flex-1 min-w-0">
          {/* Overrides (add + list) */}
          <div className={["rounded-xl p-3 border", dark?"bg-neutral-950 border-neutral-800 text-neutral-200":"bg-neutral-50 border-neutral-200 text-neutral-800"].join(' ')}>
            <div className="text-sm font-medium mb-2">Add Overrides</div>
            <div className="grid grid-cols-1 md:grid-cols-6 gap-2 items-end">
              <label className="flex flex-col gap-1">
                <span className="text-xs opacity-80">Agent</span>
                <select className={["w-full border rounded-xl px-3 py-2", dark&&"bg-neutral-900 border-neutral-700"].filter(Boolean).join(' ')} value={ov_agent} onChange={(e)=> setOvAgent(e.target.value)}>
                  <option value="">—</option>
                  {allPeople.map(p=> <option key={p} value={p}>{p}</option>)}
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs opacity-80">Start date</span>
                <input type="date" className={["w-full border rounded-xl px-3 py-2", dark&&"bg-neutral-900 border-neutral-700"].filter(Boolean).join(' ')} value={ov_start} onChange={(e)=> setOvStart(e.target.value)} />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs opacity-80">End date</span>
                <input type="date" className={["w-full border rounded-xl px-3 py-2", dark&&"bg-neutral-900 border-neutral-700"].filter(Boolean).join(' ')} value={ov_end} onChange={(e)=> setOvEnd(e.target.value)} />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs opacity-80">Start time (optional)</span>
                <input type="time" className={["w-full border rounded-xl px-3 py-2", dark&&"bg-neutral-900 border-neutral-700"].filter(Boolean).join(' ')} value={ov_tstart} onChange={(e)=>{
                  const val = e.target.value
                  const addMin = (t:string, m:number)=> minToHHMM(((toMin(t)+m)%1440+1440)%1440)
                  const prevDefault = ov_tstart ? addMin(ov_tstart, 510) : null // 8.5 hours
                  setOvTStart(val)
                  if(val){
                    const nextDefault = addMin(val, 510)
                    if(!ov_tend || (prevDefault && ov_tend===prevDefault)){
                      setOvTEnd(nextDefault)
                    }
                  }
                }} />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs opacity-80">End time (optional)</span>
                <input type="time" className={["w-full border rounded-xl px-3 py-2", dark&&"bg-neutral-900 border-neutral-700"].filter(Boolean).join(' ')} value={ov_tend} onChange={(e)=> setOvTEnd(e.target.value)} />
              </label>
              {/* Removed End day selector; end date already provided */}
              <label className="flex flex-col gap-1 md:col-span-2">
                <span className="text-xs opacity-80">Kind</span>
                <input type="text" placeholder="e.g., Swap, Half-day" className={["w-full border rounded-xl px-3 py-2", dark&&"bg-neutral-900 border-neutral-700"].filter(Boolean).join(' ')} value={ov_kind} onChange={(e)=> setOvKind(e.target.value)} />
              </label>
              <label className="flex flex-col gap-1 md:col-span-2">
                <span className="text-xs opacity-80">Notes</span>
                <input type="text" placeholder="Optional" className={["w-full border rounded-xl px-3 py-2", dark&&"bg-neutral-900 border-neutral-700"].filter(Boolean).join(' ')} value={ov_notes} onChange={(e)=> setOvNotes(e.target.value)} />
              </label>
              <div className="flex items-end gap-3 md:col-span-2">
                <label className="inline-flex items-center gap-2">
                  <Toggle ariaLabel="Weekly recurrence" dark={dark} size="md" checked={ov_recurring} onChange={(v)=> setOvRecurring(v)} />
                  <span className="text-sm">Weekly recurrence</span>
                </label>
                {ov_recurring && (
                  <label className="flex items-center gap-2 text-sm">
                    <span className="opacity-80">Until</span>
                    <input type="date" className={["border rounded-xl px-2 py-1", dark&&"bg-neutral-900 border-neutral-700"].filter(Boolean).join(' ')} value={ov_until} onChange={(e)=> setOvUntil(e.target.value)} />
                  </label>
                )}
                <button className={["ml-auto h-10 rounded-xl px-4 border font-medium", dark?"bg-blue-600 border-blue-600 text-white hover:opacity-95":"bg-blue-600 border-blue-600 text-white hover:opacity-95"].join(' ')} onClick={()=>{
                  if(!ov_agent) return alert('Choose an agent')
                  if(!ov_start || !ov_end) return alert('Choose start and end dates')
                  if(ov_end < ov_start) return alert('End date must be on/after start date')
                  if((ov_tstart && !ov_tend) || (!ov_tstart && ov_tend)) return alert('Provide both start and end times, or leave both blank')
                  const entry: Override = {
                    id: uid(), person: ov_agent, agentId: agentIdByName(localAgents as any, ov_agent), startDate: ov_start, endDate: ov_end,
                    start: ov_tstart || undefined, end: ov_tend || undefined,
                    kind: ov_kind || undefined, notes: ov_notes || undefined,
                    recurrence: ov_recurring ? { rule: 'weekly', until: ov_until || undefined } : undefined
                  }
                  setWorkingOverrides(prev=> prev.concat([entry])); setIsDirty(true)
                }}>Add Override</button>
              </div>
            </div>
            <div className="mt-3">
              <div className="text-sm font-medium mb-1">Overrides</div>
              {workingOverrides.filter(x=> !pt_filter || x.person===pt_filter).length===0 ? (
                <div className="text-sm opacity-70">No overrides.</div>
              ) : (
                <ul className="divide-y divide-neutral-700/30">
                  {workingOverrides
                    .filter(x=> !pt_filter || x.person===pt_filter)
                    .slice()
                    .sort((a,b)=> a.person.localeCompare(b.person) || a.startDate.localeCompare(b.startDate))
                    .map(o=> (
                      <li key={o.id} className="py-1.5 flex items-center justify-between gap-2">
                        <div className="text-sm">
                          <span className="font-medium">{o.person}</span>
                          <span className="opacity-70"> • {o.startDate} → {o.endDate}</span>
                          {o.start && o.end && (
                            <span className="opacity-70"> • {o.start}–{o.end}</span>
                          )}
                          {o.kind && <span className="ml-1 opacity-70">• {o.kind}</span>}
                          {o.recurrence?.rule==='weekly' && <span className="ml-1 text-xs opacity-80">(weekly{ o.recurrence.until?` until ${o.recurrence.until}`:'' })</span>}
                          {o.notes && <span className="ml-2 text-xs opacity-70">{o.notes}</span>}
                        </div>
                        <div className="shrink-0">
                          <button className={["px-2 py-1 rounded border text-xs", "bg-red-600 border-red-600 text-white"].join(' ')} onClick={()=>{
                            if(confirm('Delete override?')){ setWorkingOverrides(prev=> prev.filter(x=> x.id!==o.id)); setIsDirty(true) }
                          }}>Delete</button>
                        </div>
                      </li>
                    ))}
                </ul>
              )}
            </div>
          </div>
            </div>
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
