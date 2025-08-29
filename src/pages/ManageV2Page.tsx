import React from 'react'
// Legacy local password gate removed. Admin auth now uses dev proxy cookie+CSRF only.
import { cloudPost, cloudPostDetailed, ensureSiteSession, login, logout, getApiBase, getApiPrefix, isUsingDevProxy, hasCsrfCookie } from '../lib/api'
import WeekEditor from '../components/v2/WeekEditor'
import AllAgentsWeekRibbons from '../components/AllAgentsWeekRibbons'
import type { PTO, Shift, Task } from '../types'
import type { CalendarSegment } from '../lib/utils'
import TaskConfigPanel from '../components/TaskConfigPanel'
import { DAYS } from '../constants'
import { uid, toMin, shiftsForDayInTZ, agentIdByName, agentDisplayName, parseYMD, addDays, fmtYMD } from '../lib/utils'

type AgentRow = { firstName: string; lastName: string; tzId?: string; hidden?: boolean }

export default function ManageV2Page({ dark, agents, onAddAgent, onUpdateAgent, onDeleteAgent, weekStart, tz, shifts, pto, tasks, calendarSegs, onUpdateShift, onDeleteShift, onAddShift, setTasks, setCalendarSegs, setPto }:{ dark:boolean; agents: AgentRow[]; onAddAgent?: (a:{ firstName:string; lastName:string; tzId:string })=>void; onUpdateAgent?: (index:number, a:AgentRow)=>void; onDeleteAgent?: (index:number)=>void; weekStart: string; tz:{ id:string; label:string; offset:number }; shifts: Shift[]; pto: PTO[]; tasks: Task[]; calendarSegs: CalendarSegment[]; onUpdateShift?: (id:string, patch: Partial<Shift>)=>void; onDeleteShift?: (id:string)=>void; onAddShift?: (s: Shift)=>void; setTasks: (f:(prev:Task[])=>Task[])=>void; setCalendarSegs: (f:(prev:CalendarSegment[])=>CalendarSegment[])=>void; setPto: (f:(prev:PTO[])=>PTO[])=>void }){
  // Admin auth gate: unlocked if CSRF cookie exists (dev proxy or prod API)
  const [unlocked, setUnlocked] = React.useState(false)
  const [pwInput, setPwInput] = React.useState('')
  const [msg, setMsg] = React.useState('')
  React.useEffect(()=>{
    if(hasCsrfCookie()){ setUnlocked(true); setMsg('') }
  },[])
  const apiBase = React.useMemo(()=> getApiBase(), [])
  const apiPrefix = React.useMemo(()=> getApiPrefix(), [])
  const usingDevProxy = React.useMemo(()=> isUsingDevProxy(), [])
  const [localAgents, setLocalAgents] = React.useState<AgentRow[]>(agents)
  React.useEffect(()=>{ setLocalAgents(agents) }, [agents])
  const tabs = ['Agents','Shifts','Postures','PTO'] as const
  type Subtab = typeof tabs[number]
  const [subtab, setSubtab] = React.useState<Subtab>('Agents')
  // Shifts tab: show time labels for all shifts
  const [showAllTimeLabels, setShowAllTimeLabels] = React.useState(false)
  const [sortMode, setSortMode] = React.useState<'start'|'name'>('start')
  // Shifts tab: option to include hidden agents (default off)
  const [includeHiddenAgents, setIncludeHiddenAgents] = React.useState(false)
  // Shifts tab: working copy (draft) of shifts
  const [workingShifts, setWorkingShifts] = React.useState<Shift[]>(shifts)
  // PTO tab: working copy (draft) of PTO entries
  const [workingPto, setWorkingPto] = React.useState<PTO[]>(pto)
  const [isDirty, setIsDirty] = React.useState(false)
  // Import panel state
  const [showImport, setShowImport] = React.useState(false)
  const [importUrl, setImportUrl] = React.useState<string>('https://team-schedule-api.bsteward.workers.dev/v1/schedule')
  const [importText, setImportText] = React.useState<string>('')
  const [importMsg, setImportMsg] = React.useState<string>('')
  // Track whether current draft session started from live (so full undo returns to Live)
  const startedFromLiveRef = React.useRef(false)
  const DRAFT_KEY = React.useMemo(()=> `schedule2.v2.draft.${weekStart}.${tz.id}`,[weekStart,tz.id])
  const DRAFT_LIST_KEY = React.useMemo(()=> `schedule2.v2.drafts`,[])
  // Which saved draft (if any) this working session is tied to
  const [currentDraftId, setCurrentDraftId] = React.useState<string | null>(null)
  // Keep working copy synced to live only when not dirty
  React.useEffect(()=>{ if(!isDirty) setWorkingShifts(shifts) },[shifts,isDirty])
  React.useEffect(()=>{ if(!isDirty) setWorkingPto(pto) },[pto,isDirty])
  // Load existing draft if present for this week/tz
  React.useEffect(()=>{
    try{
      const raw = localStorage.getItem(DRAFT_KEY)
      if(raw){
        const parsed = JSON.parse(raw)
  if(Array.isArray(parsed?.shifts)){
          setWorkingShifts(parsed.shifts as Shift[])
          setIsDirty(true)
          if(parsed?.draftId && typeof parsed.draftId === 'string') setCurrentDraftId(parsed.draftId)
          startedFromLiveRef.current = false
        }
      }
    }catch{}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[DRAFT_KEY])
  // Autosave working when dirty
  React.useEffect(()=>{
    if(!isDirty) return
    const t = setTimeout(()=>{
    try{ localStorage.setItem(DRAFT_KEY, JSON.stringify({ shifts: workingShifts, weekStart, tzId: tz.id, draftId: currentDraftId, updatedAt: new Date().toISOString() })) }catch{}
    },300)
    return ()=> clearTimeout(t)
  },[isDirty,workingShifts,DRAFT_KEY,weekStart,tz.id,currentDraftId])
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
    // If we've undone the very first change from live, revert to live and clear draft
    const remaining = shiftUndoStack.length - 1
    if(remaining===0 && startedFromLiveRef.current){
      setWorkingShifts(shifts)
      setIsDirty(false)
      startedFromLiveRef.current = false
      try{ localStorage.removeItem(DRAFT_KEY) }catch{}
  setCurrentDraftId(null)
    }
  }, [shiftUndoStack, workingShifts, shifts, DRAFT_KEY])
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
  // When switching into Shifts tab, if there are no local edits pending, refresh from live
  React.useEffect(()=>{
    if(subtab!== 'Shifts') return
    const noLocalEdits = shiftUndoStack.length===0 && shiftRedoStack.length===0 && modifiedIds.size===0
    if(noLocalEdits){ setWorkingShifts(shifts) }
  }, [subtab, shifts, shiftUndoStack, shiftRedoStack, modifiedIds])
  // Ctrl/Cmd+Z for Shifts tab
  React.useEffect(()=>{
    const onKey = (e: KeyboardEvent)=>{
      if(subtab!=='Shifts') return
      const isUndo = (e.ctrlKey || e.metaKey) && !e.shiftKey && (e.key==='z' || e.key==='Z')
    const isRedo = ((e.ctrlKey || e.metaKey) && (e.shiftKey && (e.key==='z' || e.key==='Z'))) || ((e.ctrlKey || e.metaKey) && (e.key==='y' || e.key==='Y'))
    if(isUndo){ e.preventDefault(); undoShifts() }
    else if(isRedo){ e.preventDefault(); redoShifts() }
    const isSave = (e.ctrlKey || e.metaKey) && !e.shiftKey && (e.key==='s' || e.key==='S')
    const isSaveNew = (e.ctrlKey || e.metaKey) && e.shiftKey && (e.key==='s' || e.key==='S')
  if(isSave){ e.preventDefault(); currentDraftId ? saveDraft() : saveNewDraft() }
    else if(isSaveNew){ e.preventDefault(); saveNewDraft() }
      if(e.key === 'Escape'){
        // Clear selection to allow single-shift moves without grouping
        setSelectedShiftIds(new Set())
      }
    }
    window.addEventListener('keydown', onKey)
    return ()=> window.removeEventListener('keydown', onKey)
  }, [subtab, undoShifts, redoShifts, currentDraftId])

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
  const [assignEnd, setAssignEnd] = React.useState('10:00')
  const [assignTaskId, setAssignTaskId] = React.useState<string>('')
  React.useEffect(()=>{ if(!assignTaskId && activeTasks[0]) setAssignTaskId(activeTasks[0].id) },[activeTasks, assignTaskId])
  // Inline edit state for assigned calendar segments
  const [editingIdx, setEditingIdx] = React.useState<number|null>(null)
  const [eaPerson, setEaPerson] = React.useState('')
  const [eaDay, setEaDay] = React.useState<typeof DAYS[number]>('Mon' as any)
  const [eaStart, setEaStart] = React.useState('09:00')
  const [eaEnd, setEaEnd] = React.useState('10:00')
  const [eaTaskId, setEaTaskId] = React.useState('')
  // const [filterTaskId, setFilterTaskId] = React.useState('') // not used currently
  // Calendar filter (posture) — empty means show all
  const [calendarFilterTaskId, setCalendarFilterTaskId] = React.useState('')

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

  // Draft versions (saved snapshots)
  type DraftSnapshot = { id:string; name:string; createdAt:string; weekStart:string; tzId:string; shifts: Shift[] }
  const [savedDrafts, setSavedDrafts] = React.useState<DraftSnapshot[]>(()=>{
    try{
      const raw = localStorage.getItem(DRAFT_LIST_KEY)
      if(!raw) return []
      const arr = JSON.parse(raw)
      if(Array.isArray(arr)) return arr
    }catch{}
    return []
  })
  function persistSavedDrafts(next: DraftSnapshot[]){
    setSavedDrafts(next)
    try{ localStorage.setItem(DRAFT_LIST_KEY, JSON.stringify(next)) }catch{}
  }
  function saveDraft(){
    // Overwrite current draft if linked, else create a new one
    let idToUse: string | null = currentDraftId
    if(currentDraftId){
      const idx = savedDrafts.findIndex(d=> d.id===currentDraftId)
      if(idx>=0){
        const next = savedDrafts.slice()
        next[idx] = { ...next[idx], shifts: workingShifts }
        const id = crypto.randomUUID()
      } else {
        const name = prompt('Name this draft', new Date().toLocaleString()) || new Date().toLocaleString()
        const id = Math.random().toString(36).slice(2)
        const snap: DraftSnapshot = { id, name, createdAt: new Date().toISOString(), weekStart, tzId: tz.id, shifts: workingShifts }
        persistSavedDrafts(savedDrafts.concat([snap]))
        setCurrentDraftId(id)
        setSelectedDraftId(id)
        idToUse = id
      }
    } else {
      const name = prompt('Name this draft', new Date().toLocaleString()) || new Date().toLocaleString()
      const id = Math.random().toString(36).slice(2)
      const snap: DraftSnapshot = { id, name, createdAt: new Date().toISOString(), weekStart, tzId: tz.id, shifts: workingShifts }
      persistSavedDrafts(savedDrafts.concat([snap]))
      setCurrentDraftId(id)
      setSelectedDraftId(id)
      idToUse = id
    }
    try{ localStorage.setItem(DRAFT_KEY, JSON.stringify({ shifts: workingShifts, weekStart, tzId: tz.id, draftId: idToUse || currentDraftId || undefined, updatedAt: new Date().toISOString() })) }catch{}
  }
  function saveNewDraft(){
    const name = prompt('Name this draft', new Date().toLocaleString()) || new Date().toLocaleString()
    const id = Math.random().toString(36).slice(2)
    const snap: DraftSnapshot = { id, name, createdAt: new Date().toISOString(), weekStart, tzId: tz.id, shifts: workingShifts }
    persistSavedDrafts(savedDrafts.concat([snap]))
    setCurrentDraftId(id)
    setSelectedDraftId(id)
    try{ localStorage.setItem(DRAFT_KEY, JSON.stringify({ shifts: workingShifts, weekStart, tzId: tz.id, draftId: id, updatedAt: new Date().toISOString() })) }catch{}
  }
  const [selectedDraftId, setSelectedDraftId] = React.useState('')
  function loadSelectedDraft(){
    const d = savedDrafts.find(x=> x.id===selectedDraftId)
    if(!d) return
    setWorkingShifts(d.shifts)
    setIsDirty(true)
    setCurrentDraftId(d.id)
    setShiftUndoStack([]); setShiftRedoStack([]); setModifiedIds(new Set())
    startedFromLiveRef.current = false
    try{ localStorage.setItem(DRAFT_KEY, JSON.stringify({ shifts: d.shifts, weekStart: d.weekStart, tzId: d.tzId, draftId: d.id, updatedAt: new Date().toISOString() })) }catch{}
  }
  // Persist agent selection across tab switches
  const [selectedAgentIdx, setSelectedAgentIdx] = React.useState<number|null>(null)
  // If the selected index goes out-of-range after agent edits, fix it up
  React.useEffect(()=>{
    if(selectedAgentIdx==null) return
    if(selectedAgentIdx < 0 || selectedAgentIdx >= localAgents.length){
      setSelectedAgentIdx(localAgents.length>0 ? 0 : null)
    }
  }, [selectedAgentIdx, localAgents])
  function deleteSelectedDraft(){
    if(!selectedDraftId) return
    const next = savedDrafts.filter(x=> x.id!==selectedDraftId)
    persistSavedDrafts(next)
    setSelectedDraftId('')
    if(currentDraftId === selectedDraftId) setCurrentDraftId(null)
  }
  function discardWorkingDraft(){
    setWorkingShifts(shifts)
    setIsDirty(false)
    setShiftUndoStack([]); setShiftRedoStack([]); setModifiedIds(new Set())
    try{ localStorage.removeItem(DRAFT_KEY) }catch{}
    startedFromLiveRef.current = false
    setCurrentDraftId(null)
  }
  async function publishWorkingToLive(){
    const res = await cloudPostDetailed({ shifts: workingShifts, pto: workingPto, calendarSegs, updatedAt: new Date().toISOString() })
    if(res.ok){
      setIsDirty(false)
      try{ localStorage.removeItem(DRAFT_KEY) }catch{}
      alert('Published to live.')
      startedFromLiveRef.current = false
      setCurrentDraftId(null)
  // Clear modified markers so shift ribbons no longer show edited tags
  setModifiedIds(new Set())
      // Update parent state to reflect published PTO immediately
      setPto(()=> workingPto)
    }else{
      if(res.status===404 || res.error==='missing_site_session' || (res.bodyText||'').includes('missing_site_session')){
        await ensureSiteSession()
        alert('Publish failed: missing or expired site session. Please sign in to view and then try again.')
      }else if(res.status===401){
        alert('Publish failed: not signed in as admin (401).')
      }else if(res.status===403){
        alert('Publish failed: CSRF mismatch (403). Try reloading and signing in again.')
      }else if(res.status===409){
        alert('Publish failed: conflict (409). Refresh to load latest, then retry.')
      }else{
        alert(`Failed to publish. ${res.status?`HTTP ${res.status}`:''} ${res.error?`— ${res.error}`:''}`)
      }
    }
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
            const res = await login(pwInput)
            if(res.ok){
              try{ await ensureSiteSession(pwInput) }catch{}
              if(hasCsrfCookie()){
                setUnlocked(true); setMsg(''); try{ localStorage.setItem('schedule_admin_unlocked','1') }catch{}
              } else {
                setUnlocked(false); setMsg('Signed in, but CSRF cookie is missing. Check cookie Domain/Path and SameSite; reload and try again.')
              }
            } else { setMsg(res.status===401?'Incorrect password':'Login failed') }
          })() }}>
            <div className="flex gap-2">
              <input type="password" autoFocus className={["flex-1 border rounded-xl px-3 py-2", dark && "bg-neutral-900 border-neutral-700"].filter(Boolean).join(' ')} value={pwInput} onChange={(e)=>setPwInput(e.target.value)} placeholder="Password" />
              <button type="submit" className={["rounded-xl px-4 py-2 font-medium border", dark ? "bg-neutral-800 border-neutral-700" : "bg-blue-600 text-white border-blue-600"].join(' ')}>Sign in</button>
            </div>
          </form>
          {msg && (<div className={["text-sm", dark ? "text-red-300" : "text-red-600"].join(' ')}>{msg}</div>)}
          <div className="text-xs opacity-70">Your API should set a session cookie and CSRF token on success.</div>
          <div className="text-xs opacity-60 mt-2">
            <div>API base: <code>{apiBase}</code></div>
            <div>API path: <code>{apiPrefix}</code></div>
            <div>Dev proxy: {usingDevProxy? 'on (local only)':'off'}</div>
            <div>CSRF cookie detected: {hasCsrfCookie()? 'yes' : 'no'}</div>
          </div>
        </div>
      </section>
    )
  }

  return (
    <section className={["rounded-2xl p-3 space-y-3", dark?"bg-neutral-900":"bg-white shadow-sm"].join(' ')}>
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

  {subtab==='Shifts' && (
        <div className={["flex flex-wrap items-center justify-between gap-2 sm:gap-3 text-xs rounded-xl px-2 py-2 border", dark?"bg-neutral-950 border-neutral-800 text-neutral-200":"bg-neutral-50 border-neutral-200 text-neutral-800"].join(' ')}>
          {/* Left: draft status + metadata */}
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            <span className={["inline-flex items-center px-2 py-1 rounded-xl border font-medium", isDirty ? (dark?"bg-neutral-900 border-amber-600 text-amber-400":"bg-white border-amber-500 text-amber-700") : (dark?"bg-neutral-900 border-neutral-800 text-neutral-400":"bg-white border-neutral-200 text-neutral-500")].join(' ')}>
              {isDirty ? 'Draft — not live' : 'Live'}
            </span>
            {(()=>{ const cur = savedDrafts.find(d=> d.id===currentDraftId); const text = cur ? (`Editing draft: ${cur.name} — created ${new Date(cur.createdAt).toLocaleString()}`) : 'No draft linked'; return (
              <span className="text-[11px] opacity-70 truncate whitespace-nowrap overflow-hidden text-ellipsis max-w-[42ch] sm:max-w-[64ch]" title={text}>
                {text}
              </span>
            )})()}
          </div>

          {/* Right: all controls */}
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            {/* View: Sort + time labels */}
            <label className="inline-flex items-center gap-1 select-none" title="Sort ribbons by earliest shift start or by name">
              <span className={dark?"text-neutral-300":"text-neutral-700"}>Sort</span>
              <select
                className={["border rounded-xl px-2 py-1 w-[9.5rem] sm:w-[11rem]", dark?"bg-neutral-900 border-neutral-700 text-neutral-100":"bg-white border-neutral-300 text-neutral-800"].join(' ')}
                value={sortMode}
                onChange={(e)=> setSortMode((e.target.value as 'start'|'name'))}
              >
                <option value="start">Start time</option>
                <option value="name">Name</option>
              </select>
            </label>
            <label className="inline-flex items-center gap-1.5 cursor-pointer select-none" title="Include agents hidden from the schedule on this Shifts view">
              <input
                type="checkbox"
                className="accent-blue-600 w-4 h-4"
                checked={includeHiddenAgents}
                onChange={(e)=> setIncludeHiddenAgents(e.target.checked)}
              />
              <span className={dark?"text-neutral-300":"text-neutral-700"}>Show hidden</span>
            </label>
            <label className="inline-flex items-center gap-1.5 cursor-pointer select-none" title="Show start/end labels for all shifts">
              <input
                type="checkbox"
                className="accent-blue-600 w-4 h-4"
                checked={showAllTimeLabels}
                onChange={(e)=> setShowAllTimeLabels(e.target.checked)}
              />
              <svg aria-hidden className={dark?"text-neutral-300":"text-neutral-700"} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
              <span className="sr-only">Toggle time labels</span>
            </label>

            {/* Edit: Undo/Redo */}
            <div className="inline-flex items-center gap-1">
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
                <span className="inline-flex items-center gap-1.5">
                  <svg aria-hidden className={dark?"text-neutral-300":"text-neutral-700"} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 14 4 9 9 4"></polyline><path d="M20 20a8 8 0 0 0-7-12H4"></path></svg>
                  <span className="hidden sm:inline">Undo</span>
                </span>
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
                <span className="inline-flex items-center gap-1.5">
                  <svg aria-hidden className={dark?"text-neutral-300":"text-neutral-700"} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 14 20 9 15 4"></polyline><path d="M4 20a8 8 0 0 1 7-12h9"></path></svg>
                  <span className="hidden sm:inline">Redo</span>
                </span>
              </button>
            </div>

            {/* Draft: Save / Save new */}
            <div className="inline-flex items-center gap-1">
              <button
                onClick={saveDraft}
                disabled={!currentDraftId}
                className={["px-2.5 py-1.5 rounded-xl border font-medium", currentDraftId ? (dark?"bg-neutral-900 border-neutral-700 hover:bg-neutral-800":"bg-white border-neutral-300 hover:bg-neutral-100") : (dark?"bg-neutral-900 border-neutral-800 opacity-50":"bg-white border-neutral-200 opacity-50")].join(' ')}
                title="Save current draft (Ctrl/Cmd+S)"
              >
                <span className="inline-flex items-center gap-1.5">
                  <svg aria-hidden className={dark?"text-neutral-300":"text-neutral-700"} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path><polyline points="17 21 17 13 7 13 7 21"></polyline><polyline points="7 3 7 8 15 8"></polyline></svg>
                  <span className="hidden sm:inline">Save</span>
                </span>
              </button>
              <button
                onClick={saveNewDraft}
                className={["px-2.5 py-1.5 rounded-xl border font-medium", dark?"bg-neutral-900 border-neutral-700 hover:bg-neutral-800":"bg-white border-neutral-300 hover:bg-neutral-100"].join(' ')}
                title="Save new draft (Ctrl/Cmd+Shift+S)"
              >
                <span className="inline-flex items-center gap-1.5">
                  <svg aria-hidden className={dark?"text-neutral-300":"text-neutral-700"} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14"></path><path d="M5 12h14"></path></svg>
                  <span className="hidden sm:inline">Save new</span>
                </span>
              </button>
            </div>

            {/* Drafts: picker + load/delete */}
            <div className="inline-flex items-center gap-1 min-w-0">
              <select className={["border rounded-xl px-2 py-1 max-w-[28ch] sm:max-w-[36ch] truncate", dark?"bg-neutral-900 border-neutral-700 text-neutral-100":"bg-white border-neutral-300 text-neutral-800"].join(' ')} value={selectedDraftId} onChange={(e)=> setSelectedDraftId(e.target.value)} title="Select a saved draft">
                <option value="">Drafts…</option>
                {savedDrafts.slice().reverse().map(d=> (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
              <button disabled={!selectedDraftId} onClick={loadSelectedDraft} className={["px-2.5 py-1.5 rounded-xl border shrink-0", selectedDraftId ? (dark?"bg-neutral-900 border-neutral-700 hover:bg-neutral-800":"bg-white border-neutral-300 hover:bg-neutral-100") : (dark?"bg-neutral-900 border-neutral-800 opacity-50":"bg-white border-neutral-200 opacity-50")].join(' ')} title="Load selected draft">
                <span className="inline-flex items-center gap-1.5">
                  <svg aria-hidden className={dark?"text-neutral-300":"text-neutral-700"} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                  <span className="hidden sm:inline">Load</span>
                </span>
              </button>
              <button disabled={!selectedDraftId} onClick={()=>{ if(confirm('Delete selected draft?')) deleteSelectedDraft() }} className={["px-2.5 py-1.5 rounded-xl border shrink-0", selectedDraftId ? (dark?"bg-neutral-900 border-neutral-700 hover:bg-neutral-800":"bg-white border-neutral-300 hover:bg-neutral-100") : (dark?"bg-neutral-900 border-neutral-800 opacity-50":"bg-white border-neutral-200 opacity-50")].join(' ')} title="Delete selected draft">
                <span className="inline-flex items-center gap-1.5">
                  <svg aria-hidden className={dark?"text-neutral-300":"text-neutral-700"} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                  <span className="hidden sm:inline">Delete</span>
                </span>
              </button>
            </div>

            {/* Import legacy */}
            <button
              type="button"
              onClick={()=>{ setShowImport(v=>!v); setImportMsg('') }}
              className={["px-2.5 py-1.5 rounded-xl border font-medium shrink-0", dark?"bg-neutral-900 border-neutral-700 hover:bg-neutral-800":"bg-white border-neutral-300 hover:bg-neutral-100"].join(' ')}
              title="Import shifts/PTO/postures from a legacy JSON URL or paste"
            >
              <span className="inline-flex items-center gap-1.5">
                <svg aria-hidden className={dark?"text-neutral-300":"text-neutral-700"} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14"></path><path d="M5 12h14"></path><polyline points="8 17 12 21 16 17"></polyline></svg>
                <span className="hidden sm:inline">Import</span>
              </span>
            </button>

            {/* Publish area: discard then publish at far right */}
            <button
              disabled={!isDirty}
              onClick={discardWorkingDraft}
              className={["px-2.5 py-1.5 rounded-xl border font-medium shrink-0", isDirty ? (dark?"bg-neutral-900 border-neutral-700 hover:bg-neutral-800":"bg-white border-neutral-300 hover:bg-neutral-100") : (dark?"bg-neutral-900 border-neutral-800 opacity-50":"bg-white border-neutral-200 opacity-50")].join(' ')}
              title="Discard working changes"
            >
              <span className="inline-flex items-center gap-1.5">
                <svg aria-hidden className={dark?"text-neutral-300":"text-neutral-700"} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2 2L5 6"></path><path d="M10 11v6"></path><path d="M14 11v6"></path></svg>
                <span className="hidden sm:inline">Discard</span>
              </span>
            </button>
            <button
              onClick={publishWorkingToLive}
              className="px-3 py-1.5 rounded-xl border font-semibold bg-blue-600 border-blue-600 text-white hover:bg-blue-500 shrink-0"
              title="Publish working changes to live"
            >
              <span className="inline-flex items-center gap-1.5">
                <svg aria-hidden width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14"></path><path d="M5 12h14"></path><path d="M16 5h2a2 2 0 0 1 2 2v2"></path></svg>
                <span className="hidden sm:inline">Publish</span>
              </span>
            </button>
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
                    // Merge calendar segments into parent list via setter
                    if(Array.isArray(j.calendarSegs)){
                      setCalendarSegs(prev=> j.calendarSegs as any)
                    }
                    setIsDirty(true)
                    setImportMsg(`Imported ${importedShifts.length} shifts${Array.isArray(j.pto)?`, ${j.pto.length} PTO`:''}${Array.isArray(j.calendarSegs)?`, ${j.calendarSegs.length} postures`:''}. Review then Publish.`)
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
                        setIsDirty(true)
                        setImportMsg(`Imported ${importedShifts.length} shifts${Array.isArray(j.pto)?`, ${j.pto.length} PTO`:''}${Array.isArray(j.calendarSegs)?`, ${j.calendarSegs.length} postures`:''}. Review then Publish.`)
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
            shifts={workingShifts}
            pto={pto}
            tasks={tasks}
            calendarSegs={calendarSegs}
            showAllTimeLabels={showAllTimeLabels}
            sortMode={sortMode}
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
                    <div className="grid grid-cols-3 gap-3">
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
                    </div>
                    <button
                      onClick={()=>{
                        if(!assignee) return alert('Choose an agent')
                        if(!assignTaskId) return alert('Choose a posture')
                        const aS = toMin(assignStart), aE = toMin(assignEnd)
                        if(!(aE>aS)) return alert('End must be after start')
                        const dayShiftsLocal = shiftsForDayInTZ(shifts, assignDay as any, tz.offset).filter(s=>s.person===assignee)
                        const overlaps = dayShiftsLocal.some(s=>{ const sS=toMin(s.start); const sE = s.end==='24:00'?1440:toMin(s.end); return aS < sE && aE > sS })
                        if(!overlaps){ alert('No shift overlaps that time for this agent on that day. This posture will be saved but won\'t display until there is an overlapping shift.'); }
                        setCalendarSegs(prev=> prev.concat([{ person: assignee, agentId: agentIdByName(localAgents as any, assignee), day: assignDay, start: assignStart, end: assignEnd, taskId: assignTaskId }]))
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
                      <div key={t.id} className={["rounded-xl border", dark?"border-neutral-800":"border-neutral-200"].join(' ')}>
                        <div className={["px-3 py-2 flex items-center justify-between", dark?"bg-neutral-900":"bg-white"].join(' ')}>
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
                                        <span className="w-[6ch] opacity-70">{r.day}</span>
                                        <span className="w-[11ch] tabular-nums">{r.start}–{r.end}</span>
                                      </div>
                                      <div className="shrink-0 flex gap-1.5">
                                        <button onClick={()=>{ setEditingIdx(r._idx); setEaPerson(r.person); setEaDay(r.day as any); setEaStart(r.start); setEaEnd(r.end); setEaTaskId(r.taskId) }} className={["px-2 py-1 rounded border text-xs", dark?"border-neutral-700":"border-neutral-300"].join(' ')}>Edit</button>
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
                    <div className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
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
                        <span className="mb-1">Posture</span>
                        <select className={["w-full border rounded px-2 py-1", dark&&"bg-neutral-900 border-neutral-700"].filter(Boolean).join(' ')} value={eaTaskId} onChange={e=>setEaTaskId(e.target.value)}>
                          {tasks.filter(t=>!t.archived).map(t=> <option key={t.id} value={t.id}>{t.name}</option>)}
                        </select>
                      </label>
                      <div className="md:col-span-5 flex gap-2">
                        <button onClick={()=>{
                          if(editingIdx==null) return
                          if(!eaPerson.trim()) return alert('Choose an agent')
                          if(!eaTaskId) return alert('Choose a posture')
                          const aS=toMin(eaStart), aE=toMin(eaEnd)
                          if(!(aE>aS)) return alert('End must be after start')
                          const dayShiftsLocal = shiftsForDayInTZ(shifts, eaDay as any, tz.offset).filter(s=>s.person===eaPerson)
                          const overlaps = dayShiftsLocal.some(s=>{ const sS=toMin(s.start); const sE=s.end==='24:00'?1440:toMin(s.end); return aS < sE && aE > sS })
                          if(!overlaps){ alert('No shift overlaps that time for this agent on that day. This posture will be saved but won\'t display until there is an overlapping shift.') }
                          setCalendarSegs(prev=> prev.map((cs,i)=> i===editingIdx ? { person: eaPerson.trim(), agentId: agentIdByName(localAgents as any, eaPerson.trim()), day: eaDay, start: eaStart, end: eaEnd, taskId: eaTaskId } : cs))
                          setEditingIdx(null)
                        }} className={["px-3 py-1.5 rounded border text-sm", dark?"bg-neutral-800 border-neutral-700":"bg-blue-600 border-blue-600 text-white"].join(' ')}>Save</button>
                        <button onClick={()=>setEditingIdx(null)} className={["px-3 py-1.5 rounded border text-sm", dark?"border-neutral-700":"border-neutral-300"].join(' ')}>Cancel</button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Bottom calendar view: weekly calendar grid with posture filter */}
      <div className={["mt-3 rounded-xl p-3", dark?"bg-neutral-900":"bg-white"].join(' ')}>
              <div className="flex items-center justify-between mb-2">
                <div className="text-sm font-medium">Weekly posture calendar</div>
                <label className="text-xs inline-flex items-center gap-2">
                  <span className={dark?"text-neutral-300":"text-neutral-700"}>Filter</span>
                  <select
                    className={["border rounded-lg px-2 py-1 text-sm", dark?"bg-neutral-900 border-neutral-700 text-neutral-100":"bg-white border-neutral-300 text-neutral-800"].join(' ')}
                    value={calendarFilterTaskId}
                    onChange={(e)=> setCalendarFilterTaskId(e.target.value)}
                  >
                    <option value="">All postures</option>
                    {tasks.filter(t=>!t.archived).map(t=> (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                </label>
              </div>
              {(()=>{
                const H_PX = 420 // column height
                const hrColor = dark? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'
                const hourMarks = Array.from({length:25},(_,i)=>i)
                const taskMap = new Map(tasks.map(t=>[t.id,t]))
                return (
                  <div className="grid grid-cols-1 md:grid-cols-7 gap-3 text-sm">
                    {DAYS.map(day=>{
                      // Build lanes so overlapping items render side-by-side
                      const dayItems = calendarSegs
                        .map((cs, _idx)=> ({...cs, _idx}))
                        .filter(cs=> cs.day===day && (!calendarFilterTaskId || cs.taskId===calendarFilterTaskId))
                        .sort((a,b)=> toMin(a.start) - toMin(b.start))
                      const lanes: number[] = [] // end minute per lane
                      const placed = dayItems.map((it)=>{
                        const s = toMin(it.start)
                        const e = it.end==='24:00' ? 1440 : toMin(it.end)
                        let lane = 0
                        for(lane=0; lane<lanes.length; lane++){
                          if(s >= lanes[lane]){ lanes[lane] = e; break }
                        }
                        if(lane===lanes.length){ lanes.push(e) }
                        return { it, lane, s, e }
                      })
                      const laneCount = Math.max(1, lanes.length)
                      const laneWidthPct = 100 / laneCount
                      return (
                        <div key={day} className={["rounded-lg p-2 relative overflow-hidden", dark?"bg-neutral-950":"bg-neutral-50"].join(' ')} style={{ height: H_PX }}>
                          <div className="font-medium mb-1">{day}</div>
                          {/* Hour grid */}
                          <div className="absolute left-2 right-2 bottom-2 top-7">
                            {hourMarks.map((h)=>{
                              const top = (h/24)*100
                              return <div key={h} className="absolute left-0 right-0" style={{ top: `${top}%`, height: h===0?1:1 }}>
                                <div style={{ borderTop: `1px solid ${hrColor}` }} />
                              </div>
                            })}
                            {/* Items */}
                            {placed.map(({it, lane, s, e})=>{
                              const top = (s/1440)*100
                              const height = Math.max(1.5, ((e-s)/1440)*100)
                              const left = `calc(${lane * laneWidthPct}% + 0px)`
                              const width = `calc(${laneWidthPct}% - 4px)`
                              const t = taskMap.get(it.taskId)
                              const color = t?.color || '#888'
                              const dispName = agentDisplayName(localAgents as any, it.agentId, it.person)
                              return (
                                <div key={`${it._idx}-${it.person}-${it.start}-${it.end}`} className={["absolute rounded-md px-2 py-1 overflow-hidden", dark?"bg-neutral-800 text-neutral-100 border border-neutral-700":"bg-white text-neutral-900 border border-neutral-300 shadow-sm"].join(' ')} style={{ top:`${top}%`, height:`${height}%`, left, width }} title={`${dispName} — ${it.start}–${it.end} • ${(t?.name)||it.taskId}`}>
                                  <div className="flex items-center gap-1.5 text-[11px] leading-tight">
                                    <span className="inline-block w-2 h-2 rounded-full" style={{ background: color }} />
                                    <span className="truncate">{t?.name || it.taskId}</span>
                                  </div>
                                  <div className="text-[11px] opacity-70 leading-tight truncate">{it.start}–{it.end} <span className="opacity-60">({dispName})</span></div>
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
        ) : (
          <>
          <div className={["rounded-xl p-3 border", dark?"bg-neutral-950 border-neutral-800 text-neutral-200":"bg-neutral-50 border-neutral-200 text-neutral-800"].join(' ')}>
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
              <div className={["mt-3 rounded-xl p-3 border", dark?"border-neutral-800 bg-neutral-900":"border-neutral-200 bg-white"].join(' ')}>
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
          {/* Weekly PTO calendar */}
          <div className={["mt-3 rounded-xl p-3", dark?"bg-neutral-900":"bg-white"].join(' ')}>
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
                        <div className="font-medium mb-1">{day}</div>
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
          </>
        )
      )}
    </section>
  )
}
