import React, { useMemo } from 'react'
import { DAYS } from '../constants'
import DayGrid from '../components/DayGrid'
import { addDays, fmtYMD, parseYMD, toMin, nowInTZ, shiftsForDayInTZ } from '../lib/utils'
import type { PTO, Shift } from '../types'
import OnDeck from '../components/OnDeck'
import UpNext from '../components/UpNext'

export default function SchedulePage({ dark, weekStart, dayIndex, setDayIndex, shifts, pto, tz, canEdit, editMode, onRemoveShift }:{ 
  dark: boolean
  weekStart: string
  dayIndex: number
  setDayIndex: (i:number)=>void
  shifts: Shift[]
  pto: PTO[]
  tz: { id:string; label:string; offset:number }
  canEdit: boolean
  editMode: boolean
  onRemoveShift: (id:string)=>void
}){
  const today = new Date()
  const weekStartDate = parseYMD(weekStart)
  const selectedDate = addDays(weekStartDate, dayIndex)
  const dayKey = DAYS[dayIndex]
  const dayShifts = useMemo(()=>
    shiftsForDayInTZ(shifts, dayKey as any, tz.offset)
      .sort((a,b)=>toMin(a.start)-toMin(b.start))
  ,[shifts,dayKey,tz.offset])
  const people = useMemo(()=>Array.from(new Set(dayShifts.map(s=>s.person))),[dayShifts])

  // Panels tied to "now": always use today's shifts regardless of selected tab
  const nowTz = nowInTZ(tz.id)
  const todayKey = nowTz.weekdayShort as (typeof DAYS)[number]
  const todayShifts = useMemo(()=>
    shiftsForDayInTZ(shifts, todayKey as any, tz.offset)
      .sort((a,b)=>toMin(a.start)-toMin(b.start))
  ,[shifts,todayKey,tz.offset])

  return (
    <section className={["rounded-2xl p-2", dark?"bg-neutral-900":"bg-white shadow-sm"].join(' ')}>
      <div className="flex flex-wrap gap-3 mb-3">
        {DAYS.map((d,i)=> (
          <button key={d} onClick={()=>setDayIndex(i)} className={["px-3 py-1.5 rounded-xl text-sm border", i===dayIndex ? (dark?"bg-neutral-800 border-neutral-600 text-white":"bg-blue-600 border-blue-600 text-white") : (dark?"border-neutral-700 text-neutral-200":"border-neutral-300 text-neutral-700 hover:bg-neutral-100")].join(' ')}>{d}</button>
        ))}
      </div>
      <DayGrid
        date={selectedDate}
        dayKey={dayKey}
        people={people}
        shifts={dayShifts}
        pto={pto}
        dark={dark}
        tz={tz}
        canEdit={canEdit}
        editMode={editMode}
        onRemove={(id)=>{
          if (!canEdit) { alert('Enter the password in Manage to enable editing.'); return }
          onRemoveShift(id)
        }}
      />

      {/* Below main section: two-column area for extra features */}
      <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
  <OnDeck dark={dark} tz={tz} dayKey={todayKey} shifts={todayShifts} />
  <UpNext dark={dark} tz={tz} dayKey={todayKey} shifts={todayShifts} />
      </div>
    </section>
  )
}
