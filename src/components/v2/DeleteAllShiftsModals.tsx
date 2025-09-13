import React from 'react'
import type { Shift } from '../../types'

export default function DeleteAllShiftsModals({
  dark,
  deleteAllStep,
  setDeleteAllStep,
  selectedName,
  agentShiftsLocal,
  captureUndo,
  onDeleteShift,
}:{
  dark: boolean
  deleteAllStep: 0|1|2
  setDeleteAllStep: (n:0|1|2)=>void
  selectedName: string
  agentShiftsLocal: Shift[]
  captureUndo: ()=>void
  onDeleteShift: (id: string)=>void
}){
  return (
    <>
      {deleteAllStep===1 && (
        <div role="dialog" aria-modal="true" className={["fixed inset-0 z-50 flex items-center justify-center", dark?"bg-black/70":"bg-black/50"].join(' ')}>
          <div className={["max-w-sm w-[92%] rounded-xl p-4 border", dark?"bg-neutral-900 border-neutral-700 text-neutral-100":"bg-white border-neutral-200 text-neutral-900"].join(' ')}>
            <div className="text-base font-semibold mb-2">Delete all shifts?</div>
            <div className="text-sm opacity-80 mb-4">This will remove all shifts for {selectedName}. This cannot be undone.</div>
            <div className="flex justify-end gap-2">
              <button onClick={()=>setDeleteAllStep(0)} className={["px-3 py-1.5 rounded-md text-sm border", dark?"border-neutral-700":"border-neutral-300"].join(' ')}>Cancel</button>
              <button onClick={()=>setDeleteAllStep(2)} className={["px-3 py-1.5 rounded-md text-sm border bg-red-600 text-white border-red-600"].join(' ')}>Continue</button>
            </div>
          </div>
        </div>
      )}
      {deleteAllStep===2 && (
        <div role="dialog" aria-modal="true" className={["fixed inset-0 z-50 flex items-center justify-center", dark?"bg-black/70":"bg-black/50"].join(' ')}>
          <div className={["max-w-sm w-[92%] rounded-xl p-4 border", dark?"bg-neutral-900 border-neutral-700 text-neutral-100":"bg-white border-neutral-200 text-neutral-900"].join(' ')}>
            <div className="text-base font-semibold mb-2">Confirm delete all</div>
            <div className="text-sm opacity-80 mb-4">Are you absolutely sure? This will permanently remove {agentShiftsLocal.length} shift(s) for {selectedName}.</div>
            <div className="flex justify-end gap-2">
              <button onClick={()=>setDeleteAllStep(0)} className={["px-3 py-1.5 rounded-md text-sm border", dark?"border-neutral-700":"border-neutral-300"].join(' ')}>Cancel</button>
              <button onClick={()=>{ captureUndo(); const ids=agentShiftsLocal.map(s=>s.id); ids.forEach(id=> onDeleteShift(id)); setDeleteAllStep(0) }} className={["px-3 py-1.5 rounded-md text-sm border bg-red-600 text-white border-red-600"].join(' ')}>Delete all</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

