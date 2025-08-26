import React, { useEffect, useState } from 'react'
import { fmtYMD, startOfWeek } from './lib/utils'
import { cloudGet, cloudPost } from './lib/api'
import type { PTO, Shift, Task } from './types'
import type { CalendarSegment } from './lib/utils'
import TopBar from './components/TopBar'
import SchedulePage from './pages/SchedulePage'
import ManagePage from './pages/ManagePage'
import { generateSample } from './sample'
import { sha256Hex } from './lib/utils'
import { TZ_OPTS } from './constants'

const SAMPLE = generateSample()

export default function App(){
  const [view,setView] = useState<'schedule'|'manage'>('schedule')
  const [weekStart,setWeekStart] = useState(()=>fmtYMD(startOfWeek(new Date())))
  const [dayIndex,setDayIndex] = useState(() => new Date().getDay());
  const [dark,setDark] = useState(true)
  const [shifts, setShifts] = useState<Shift[]>(SAMPLE.shifts)
  const [pto, setPto] = useState<PTO[]>(SAMPLE.pto)
  const [tz, setTz] = useState(TZ_OPTS[0])
  const [tasks, setTasks] = useState<Task[]>(()=>{
    try{
      const raw = localStorage.getItem('schedule_tasks')
      if(raw){
        const parsed = JSON.parse(raw)
        if(Array.isArray(parsed)) return parsed as Task[]
      }
    }catch{}
    return []
  })
  const [calendarSegs, setCalendarSegs] = useState<CalendarSegment[]>(()=>{
    try{
      const raw = localStorage.getItem('schedule_calendarSegs')
      if(raw){
        const parsed = JSON.parse(raw)
        if(Array.isArray(parsed)) return parsed as CalendarSegment[]
      }
    }catch{}
    return []
  })
  const [loadedFromCloud,setLoadedFromCloud]=useState(false)

  const [canEdit, setCanEdit] = useState(false)
  const [editMode, setEditMode] = useState(false)

  useEffect(()=>{ (async()=>{
    const expected = await sha256Hex(import.meta.env.VITE_SCHEDULE_WRITE_PASSWORD || 'betacares')
    const saved = localStorage.getItem('schedule_pw_hash')
    setCanEdit(saved === expected)
  })() }, [view])

  useEffect(()=>{ (async()=>{ const data=await cloudGet(); if(data){ setShifts(data.shifts); setPto(data.pto); if(Array.isArray(data.calendarSegs)) setCalendarSegs(data.calendarSegs as any) } setLoadedFromCloud(true) })() },[])
  // Seed default postures if none exist on first mount
  useEffect(()=>{
    if(tasks.length===0){
      setTasks([
        { id: 'support', name: 'Support Inbox', color: '#2563eb' },
        { id: 'meetings', name: 'Meetings', color: '#16a34a' },
      ])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[])

  // Persist postures locally
  useEffect(()=>{
    try{ localStorage.setItem('schedule_tasks', JSON.stringify(tasks)) }catch{}
  },[tasks])
  // Persist posture assignments (calendar segments) locally
  useEffect(()=>{
    try{ localStorage.setItem('schedule_calendarSegs', JSON.stringify(calendarSegs)) }catch{}
  },[calendarSegs])
  // Auto-save local edits to the cloud only when editing is allowed
  useEffect(()=>{ if(!loadedFromCloud || !canEdit) return; const t=setTimeout(()=>{ cloudPost({shifts,pto,calendarSegs,updatedAt:new Date().toISOString()}) },600); return ()=>clearTimeout(t) },[shifts,pto,calendarSegs,loadedFromCloud,canEdit])

  // Auto-refresh schedule view every 5 minutes from the cloud (read-only)
  useEffect(()=>{
    if(view!== 'schedule') return
    const id = setInterval(async ()=>{
      const data = await cloudGet()
      if(data){
        // Only update if changed to avoid unnecessary state churn
        const sameShifts = JSON.stringify(data.shifts) === JSON.stringify(shifts)
        const samePto = JSON.stringify(data.pto) === JSON.stringify(pto)
        if(!sameShifts) setShifts(data.shifts)
        if(!samePto) setPto(data.pto)
      }
    }, 5 * 60 * 1000)
    return ()=>clearInterval(id)
  }, [view, shifts, pto])

  return (
    <div className={dark?"min-h-screen w-full bg-neutral-950 text-neutral-100":"min-h-screen w-full bg-neutral-100 text-neutral-900"}>
      <div className="max-w-full mx-auto p-2 md:p-4 space-y-4">
        <TopBar
          dark={dark} setDark={setDark}
          view={view} setView={setView}
          weekStart={weekStart} setWeekStart={setWeekStart}
          tz={tz} setTz={setTz}
          canEdit={canEdit}
          editMode={editMode}
          setEditMode={setEditMode}
        />

        {view==='schedule' ? (
          <SchedulePage
            dark={dark}
            weekStart={weekStart}
            dayIndex={dayIndex}
            setDayIndex={setDayIndex}
            shifts={shifts}
            pto={pto}
            tasks={tasks}
            calendarSegs={calendarSegs}
            tz={tz}
            canEdit={canEdit}
            editMode={editMode}
            onRemoveShift={(id)=> setShifts(prev=>prev.filter(s=>s.id!==id))}
          />
        ) : (
          <ManagePage dark={dark} weekStart={weekStart} shifts={shifts} setShifts={setShifts} pto={pto} setPto={setPto} tasks={tasks} setTasks={setTasks} calendarSegs={calendarSegs} setCalendarSegs={setCalendarSegs} tz={tz} />
        )}
      </div>
    </div>
  )
}
