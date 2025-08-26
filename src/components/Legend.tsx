import React from 'react'
import type { Task } from '../types'

export default function Legend({ tasks, dark }:{ tasks: Task[]; dark: boolean }){
  const visible = tasks.filter(t=>!t.archived)
  if(visible.length===0) return null
  return (
    <div className={["rounded-lg px-2 py-1.5", dark?"bg-neutral-950":"bg-neutral-50"].join(' ')}>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className={["font-medium mr-1", dark?"text-neutral-300":"text-neutral-700"].join(' ')}>Legend:</span>
        {visible.map(t=> (
          <div key={t.id} className={["flex items-center gap-1.5 px-2 py-0.5 rounded-md border", dark?"border-neutral-800 bg-neutral-900":"border-neutral-200 bg-white"].join(' ')} title={t.name}>
            <span className="inline-block w-3 h-3 rounded-sm border" style={{ background: t.color, borderColor: dark ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.25)' }} />
            <span className={dark? 'text-neutral-200' : 'text-neutral-700'}>{t.name}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
