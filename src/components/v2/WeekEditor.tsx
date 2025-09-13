import React from 'react'
import DeleteAllShiftsModals from './DeleteAllShiftsModals'
import AgentDetailsPanel from './AgentDetailsPanel'
import { TZ_OPTS, DAYS } from '../../constants'
import { convertShiftsToTZ, tzAbbrev } from '../../lib/utils'
import AgentWeekGrid from '../AgentWeekGrid'
import AgentWeekColumns from '../AgentWeekColumns'
import AgentWeekLinear from '../AgentWeekLinear'
import type { PTO, Shift, Task } from '../../types'
import type { CalendarSegment } from '../../lib/utils'

type AgentRow = { firstName: string; lastName: string; tzId?: string; hidden?: boolean; isSupervisor?: boolean; supervisorId?: string|null; notes?: string }

function tzFullName(id?: string){
	switch(id){
		case 'America/Los_Angeles': return 'Pacific'
		case 'America/Denver': return 'Mountain'
		case 'America/Chicago': return 'Central'
		case 'America/New_York': return 'Eastern'
		default: return id || '—'
	}
}

export default function WeekEditor({ dark, agents, onAddAgent, onUpdateAgent, onDeleteAgent, weekStart, tz, shifts, pto, tasks, calendarSegs, onUpdateShift, onDeleteShift, onAddShift, selectedIdx: selectedIdxProp, onSelectIdx }:{ dark:boolean; agents: AgentRow[]; onAddAgent?: (a:{ firstName:string; lastName:string; tzId:string })=>void; onUpdateAgent?: (index:number, a:AgentRow)=>void; onDeleteAgent?: (index:number)=>void; weekStart: string; tz:{ id:string; label:string; offset:number }; shifts: Shift[]; pto: PTO[]; tasks: Task[]; calendarSegs: CalendarSegment[]; onUpdateShift?: (id:string, patch: Partial<Shift>)=>void; onDeleteShift?: (id:string)=>void; onAddShift?: (s: Shift)=>void; selectedIdx?: number|null; onSelectIdx?: (idx:number)=>void }){
	const [firstName, setFirstName] = React.useState('')
	const [lastName, setLastName] = React.useState('')
	const [tzId, setTzId] = React.useState(TZ_OPTS[0]?.id || 'UTC')

	// Inline edit state
	const [editingIdx, setEditingIdx] = React.useState<number|null>(null)
	const [ef, setEf] = React.useState('')
	const [el, setEl] = React.useState('')
	const [et, setEt] = React.useState<string>(TZ_OPTS[0]?.id || 'UTC')
	const [eIsSup, setEIsSup] = React.useState<boolean>(false)
	const [eSupId, setESupId] = React.useState<string>('')
	const [eNotes, setENotes] = React.useState<string>('')
	const [eHidden, setEHidden] = React.useState<boolean>(false)

	// Selected agent for right panel (controlled if provided)
	const [selectedIdxLocal, setSelectedIdxLocal] = React.useState<number|null>(null)
	const selectedIdx = (selectedIdxProp!=null ? selectedIdxProp : selectedIdxLocal) as number | null
	const setSelectedIdx = (idx:number)=>{ onSelectIdx ? onSelectIdx(idx) : setSelectedIdxLocal(idx) }
	const selectedAgent = selectedIdx!=null ? agents[selectedIdx] : null
	const selectedName = selectedAgent ? [selectedAgent.firstName, selectedAgent.lastName].filter(Boolean).join(' ') : ''



	function beginEdit(idx:number){
		const a = agents[idx]
		if(!a) return
		setEditingIdx(idx)
		setEf(a.firstName || '')
		setEl(a.lastName || '')
		setEt(a.tzId || TZ_OPTS[0]?.id || 'UTC')
		setEIsSup(!!a.isSupervisor)
		setESupId((a.supervisorId as any) || '')
		setENotes(a.notes || '')
		setEHidden(!!a.hidden)
	}
	function cancelEdit(){ setEditingIdx(null) }
	function saveEdit(){
		if(editingIdx==null) return
		onUpdateAgent?.(editingIdx, {
			firstName: ef.trim(),
			lastName: el.trim(),
			tzId: et,
			hidden: eHidden,
			isSupervisor: eIsSup,
			supervisorId: eSupId ? eSupId : null,
			notes: eNotes
		})
		setEditingIdx(null)
	}

	// When selection changes, sync right-panel editor with selected agent
	React.useEffect(()=>{
		if(selectedIdx==null){ setEf(''); setEl(''); setEt(TZ_OPTS[0]?.id || 'UTC'); setEIsSup(false); setESupId(''); setENotes(''); setEHidden(false); return }
		const a = agents[selectedIdx]
		if(!a){ setEf(''); setEl(''); setEt(TZ_OPTS[0]?.id || 'UTC'); setEIsSup(false); setESupId(''); setENotes(''); setEHidden(false); return }
		setEf(a.firstName||''); setEl(a.lastName||''); setEt(a.tzId||TZ_OPTS[0]?.id||'UTC'); setEIsSup(!!a.isSupervisor); setESupId((a.supervisorId as any)||''); setENotes(a.notes||''); setEHidden(!!a.hidden)
		setEditingIdx(selectedIdx)
	}, [selectedIdx, agents])

	// Track last added agent to scroll into view
	const [lastAddedAgentName, setLastAddedAgentName] = React.useState<string | null>(null)
	const agentsListRef = React.useRef<HTMLUListElement | null>(null)
	// Presentational: sort agents by first name, then last name (case-insensitive), but keep original index for actions
	const sortedAgents = React.useMemo(() => (
		agents
			.map((a, i) => ({ a, i }))
			.sort((x, y) => {
				const af = (x.a.firstName || '').toLowerCase()
				const bf = (y.a.firstName || '').toLowerCase()
				if (af !== bf) return af.localeCompare(bf)
				const al = (x.a.lastName || '').toLowerCase()
				const bl = (y.a.lastName || '').toLowerCase()
				return al.localeCompare(bl)
			})
	), [agents])
	React.useEffect(()=>{
		if(!lastAddedAgentName) return
		// Find the display index within the sorted list
		const sIdx = sortedAgents.findIndex(({a})=> `${a.firstName} ${a.lastName}`.trim() === lastAddedAgentName)
		if(sIdx>=0 && agentsListRef.current){
			const li = agentsListRef.current.children[sIdx] as HTMLElement | undefined
			li?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
		}
		setLastAddedAgentName(null)
	}, [sortedAgents, lastAddedAgentName])

	// Arrow Up/Down to navigate agent selection in the left list (after sortedAgents exists)
	React.useEffect(()=>{
		const onKey = (e: KeyboardEvent)=>{
			const t = e.target as HTMLElement | null
			const tag = (t?.tagName || '').toLowerCase()
			const isFormField = tag==='input' || tag==='textarea' || tag==='select' || (t?.isContentEditable===true)
			if(isFormField) return
			if(e.key!== 'ArrowDown' && e.key!== 'ArrowUp') return
			if(sortedAgents.length===0) return
			e.preventDefault()
			let pos = selectedIdx==null ? -1 : sortedAgents.findIndex(x=> x.i===selectedIdx)
			if(e.key==='ArrowDown') pos = Math.min(sortedAgents.length-1, pos+1)
			else pos = pos<=0 ? 0 : pos-1
			const next = sortedAgents[pos]
			if(next){
				setSelectedIdx(next.i)
				setTimeout(()=>{
					const ul = agentsListRef.current
					const li = ul?.querySelector<HTMLLIElement>(`li[data-idx=\"${next.i}\"]`)
					li?.scrollIntoView({ block: 'nearest' })
				}, 0)
			}
		}
		window.addEventListener('keydown', onKey)
		return ()=> window.removeEventListener('keydown', onKey)
	}, [sortedAgents, selectedIdx])

	// Delete confirmation state
	const [deleteIdx, setDeleteIdx] = React.useState<number|null>(null)
	const pending = deleteIdx!=null ? agents[deleteIdx] : null
	function confirmDelete(){ if(deleteIdx==null) return; onDeleteAgent?.(deleteIdx); setDeleteIdx(null) }


	// Local editable shifts for selected agent (prototype; not persisted upstream)
	const [agentShiftsLocal, setAgentShiftsLocal] = React.useState<Shift[]>([])
	React.useEffect(()=>{
		if(!selectedName){ setAgentShiftsLocal([]); return }
		const list = shifts.filter(s=> s.person===selectedName)
		// Sort by day order, then start time
		const order = new Map(DAYS.map((d,i)=>[d,i]))
		setAgentShiftsLocal(list.slice().sort((a,b)=> (order.get(a.day as any)! - order.get(b.day as any)!) || a.start.localeCompare(b.start)))
	},[selectedName, shifts])

	// Single-level undo for most recent shift change on this page
	const [lastUndo, setLastUndo] = React.useState<null | { person:string; shifts: Shift[] }>(null)
	const captureUndo = React.useCallback(()=>{
		if(!selectedName) return
		setLastUndo({ person: selectedName, shifts: agentShiftsLocal.map(s=> ({ ...s })) })
	}, [selectedName, agentShiftsLocal])

	const undoLast = React.useCallback(()=>{
		if(!lastUndo) return
		const person = lastUndo.person
		const prevList = lastUndo.shifts
		// Compare to current list for that person
		const currentForPerson = (selectedName===person ? agentShiftsLocal : shifts.filter(s=> s.person===person))
		const prevMap = new Map(prevList.map(s=> [s.id, s]))
		const curMap = new Map(currentForPerson.map(s=> [s.id, s]))
		// Remove newly added
		for(const [id] of curMap){ if(!prevMap.has(id)){ onDeleteShift?.(id) } }
		// Re-add removed
		for(const [, s] of prevMap){ if(!curMap.has(s.id)){ onAddShift?.(s) } }
		// Revert updates
		for(const [, prev] of prevMap){
			const cur = curMap.get(prev.id); if(!cur) continue
			const prevEndDay = (prev as any).endDay
			const curEndDay = (cur as any).endDay
			if(prev.day!==cur.day || prev.start!==cur.start || prev.end!==cur.end || prevEndDay!==curEndDay){
				onUpdateShift?.(prev.id, { day: prev.day, start: prev.start, end: prev.end, endDay: prevEndDay })
			}
		}
		// Focus agent and restore local list
		const idx = agents.findIndex(a=> [a.firstName, a.lastName].filter(Boolean).join(' ') === person)
		if(idx>=0) setSelectedIdx(idx)
		setAgentShiftsLocal(prevList.slice())
		setLastUndo(null)
	}, [lastUndo, selectedName, agentShiftsLocal, shifts, onDeleteShift, onAddShift, onUpdateShift, agents])

	// Ctrl/Cmd+Z listener
	React.useEffect(()=>{
		const onKey = (e: KeyboardEvent)=>{
			const isUndo = (e.ctrlKey || e.metaKey) && !e.shiftKey && (e.key==='z' || e.key==='Z')
			if(isUndo){ e.preventDefault(); undoLast() }
		}
		window.addEventListener('keydown', onKey)
		return ()=> window.removeEventListener('keydown', onKey)
	}, [undoLast])

	// Compose timeline shifts so bottom panel reflects local edits immediately
	const timelineShifts = React.useMemo(()=>{
		if(!selectedName) return shifts
		const others = shifts.filter(s=> s.person!==selectedName)
		return others.concat(agentShiftsLocal)
	}, [shifts, selectedName, agentShiftsLocal])

	// Helpers to apply a minute delta to a shift (updates day/start/end/endDay)
	const addMin = (hhmm:string, delta:number)=>{
		const [h,m] = hhmm.split(':').map(x=>parseInt(x||'0',10)||0)
		let total = h*60+m + delta
		const minutesInDay = 1440
		total = ((total % minutesInDay) + minutesInDay) % minutesInDay
		const hh = Math.floor(total/60).toString().padStart(2,'0')
		const mm = (total%60).toString().padStart(2,'0')
		return `${hh}:${mm}`
	}
	const shiftDayIndex = (d:Shift['day'])=> DAYS.indexOf(d as any)
	const dayByIndex = (i:number)=> DAYS[((i%7)+7)%7] as Shift['day']
	const toMinLocal = (t:string)=>{ const [h,m]=t.split(':'); return (parseInt(h||'0',10)||0)*60 + (parseInt(m||'0',10)||0) }
	const applyDeltaToShift = (s:Shift, deltaMin:number): Shift =>{
		const minutesInDay = 1440
		const startAbs = shiftDayIndex(s.day)*minutesInDay + toMinLocal(s.start)
		const endDay = (s as any).endDay || s.day
		const endAbs0 = shiftDayIndex(endDay)*minutesInDay + toMinLocal(s.end)
		const endAbs = endAbs0 <= startAbs ? endAbs0 + minutesInDay : endAbs0
		let ns = startAbs + deltaMin
		let ne = endAbs + deltaMin
		// wrap within the same displayed week band (0..10080), but compute day/time by modulo
		const nsDay = Math.floor(((ns/ minutesInDay)%7+7)%7)
		const neDay = Math.floor(((ne/ minutesInDay)%7+7)%7)
		const nsMin = ((ns % minutesInDay)+minutesInDay)%minutesInDay
		const neMin = ((ne % minutesInDay)+minutesInDay)%minutesInDay
		const newDay = dayByIndex(nsDay)
		const newStart = addMin('00:00', nsMin)
		const newEnd = addMin('00:00', neMin)
		const newEndDay = dayByIndex(neDay)
		return { ...s, day: newDay, start: newStart, end: newEnd, endDay: newEndDay }
	}

	// Global rule: an agent cannot have overlapping shifts.
	// Compare absolute minute ranges within a 0..10080 band (inclusive start, exclusive end).
	const rangesOverlap = (aStart:number, aEnd:number, bStart:number, bEnd:number)=> (
		Math.max(aStart, bStart) < Math.min(aEnd, bEnd)
	)
	const absRange = (s: Shift)=>{
		const minutesInDay = 1440
		const sd = shiftDayIndex(s.day)
		const eday = (s as any).endDay || s.day
		const ed = shiftDayIndex(eday)
		const sMin = toMinLocal(s.start)
		const eMin = toMinLocal(s.end)
		const sAbs = sd*minutesInDay + sMin
		let eAbs = ed*minutesInDay + eMin
		if(ed < sd){
			// Wrap into next week (e.g., Sat -> Sun)
			eAbs += 7*minutesInDay
		}else if(ed === sd && eAbs <= sAbs){
			// Same day but ends after midnight
			eAbs += minutesInDay
		}
		return { start: sAbs, end: eAbs }
	}

	const shiftDurationMin = (s: Shift)=>{
		const r = absRange(s); return Math.max(0, r.end - r.start)
	}

	const fmtDuration = (min: number)=>{
		const h = Math.floor(min/60); const m = min%60
		if(m===0) return `${h}h`
		return `${h}h ${m}m`
	}

	// Totals for the selected agent
	const totalMinutesAll = React.useMemo(()=> agentShiftsLocal.reduce((acc,s)=> acc + shiftDurationMin(s), 0), [agentShiftsLocal])
	const breakMinutesAll = agentShiftsLocal.length * 30
	const billableMinutesAll = Math.max(0, totalMinutesAll - breakMinutesAll)

	const wouldOverlap = (candidate: Shift, all: Shift[])=>{
		const c = absRange(candidate)
		for(const s of all){
			if(s.id===candidate.id) continue
			const r = absRange(s)
			if(rangesOverlap(c.start, c.end, r.start, r.end)) return true
		}
		return false
	}

	const handleDragAll = (deltaMinutes:number)=>{
		captureUndo()
		if(!selectedName) return
		// Compute next list and block if any overlaps are introduced (shouldn't, since relative move keeps internal gaps)
		const nextList = agentShiftsLocal.map(s=> applyDeltaToShift(s, deltaMinutes))
		// Validate pairwise to be safe
		for(let i=0;i<nextList.length;i++){
			for(let j=i+1;j<nextList.length;j++){
				if(wouldOverlap(nextList[i], nextList)){
					alert('Move would cause overlapping shifts for this agent.');
					return
				}
			}
		}
		setAgentShiftsLocal(nextList)
		// Persist upstream
		nextList.forEach(s=>{
			onUpdateShift?.(s.id, { day: s.day, start: s.start, end: s.end, endDay: (s as any).endDay })
		})
	}
	const handleDragSingle = (id:string, deltaMinutes:number)=>{
		captureUndo()
		const base = agentShiftsLocal
		const idx = base.findIndex(s=>s.id===id)
		if(idx<0) return
		const next = applyDeltaToShift(base[idx], deltaMinutes)
		const merged = base.map((s,i)=> i===idx ? next : s)
		if(wouldOverlap(next, merged)){
			alert('Move would cause overlapping shifts for this agent.')
			return
		}
		setAgentShiftsLocal(merged)
		onUpdateShift?.(next.id, { day: next.day, start: next.start, end: next.end, endDay: (next as any).endDay })
	}

	// Inline edit state for shifts list
	const [editingShiftId, setEditingShiftId] = React.useState<string|null>(null)
	const [lastAddedShiftId, setLastAddedShiftId] = React.useState<string|null>(null)
	const [eDay, setEDay] = React.useState<Shift['day']>('Mon' as any)
		const [eStart, setEStart] = React.useState('')
		const [eEnd, setEEnd] = React.useState('')
		const [eEndDay, setEEndDay] = React.useState<Shift['day']>('Mon' as any)

	// Refs for time inputs to open the picker via custom icon
	const startTimeRef = React.useRef<HTMLInputElement|null>(null)
	const endTimeRef = React.useRef<HTMLInputElement|null>(null)

		function beginEditShift(s: Shift){ setEditingShiftId(s.id); setEDay(s.day); setEStart(s.start); setEEnd(s.end); setEEndDay((s as any).endDay || s.day) }
	function cancelEditShift(){ setEditingShiftId(null) }
	function saveEditShift(){
		if(!editingShiftId) return
		captureUndo()
			// Validate overlap against current shifts
			const nextCandidate: Shift = { ...(agentShiftsLocal.find(s=>s.id===editingShiftId) as Shift), day: eDay, start: eStart, end: eEnd, endDay: eEndDay }
			const merged = agentShiftsLocal.map(s=> s.id===editingShiftId ? nextCandidate : s)
			if(wouldOverlap(nextCandidate, merged)){
				alert('Saved times would overlap another shift for this agent.')
				return
			}
			// Optimistic local update
			setAgentShiftsLocal(merged)
			// Persist upstream
			onUpdateShift?.(editingShiftId, { day: eDay, start: eStart, end: eEnd, endDay: eEndDay })
		setEditingShiftId(null)
	}

	// Delete state for shift rows
	const [deleteShiftId, setDeleteShiftId] = React.useState<string|null>(null)
	const deletingShift = deleteShiftId ? agentShiftsLocal.find(s=>s.id===deleteShiftId) : null
		function confirmDeleteShift(){ if(!deleteShiftId) return; captureUndo(); setAgentShiftsLocal(prev=> prev.filter(s=> s.id!==deleteShiftId)); onDeleteShift?.(deleteShiftId); setDeleteShiftId(null) }

	// Delete all shifts double-confirmation step: 0=none, 1=first modal, 2=final modal
	const [deleteAllStep, setDeleteAllStep] = React.useState<0|1|2>(0)

	function submitAdd(e: React.FormEvent){
		e.preventDefault()
		const fn = firstName.trim()
		const ln = lastName.trim()
		if(!fn || !ln) return
		setLastAddedAgentName(`${fn} ${ln}`.trim())
		onAddAgent?.({ firstName: fn, lastName: ln, tzId })
		setFirstName('')
		setLastName('')
	}

		// Add Shift (top-right + button)
		const nextDay = (d: Shift['day'])=> DAYS[(DAYS.indexOf(d as any)+1)%DAYS.length] as any
		const toMin = (hhmm:string)=>{
			if(hhmm === '24:00') return 24*60
			const [h,m] = hhmm.split(':')
			return (parseInt(h||'0',10)||0)*60 + (parseInt(m||'0',10)||0)
		}
		function handleAddShift(){
			if(!selectedAgent || !selectedName) return
			captureUndo()
			const present = new Set(agentShiftsLocal.map(s=> s.day))
			const MON_FIRST: Shift['day'][] = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'] as any
			const defaultDay = (agentShiftsLocal.length===0
				? 'Mon'
				: ((MON_FIRST.find(d=> !present.has(d)) || 'Mon') as Shift['day'])
			)
			let defaultStart = '08:00'
			let defaultEnd = '16:30'
			if(agentShiftsLocal.length>0){
				const last = agentShiftsLocal[agentShiftsLocal.length-1]
				defaultStart = last.start
				defaultEnd = last.end
			}
			const endNext = defaultEnd !== '24:00' && toMin(defaultEnd) <= toMin(defaultStart)
			const defaultEndDay = agentShiftsLocal.length===0 ? defaultDay : (endNext ? nextDay(defaultDay) : defaultDay)
			const id = (globalThis as any).crypto?.randomUUID?.() || Math.random().toString(36).slice(2)
			const newShift: Shift = { id, person: selectedName, day: defaultDay, start: defaultStart, end: defaultEnd, endDay: defaultEndDay }
			// Prevent adding an overlapping shift by nudging to the next available slot within the day
			let candidate = newShift
			let guard = 0
			while(wouldOverlap(candidate, agentShiftsLocal.concat([{...candidate}])) && guard<20){
				candidate = { ...candidate, start: addMin(candidate.start, 30), end: addMin(candidate.end, 30) }
				guard++
			}
			if(guard>=20 && wouldOverlap(candidate, agentShiftsLocal.concat([{...candidate}]))){
				alert('Could not find a non-overlapping slot for the default shift. Please adjust times after adding.')
			}
			// Optimistic local insert; do not auto-enter edit mode
			setAgentShiftsLocal(prev=> prev.concat([candidate]))
			setLastAddedShiftId(candidate.id)
			// Persist upstream immediately so Save performs an update
			onAddShift?.(candidate)
		}

	// Clear highlight after a short delay
	React.useEffect(()=>{
		if(!lastAddedShiftId) return
		const t = setTimeout(()=> setLastAddedShiftId(null), 300)
		return ()=> clearTimeout(t)
	}, [lastAddedShiftId])
	// Keep bottom timeline visible by constraining internal lists via fixed viewport-based heights.

	return (
		<div className={["rounded-xl p-4 border", dark?"bg-neutral-900 border-neutral-800":"bg-white border-neutral-200"].join(' ')}>
			<div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-start">
				{/* Left: compact, scrollable Agents panel (half width on desktop) */}
				<section className={["rounded-lg p-3 border", dark?"bg-neutral-950 border-neutral-800":"bg-neutral-50 border-neutral-200"].join(' ')}>
					<div className="flex items-center justify-between mb-2">
						<div className="text-sm font-medium">Agents ({agents.length})</div>
					</div>
					{agents.length === 0 ? (
						<div className={["rounded-md p-2 text-xs", dark?"bg-neutral-900 text-neutral-300":"bg-white text-neutral-600"].join(' ')}>
							No agents found.
						</div>
					) : (
						<div className={["rounded-md", dark?"":""].join(' ')}>
            <div className="px-2 py-1.5 text-xs uppercase tracking-wide opacity-70 grid gap-2" style={{ gridTemplateColumns: '200px 1fr 200px 64px' }}>
              <div className="whitespace-nowrap">Name</div>
              <div className="whitespace-nowrap">Notes</div>
              <div className="text-right whitespace-nowrap">Reports to</div>
              <div className="whitespace-nowrap">TZ</div>
            </div>
										    <ul ref={agentsListRef} className={["max-h-[48vh] overflow-y-auto"].join(' ')}>
															    {sortedAgents.map(({ a, i }, sIdx)=> {
                  const supId = (a as any).supervisorId as string | undefined | null
                  const supAgent = supId ? (agents.find(x=> ((x as any).id && (x as any).id===supId) || (`${x.firstName||''} ${x.lastName||''}`.trim()===supId)) || null) : null
                  const supName = supAgent ? `${supAgent.firstName||''} ${supAgent.lastName||''}`.trim() : (supId || '')
                  return (
                    <li
                      data-idx={i}
                      key={`${a.firstName}-${a.lastName}-${i}`}
                      className={[
                        "px-2 py-1.5 text-sm leading-6 grid gap-2 items-center cursor-pointer",
                        selectedIdx===i ? (dark?"bg-neutral-800":"bg-blue-50") : (dark?"odd:bg-neutral-900":"odd:bg-neutral-100")
                      ].join(' ')}
                      style={{ gridTemplateColumns: '200px 1fr 200px 64px' }}
                      onClick={()=>setSelectedIdx(i)}
                    >
                      {/* Name */}
                      <div className={[dark?"text-neutral-200":"text-neutral-800", a.hidden?"opacity-60":""].join(' ')}>{[a.firstName||'—', a.lastName||''].filter(Boolean).join(' ')}</div>
                      {/* Notes */}
                      <div className={["truncate", dark?"text-neutral-300":"text-neutral-700"].join(' ')}>{(a.notes||'').split(/\r?\n/)[0] || ''}</div>
                      {/* Reports to */}
                      <div className="text-right">
                        <span className="inline-flex items-center gap-1 justify-end">
                          <span className={["truncate inline-block", dark?"text-neutral-300":"text-neutral-700"].join(' ')}>{supName || '—'}</span>
                          {a.isSupervisor && (
                            <svg aria-hidden className={dark?"text-amber-300":"text-amber-600"} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <title>Supervisor</title>
                              <path d="M12 2l3 7 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1z"/>
                            </svg>
                          )}
                        </span>
                      </div>
                      {/* Timezone */}
                      <div className={["whitespace-nowrap", dark?"text-neutral-300":"text-neutral-700"].join(' ')}>{tzAbbrev(a.tzId||'UTC')}</div>
                    </li>
                  )
                })}
											</ul>
							</div>
						)}
					{/* Add Agent form (part of the same unit) */}
					<div className="mt-2">
									<form onSubmit={submitAdd} className="grid grid-cols-2 md:grid-cols-4 gap-2 items-end">
										<label className="col-span-1 flex flex-col gap-1">
								<span className="text-xs opacity-80">First</span>
								<input
									className={["border rounded-md px-2 py-1 text-sm", dark?"bg-neutral-900 border-neutral-700 text-neutral-100":"bg-white border-neutral-300 text-neutral-800"].join(' ')}
									value={firstName}
									onChange={e=>setFirstName(e.target.value)}
									placeholder="First name"
								/>
							</label>
										<label className="col-span-1 flex flex-col gap-1">
								<span className="text-xs opacity-80">Last</span>
								<input
									className={["border rounded-md px-2 py-1 text-sm", dark?"bg-neutral-900 border-neutral-700 text-neutral-100":"bg-white border-neutral-300 text-neutral-800"].join(' ')}
									value={lastName}
									onChange={e=>setLastName(e.target.value)}
									placeholder="Last name"
								/>
							</label>
										<label className="col-span-1 flex flex-col gap-1">
								<span className="text-xs opacity-80">Timezone</span>
								<select
									className={["border rounded-md px-2 py-1 text-sm", dark?"bg-neutral-900 border-neutral-700 text-neutral-100":"bg-white border-neutral-300 text-neutral-800"].join(' ')}
									value={tzId}
									onChange={e=>setTzId(e.target.value)}
								>
												{TZ_OPTS.map(o=> (
													<option key={o.id} value={o.id}>{tzFullName(o.id)}</option>
												))}
								</select>
							</label>
										<div className="col-span-1 flex md:justify-end">
								<button
									type="submit"
									disabled={!firstName.trim() || !lastName.trim()}
									className={["px-3 py-1.5 rounded-md text-sm font-medium border", dark?"bg-neutral-900 border-neutral-700 text-neutral-100":"bg-blue-600 border-blue-600 text-white"].join(' ')}
								>Add Agent</button>
							</div>
						</form>
					</div>
				</section>

						{/* Delete confirmation modal */}
						{deleteIdx!=null && (
							<div role="dialog" aria-modal="true" className={["fixed inset-0 z-50 flex items-center justify-center", dark?"bg-black/70":"bg-black/50"].join(' ')}>
								<div className={["max-w-sm w-[92%] rounded-xl p-4 border", dark?"bg-neutral-900 border-neutral-700 text-neutral-100":"bg-white border-neutral-200 text-neutral-900"].join(' ')}>
									<div className="text-base font-semibold mb-2">Delete agent?</div>
									<div className="text-sm opacity-80 mb-4">This will remove {pending?.firstName} {pending?.lastName}. This cannot be undone.</div>
									<div className="flex justify-end gap-2">
										<button onClick={()=>setDeleteIdx(null)} className={["px-3 py-1.5 rounded-md text-sm border", dark?"border-neutral-700":"border-neutral-300"].join(' ')}>Cancel</button>
										<button onClick={confirmDelete} className={["px-3 py-1.5 rounded-md text-sm border bg-red-600 text-white border-red-600"].join(' ')}>Delete</button>
									</div>
								</div>
							</div>
						)}

						{/* Delete shift confirmation modal */}
						{deleteShiftId && deletingShift && (
							<div role="dialog" aria-modal="true" className={["fixed inset-0 z-50 flex items-center justify-center", dark?"bg-black/70":"bg-black/50"].join(' ')}>
								<div className={["max-w-sm w-[92%] rounded-xl p-4 border", dark?"bg-neutral-900 border-neutral-700 text-neutral-100":"bg-white border-neutral-200 text-neutral-900"].join(' ')}>
									<div className="text-base font-semibold mb-2">Delete shift?</div>
									<div className="text-sm opacity-80 mb-4">
										This will remove the shift for {selectedName} on {deletingShift.day}
										{' '}
										{deletingShift.start}–{deletingShift.end}
										{(deletingShift as any).endDay && (deletingShift as any).endDay !== deletingShift.day ? (
											<>
												{' '}ending {String((deletingShift as any).endDay)}
											</>
										) : null}.
										 This cannot be undone.
									</div>
									<div className="flex justify-end gap-2">
										<button onClick={()=>setDeleteShiftId(null)} className={["px-3 py-1.5 rounded-md text-sm border", dark?"border-neutral-700":"border-neutral-300"].join(' ')}>Cancel</button>
										<button onClick={confirmDeleteShift} className={["px-3 py-1.5 rounded-md text-sm border bg-red-600 text-white border-red-600"].join(' ')}>Delete</button>
									</div>
								</div>
							</div>
						)}

				{/* Right: selected agent details + shifts */}
								<div className={["rounded-lg p-3", dark?"bg-neutral-950":"bg-neutral-50"].join(' ')}>
									{/* Agent info controls */}
										{selectedAgent && (
											<AgentDetailsPanel
												dark={dark}
												selectedName={selectedName}
												firstName={ef}
												lastName={el}
												tzId={et}
												isSupervisor={eIsSup}
												supervisorId={eSupId}
												hidden={eHidden}
												notes={eNotes}
												agents={agents as any}
												selectedIdx={selectedIdx as any}
												onFirst={(v)=> setEf(v)}
												onLast={(v)=> setEl(v)}
												onTz={(v)=> setEt(v)}
												onIsSup={(v)=> setEIsSup(v)}
												onSupId={(v)=> setESupId(v)}
												onHidden={(v)=> setEHidden(v)}
												onNotes={(v)=> setENotes(v)}
												onSave={saveEdit}
												onDelete={()=> selectedIdx!=null && setDeleteIdx(selectedIdx)}
											/>
										)}
									<div className="flex items-center justify-between mb-2">
																<div className="text-sm font-medium">Shifts ({agentShiftsLocal.length}){agentShiftsLocal.length>0 && (
																	<span className={"ml-2 opacity-70"}>
																		• Total {fmtDuration(totalMinutesAll)} 
																		<span aria-hidden>− {agentShiftsLocal.length}×30m = {fmtDuration(billableMinutesAll)} billable</span>
																	</span>
																)}</div>
																<div className="inline-flex items-center gap-1">
																	<button
																		title="Delete all shifts"
																		aria-label="Delete all shifts"
																		disabled={!selectedAgent || agentShiftsLocal.length===0}
																		onClick={()=> setDeleteAllStep(1)}
																		className={["inline-flex items-center justify-center w-8 h-8 rounded border", dark?"border-neutral-800 text-red-300 hover:bg-neutral-900 disabled:opacity-50":"border-neutral-300 text-red-600 hover:bg-red-50 disabled:opacity-50"].join(' ')}
																	>
																		<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
																			<path d="M5 12h14"/>
																		</svg>
																	</button>
																	<button
																		title="Add shift"
																		aria-label="Add shift"
																		disabled={!selectedAgent}
																		onClick={handleAddShift}
																		className={["inline-flex items-center justify-center w-8 h-8 rounded border", dark?"border-neutral-800 text-neutral-200 hover:bg-neutral-900 disabled:opacity-50":"border-neutral-300 text-neutral-700 hover:bg-neutral-100 disabled:opacity-50"].join(' ')}
																	>
																		<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
																			<path d="M12 5v14"/>
																			<path d="M5 12h14"/>
																		</svg>
																	</button>
																</div>
															</div>
										{!selectedAgent ? (
						<div className="text-sm opacity-70">Select an agent on the left to view and edit their shifts.</div>
										) : (
							<div>
								<div className="px-2 py-1.5 text-xs uppercase tracking-wide opacity-70 grid grid-cols-6 gap-2">
								<div>Start Day</div>
								<div>Start Time</div>
								<div>End Day</div>
								<div>End Time</div>
									<div>Length</div>
								<div className="text-right">Actions</div>
							</div>
												<ul className="max-h-[36vh] overflow-y-auto">
													{agentShiftsLocal.length===0 ? (
														<li className={["px-2 py-6 text-sm", dark?"text-neutral-300":"text-neutral-700"].join(' ')}>
															<div className="flex flex-col items-center gap-3">
																<div>No shifts for this agent.</div>
																<button
																	onClick={()=>{
																		if(!selectedName) return
																		const days: Shift['day'][] = ['Mon','Tue','Wed','Thu','Fri'] as any
																		const makeId = ()=> (globalThis as any).crypto?.randomUUID?.() || Math.random().toString(36).slice(2)
																		const base: Omit<Shift,'id'> = { person: selectedName, day: 'Mon' as any, start: '08:00', end: '16:30' }
																		const created: Shift[] = days.map((d)=> ({ id: makeId(), ...base, day: d, endDay: d })) as any
																		setAgentShiftsLocal(created)
																		created.forEach(s=> onAddShift?.(s))
																	}}
																	className={["px-3 py-1.5 rounded-md text-sm font-medium border", dark?"bg-neutral-900 border-neutral-700 text-neutral-100 hover:bg-neutral-800":"bg-blue-600 border-blue-600 text-white hover:opacity-95"].join(' ')}
																>
																	Create standard week (Mon–Fri, 8:00–4:30 PST)
																</button>
															</div>
														</li>
													) : agentShiftsLocal.map(s=> {
									// If viewer tz differs from agent tz, compute agent-local times for secondary labels
									const agentTzId = selectedAgent?.tzId || TZ_OPTS[0]?.id || 'UTC'
									const viewerTzId = tz.id
									let secondary: { startDay:string; start:string; endDay:string; end:string } | null = null
									if(viewerTzId !== agentTzId){
										const base: any = { ...s, person: s.person }
										// Convert PT-based shift to the agent's local TZ using its offset
										const agentOff = (TZ_OPTS.find(o=> o.id===agentTzId)?.offset) ?? 0
										const segs = convertShiftsToTZ([base], agentOff)
										const first = segs[0]
										secondary = first ? { startDay: first.day, start: first.start, endDay: (first as any).endDay || first.day, end: first.end } : null
									}
									return (
									<li key={s.id} className={["px-2 py-1.5 text-sm leading-6 grid grid-cols-6 gap-2 items-center", dark?"odd:bg-neutral-900":"odd:bg-neutral-100", lastAddedShiftId===s.id?"shift-add-in":""].filter(Boolean).join(' ')}>
										{editingShiftId===s.id ? (
											<>
												<div>
													<select className={["w-full border rounded px-2 py-1 text-sm", dark?"bg-neutral-900 border-neutral-700 text-neutral-100":"bg-white border-neutral-300 text-neutral-800"].join(' ')} value={eDay} onChange={e=>setEDay(e.target.value as any)}>
														{DAYS.map(d=> <option key={d} value={d}>{d}</option>)}
													</select>
												</div>
												<div>
													<div className="relative">
																					<input
																						ref={startTimeRef}
																						type="time"
																						className={["w-full border rounded px-2 pr-10 py-1 text-sm", dark?"bg-neutral-900 border-neutral-700 text-neutral-100":"bg-white border-neutral-300 text-neutral-800"].join(' ')}
																						value={eStart}
																						onChange={e=>{
																							const v = e.target.value
																							setEStart(v)
																							// Default end to 8.5 hours after new start
																							const newEnd = addMin(v, 8*60 + 30)
																							setEEnd(newEnd)
																							// If end wraps past midnight, bump end day
																							const wraps = toMinLocal(newEnd) <= toMinLocal(v)
																							setEEndDay(wraps ? nextDay(eDay) : eDay)
																						}}
																					/>
																					<button
																						type="button"
																						className={["absolute right-1 top-1/2 -translate-y-1/2 inline-flex items-center justify-center w-6 h-6 rounded", dark?"text-neutral-300 hover:bg-neutral-800":"text-neutral-600 hover:bg-neutral-100"].join(' ')}
																						onClick={()=>{
																							const el = startTimeRef.current
																							if((el as any)?.showPicker){ (el as any).showPicker() } else { el?.focus() }
																						}}
																						aria-label="Open time picker"
																						tabIndex={-1}
																					>
																						<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
																							<circle cx="12" cy="12" r="9"/>
																							<path d="M12 7v5l3 3"/>
																						</svg>
																					</button>
																				</div>
												</div>
												<div>
													<select className={["w-full border rounded px-2 py-1 text-sm", dark?"bg-neutral-900 border-neutral-700 text-neutral-100":"bg-white border-neutral-300 text-neutral-800"].join(' ')} value={eEndDay} onChange={e=>setEEndDay(e.target.value as any)}>
														{DAYS.map(d=> <option key={d} value={d}>{d}</option>)}
													</select>
												</div>
												<div>
													<div className="relative">
																					<input
																						ref={endTimeRef}
																						type="time"
																						className={["w-full border rounded px-2 pr-10 py-1 text-sm", dark?"bg-neutral-900 border-neutral-700 text-neutral-100":"bg-white border-neutral-300 text-neutral-800"].join(' ')}
																						value={eEnd}
																						onChange={e=>setEEnd(e.target.value)}
																					/>
																					<button
																						type="button"
																						className={["absolute right-1 top-1/2 -translate-y-1/2 inline-flex items-center justify-center w-6 h-6 rounded", dark?"text-neutral-300 hover:bg-neutral-800":"text-neutral-600 hover:bg-neutral-100"].join(' ')}
																						onClick={()=>{
																							const el = endTimeRef.current
																							if((el as any)?.showPicker){ (el as any).showPicker() } else { el?.focus() }
																						}}
																						aria-label="Open time picker"
																						tabIndex={-1}
																					>
																						<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
																							<circle cx="12" cy="12" r="9"/>
																							<path d="M12 7v5l3 3"/>
																						</svg>
																					</button>
																				</div>
												</div>
												<div className={dark?"text-neutral-300":"text-neutral-700"}>
													{fmtDuration(shiftDurationMin({ ...s, day: eDay, start: eStart, end: eEnd, endDay: eEndDay }))}
												</div>
												<div className="inline-flex items-center justify-end gap-1 whitespace-nowrap">
													<button onClick={saveEditShift} className={["px-2 py-1 rounded border text-xs", dark?"bg-neutral-900 border-neutral-700 text-neutral-100":"bg-blue-600 border-blue-600 text-white"].join(' ')}>Save</button>
													<button onClick={cancelEditShift} className={["px-2 py-1 rounded border text-xs", dark?"border-neutral-700 text-neutral-200":"border-neutral-300 text-neutral-700"].join(' ')}>Cancel</button>
												</div>
											</>
										) : (
											<>
												<div className={dark?"text-neutral-200":"text-neutral-800"}>
													<div>{s.day}</div>
													{secondary && <div className="text-xs opacity-70">{secondary.startDay} <span className="opacity-60">({tzAbbrev(selectedAgent?.tzId||'UTC')})</span></div>}
												</div>
												<div className={dark?"text-neutral-200":"text-neutral-800"}>
													<div>{s.start}</div>
													{secondary && <div className="text-xs opacity-70">{secondary.start}</div>}
												</div>
												<div className={dark?"text-neutral-200":"text-neutral-800"}>
													<div>{(s as any).endDay || s.day}</div>
													{secondary && <div className="text-xs opacity-70">{secondary.endDay}</div>}
												</div>
												<div className={dark?"text-neutral-200":"text-neutral-800"}>
													<div>{s.end}</div>
													{secondary && <div className="text-xs opacity-70">{secondary.end}</div>}
												</div>
												<div className={dark?"text-neutral-300":"text-neutral-700"}>{fmtDuration(shiftDurationMin(s))}</div>
												<div className="text-right">
													<div className="inline-flex items-center gap-1">
														<button title="Edit" aria-label="Edit shift" onClick={()=>beginEditShift(s)} className={["inline-flex items-center justify-center w-7 h-7 rounded border", dark?"border-neutral-700 text-neutral-200 hover:bg-neutral-800":"border-neutral-300 text-neutral-700 hover:bg-neutral-100"].join(' ')}>
															<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
																<path d="M12 20h9"/>
																<path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>
															</svg>
														</button>
														<button title="Delete" aria-label="Delete shift" onClick={()=>setDeleteShiftId(s.id)} className={["inline-flex items-center justify-center w-7 h-7 rounded border", dark?"border-neutral-700 text-red-300 hover:bg-neutral-800":"border-neutral-300 text-red-600 hover:bg-red-50"].join(' ')}>
															<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
																<polyline points="3 6 5 6 21 6"/>
																<path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
																<path d="M10 11v6"/>
																<path d="M14 11v6"/>
																<path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
															</svg>
														</button>
													</div>
												</div>
											</>
										)}
									</li>
								)})}
							</ul>
						</div>
					)}
						<DeleteAllShiftsModals
							dark={dark}
							deleteAllStep={deleteAllStep as any}
							setDeleteAllStep={(n:any)=> setDeleteAllStep(n)}
							selectedName={selectedName}
							agentShiftsLocal={agentShiftsLocal}
							captureUndo={captureUndo}
							onDeleteShift={(id)=> onDeleteShift?.(id)}
						/>
					</div>
			</div>
			{/* Bottom: full-width timeline for selected agent */}
			<div className="mt-3">
				<div className={["rounded-lg border", dark?"bg-neutral-950 border-neutral-800":"bg-neutral-50 border-neutral-200"].join(' ')}>
					{!selectedAgent ? (
						<div className={["p-4 text-sm", dark?"text-neutral-400":"text-neutral-600"].join(' ')}>
							Select an agent to show their weekly timeline.
						</div>
					) : (
						<div className="p-2">
							<AgentWeekLinear
								dark={dark}
								tz={tz}
								weekStart={weekStart}
								agent={selectedName}
								shifts={timelineShifts}
								pto={pto}
								tasks={tasks}
								calendarSegs={calendarSegs}
								onDragAll={handleDragAll}
								onDragShift={handleDragSingle}
								showShiftLabels={true}
								showEdgeTimeTagsForHighlights={true}
								framed={true}
								alwaysShowTimeTags={true}
								forceOuterTimeTags={true}
								bandHeight={40}
								dayLabelFontPx={13}
							/>
						</div>
					)}
				</div>
			</div>
		</div>
	)
}
