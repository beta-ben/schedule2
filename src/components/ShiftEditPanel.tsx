import React from 'react'
import { DAYS } from '../constants'

export default function ShiftEditPanel({
  open,
  dark,
  person,
  day,
  endDay,
  start,
  end,
  onChangeDay,
  onChangeEndDay,
  onChangeStart,
  onChangeEnd,
  onApply,
  onCancel,
  onDelete,
}: {
  open: boolean
  dark: boolean
  person?: string
  day: typeof DAYS[number]
  endDay: typeof DAYS[number]
  start: string
  end: string
  onChangeDay: (d: typeof DAYS[number])=>void
  onChangeEndDay: (d: typeof DAYS[number])=>void
  onChangeStart: (t: string)=>void
  onChangeEnd: (t: string)=>void
  onApply: ()=>void
  onCancel: ()=>void
  onDelete?: ()=>void
}){
  React.useEffect(()=>{
    if(!open) return
    const onKey = (e: KeyboardEvent)=>{
      if(e.key === 'Escape'){ e.preventDefault(); onCancel() }
      if(e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); onApply() }
    }
    window.addEventListener('keydown', onKey)
    return ()=> window.removeEventListener('keydown', onKey)
  }, [open, onApply, onCancel])

  if(!open) return null

  return (
    <div
      className={["fixed inset-0 z-50 flex items-center justify-center p-3", dark?"bg-black/60":"bg-black/40"].join(' ')}
      role="dialog" aria-modal
      onMouseDown={(e)=>{ if(e.target === e.currentTarget) onCancel() }}
    >
      <div className={["w-full max-w-lg rounded-2xl border shadow-lg", dark?"bg-neutral-950 border-neutral-800 text-neutral-100":"bg-white border-neutral-200 text-neutral-800"].join(' ')}>
        <div className={["px-4 py-3 border-b", dark?"border-neutral-800":"border-neutral-200"].join(' ')}>
          <div className="text-sm font-semibold">Edit Shift{person? ` — ${person}`:''}</div>
        </div>
        <div className="px-4 py-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="text-sm flex flex-col">
              <span className="mb-1">Day</span>
              <select className={["w-full border rounded-xl px-3 py-2", dark&&"bg-neutral-900 border-neutral-700 text-neutral-100"].filter(Boolean).join(' ')} value={day} onChange={(e)=> onChangeDay(e.target.value as any)}>
                {DAYS.map(d=> <option key={d} value={d}>{d}</option>)}
              </select>
            </label>
            <label className="text-sm flex flex-col">
              <span className="mb-1">End Day</span>
              <select className={["w-full border rounded-xl px-3 py-2", dark&&"bg-neutral-900 border-neutral-700 text-neutral-100"].filter(Boolean).join(' ')} value={endDay} onChange={(e)=> onChangeEndDay(e.target.value as any)}>
                {DAYS.map(d=> <option key={d} value={d}>{d}</option>)}
              </select>
            </label>
            <label className="text-sm flex flex-col">
              <span className="mb-1">Start</span>
              <input type="time" className={["w-full border rounded-xl px-3 py-2 tabular-nums", dark&&"bg-neutral-900 border-neutral-700 text-neutral-100"].filter(Boolean).join(' ')} value={start} onChange={(e)=> onChangeStart(e.target.value)} />
            </label>
            <label className="text-sm flex flex-col">
              <span className="mb-1">End</span>
              <input type="time" className={["w-full border rounded-xl px-3 py-2 tabular-nums", dark&&"bg-neutral-900 border-neutral-700 text-neutral-100"].filter(Boolean).join(' ')} value={end} onChange={(e)=> onChangeEnd(e.target.value)} />
            </label>
          </div>
        </div>
        <div className={["px-4 py-3 flex items-center justify-between border-t gap-2", dark?"border-neutral-800":"border-neutral-200"].join(' ')}>
          <div className="flex items-center gap-2">
            {onDelete && (
              <button type="button" onClick={onDelete} className={["px-2.5 py-1.5 rounded-xl border text-sm font-medium", dark?"bg-neutral-900 border-neutral-700 hover:bg-neutral-800":"bg-white border-neutral-300 hover:bg-neutral-100"].join(' ')} title="Delete shift">
                Delete
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={onCancel} className={["px-3 py-1.5 rounded-xl border text-sm font-medium", dark?"bg-neutral-900 border-neutral-700 hover:bg-neutral-800":"bg-white border-neutral-300 hover:bg-neutral-100"].join(' ')}>
              Cancel
            </button>
            <button type="button" onClick={onApply} className={["px-3 py-1.5 rounded-xl border text-sm font-semibold", dark?"bg-blue-500/20 border-blue-400 text-blue-200 hover:bg-blue-500/30":"bg-blue-600 text-white border-blue-600 hover:bg-blue-700"].join(' ')}>
              Apply
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
