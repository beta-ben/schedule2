import React from 'react'
import Toggle from '../Toggle'
import { TZ_OPTS } from '../../constants'
import type { MeetingCohort } from '../../types'

export default function AgentDetailsPanel({
  dark,
  selectedName,
  firstName,
  lastName,
  tzId,
  isSupervisor,
  supervisorId,
  hidden,
  meetingCohort,
  notes,
  agents,
  meetingOptions,
  selectedIdx,
  onFirst,
  onLast,
  onTz,
  onIsSup,
  onSupId,
  onHidden,
  onMeeting,
  onNotes,
  onSave,
  onDelete,
}:{
  dark: boolean
  selectedName: string
  firstName: string
  lastName: string
  tzId: string
  isSupervisor: boolean
  supervisorId: string
  hidden: boolean
  meetingCohort: MeetingCohort | ''
  notes: string
  agents: Array<{ id?: string; firstName?: string; lastName?: string; isSupervisor?: boolean }>
  meetingOptions: readonly MeetingCohort[]
  selectedIdx: number | null
  onFirst: (v:string)=>void
  onLast: (v:string)=>void
  onTz: (v:string)=>void
  onIsSup: (v:boolean)=>void
  onSupId: (v:string)=>void
  onHidden: (v:boolean)=>void
  onMeeting: (v: MeetingCohort | '')=>void
  onNotes: (v:string)=>void
  onSave: ()=>void
  onDelete: ()=>void
}){
  const tzFullName = (id?: string)=>{
    switch(id){
      case 'America/Los_Angeles': return 'Pacific'
      case 'America/Denver': return 'Mountain'
      case 'America/Chicago': return 'Central'
      case 'America/New_York': return 'Eastern'
      default: return id || '—'
    }
  }
  return (
    <div className={["rounded-md p-3 mb-3 border", dark?"border-neutral-800":"border-neutral-200"].join(' ')}>
      <div className={["text-2xl font-semibold mb-2", hidden ? (dark?"text-neutral-400":"text-neutral-500") : (dark?"text-neutral-100":"text-neutral-900")].join(' ')}>
        {selectedName || 'Select an agent'}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* Left: controls (single column) */}
        <div className="grid grid-cols-1 gap-2">
          <label className="text-sm flex flex-col">
            <span className="opacity-70 mb-1">First name</span>
            <input className={["border rounded px-2 py-1 text-sm", dark?"bg-neutral-900 border-neutral-700":"bg-white border-neutral-300"].join(' ')} value={firstName} onChange={e=>onFirst(e.target.value)} />
          </label>
          <label className="text-sm flex flex-col">
            <span className="opacity-70 mb-1">Last name</span>
            <input className={["border rounded px-2 py-1 text-sm", dark?"bg-neutral-900 border-neutral-700":"bg-white border-neutral-300"].join(' ')} value={lastName} onChange={e=>onLast(e.target.value)} />
          </label>
          <label className="text-sm flex flex-col">
            <span className="opacity-70 mb-1">Timezone</span>
            <select className={["border rounded px-2 py-1 text-sm", dark?"bg-neutral-900 border-neutral-700":"bg-white border-neutral-300"].join(' ')} value={tzId} onChange={e=>onTz(e.target.value)}>
              {TZ_OPTS.map(o=> <option key={o.id} value={o.id}>{tzFullName(o.id)}</option>)}
            </select>
          </label>
          <label className="text-sm flex flex-col">
            <span className="opacity-70 mb-1">Weekly meeting</span>
            <select
              className={["border rounded px-2 py-1 text-sm", dark?"bg-neutral-900 border-neutral-700":"bg-white border-neutral-300"].join(' ')}
              value={meetingCohort || ''}
              onChange={(e)=> onMeeting(e.target.value as MeetingCohort | '')}
            >
              <option value="">—</option>
              {meetingOptions.map(opt=> (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
          </label>
          <label className="text-sm flex flex-col">
            <span className="opacity-70 mb-1">Reports to</span>
            <select className={["border rounded px-2 py-1 text-sm", dark?"bg-neutral-900 border-neutral-700":"bg-white border-neutral-300"].join(' ')} value={supervisorId} onChange={e=>onSupId(e.target.value)}>
              <option value="">—</option>
              {agents.filter((x,idx)=> !!x.isSupervisor && idx!==selectedIdx).map((x)=>{
                const nm = `${x.firstName||''} ${x.lastName||''}`.trim()
                const id = (x as any).id || nm
                return <option key={id} value={id as any}>{nm||id}</option>
              })}
            </select>
          </label>
          <div className="flex items-center gap-6">
            <label className="inline-flex items-center gap-2 text-sm">
              <Toggle ariaLabel="Supervisor" dark={dark} size="md" checked={isSupervisor} onChange={(v)=>onIsSup(v)} />
              <span>Supervisor</span>
            </label>
            <label className="inline-flex items-center gap-2 text-sm">
              <Toggle ariaLabel="Hidden" dark={dark} size="md" checked={hidden} onChange={(v)=>onHidden(v)} />
              <span>Hidden</span>
            </label>
          </div>
        </div>
        {/* Right: notes (50%) */}
        <label className="text-sm flex flex-col">
          <span className="opacity-70 mb-1">Notes</span>
          <textarea rows={10} className={["border rounded px-2 py-1 text-sm h-full", dark?"bg-neutral-900 border-neutral-700":"bg-white border-neutral-300"].join(' ')} value={notes} onChange={e=>onNotes(e.target.value)} />
        </label>
      </div>
      <div className="mt-2 flex gap-2">
        <button onClick={onSave} className={["px-3 py-1.5 rounded border text-sm font-medium", dark?"bg-neutral-900 border-neutral-700":"bg-blue-600 border-blue-600 text-white"].join(' ')}>Save</button>
        <button onClick={onDelete} className={["px-3 py-1.5 rounded border text-sm", dark?"border-neutral-700 text-red-300":"border-neutral-300 text-red-600"].join(' ')}>Delete</button>
      </div>
    </div>
  )
}
