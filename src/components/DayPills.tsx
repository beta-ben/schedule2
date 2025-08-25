import React from 'react'
import { DAYS } from '../constants'

export default function DayPills({ value, onChange, dark }:{ 
  value: Set<string>
  onChange: (s:Set<string>)=>void
  dark: boolean
}){
  function toggle(d: string){ const n=new Set(value); if(n.has(d)) n.delete(d); else n.add(d); onChange(n) }
  return (
    <div className="flex flex-wrap gap-2">
      {DAYS.map(d=>{
        const active = value.has(d)
        const base = 'px-3 py-1.5 rounded-full border text-sm leading-none'
        const activeCls = dark?'bg-neutral-800 border-neutral-600 text-white':'bg-blue-600 border-blue-600 text-white'
        const idleCls = dark?'border-neutral-700 text-neutral-200 hover:bg-neutral-900':'border-neutral-300 text-neutral-700 hover:bg-neutral-100'
        return (
          <button key={d} type="button" aria-pressed={active} onClick={()=>toggle(d)} className={[base, active?activeCls:idleCls].join(' ')}>{d}</button>
        )
      })}
    </div>
  )
}
