import React, { useMemo } from 'react'
import { DAYS } from '../constants'
import DayGrid from '../components/DayGrid'
import { addDays, fmtYMD, parseYMD, toMin } from '../lib/utils'
import type { PTO, Shift } from '../types'

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
  const currentDate = addDays(parseYMD(weekStart), dayIndex)
  const dayKey = DAYS[dayIndex]
  const dayShifts = useMemo(()=>shifts.filter(s=>s.day===dayKey).sort((a,b)=>toMin(a.start)-toMin(b.start)),[shifts,dayKey])
  const people = useMemo(()=>Array.from(new Set(dayShifts.map(s=>s.person))),[dayShifts])

  return (
    <section className={["rounded-2xl p-2", dark?"bg-neutral-900":"bg-white shadow-sm"].join(' ')}>
      <div className="flex flex-wrap gap-3 mb-3">
        {DAYS.map((d,i)=> (
          <button key={d} onClick={()=>setDayIndex(i)} className={["px-3 py-1.5 rounded-xl text-sm border", i===dayIndex ? (dark?"bg-neutral-800 border-neutral-600 text-white":"bg-blue-600 border-blue-600 text-white") : (dark?"border-neutral-700 text-neutral-200":"border-neutral-300 text-neutral-700 hover:bg-neutral-100")].join(' ')}>{d}</button>
        ))}
      </div>
      <DayGrid
        date={currentDate}
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
    </section>
  )
}
