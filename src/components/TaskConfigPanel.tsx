import React from 'react'
import type { Task } from '../types'

export default function TaskConfigPanel({ tasks, onCreate, onUpdate, onArchive, onDelete, dark, selectedId, onSelect }:{
  tasks: Task[]
  onCreate: (t: Omit<Task,'id'>)=>void
  onUpdate: (t: Task)=>void
  onArchive: (id: string)=>void
  onDelete?: (id: string)=>void
  dark: boolean
  selectedId?: string
  onSelect?: (id: string)=>void
}){
  const [draft, setDraft] = React.useState<Omit<Task,'id'>>({ name:'', color:'#2563eb' })
  const active = React.useMemo(()=> tasks.filter(t=>!t.archived), [tasks])
  // Archived section removed per requirements

  // Inline editing for existing rows
  const [editingId, setEditingId] = React.useState<string|null>(null)
  const [eName, setEName] = React.useState('')
  const [eColor, setEColor] = React.useState('#2563eb')

  function beginEdit(t: Task){
    setEditingId(t.id)
    setEName(t.name)
    setEColor(t.color)
  }
  function cancelEdit(){
    setEditingId(null)
  }
  function saveEdit(id: string){
    if(!eName.trim()) return
    onUpdate({ id, name: eName.trim(), color: eColor })
    setEditingId(null)
  }

  return (
    <section className={["rounded-xl p-3", dark?"bg-neutral-950":"bg-neutral-50"].join(' ')}>
  <div className={["border rounded-xl overflow-auto", dark?"border-neutral-800":"border-neutral-300"].join(' ')}>
        <table className="min-w-full text-sm">
          <thead className={dark?"bg-neutral-900":"bg-white"}>
            <tr>
              <th className="px-3 py-2 text-left">Name</th>
              <th className="px-3 py-2 text-left">Color</th>
              <th className="px-3 py-2 text-left w-36">Actions</th>
            </tr>
          </thead>
          <tbody className={dark?"divide-y divide-neutral-800":"divide-y divide-neutral-200"}>
            {active.length===0 ? (
              <tr><td colSpan={3} className="px-3 py-6 text-center opacity-70">No postures configured.</td></tr>
            ) : active.map(t=> (
              <tr
                key={t.id}
                onClick={()=> onSelect?.(t.id)}
                className={[
                  dark?"hover:bg-neutral-900 cursor-pointer":"hover:bg-neutral-50 cursor-pointer",
                  selectedId===t.id ? (dark?"bg-neutral-900 ring-1 ring-blue-500/40":"bg-blue-50 ring-1 ring-blue-500/40") : ''
                ].join(' ')}
              >
                {editingId===t.id ? (
                  <>
                    <td className="px-3 py-1.5">
                      <input className={["w-full border rounded px-2 py-1", dark&&"bg-neutral-900 border-neutral-700"].filter(Boolean).join(' ')} value={eName} onChange={e=>setEName(e.target.value)} />
                    </td>
                    <td className="px-3 py-1.5">
                      <input type="color" className={["w-10 h-8 border rounded", dark&&"bg-neutral-900 border-neutral-700"].filter(Boolean).join(' ')} value={eColor} onChange={e=>setEColor(e.target.value)} />
                    </td>
                    <td className="px-3 py-1.5">
                      <div className="flex gap-2">
                        <button onClick={()=>saveEdit(t.id)} className={["px-2 py-1 rounded border text-xs", dark?"bg-neutral-800 border-neutral-700":"bg-blue-600 border-blue-600 text-white"].join(' ')}>Save</button>
                        <button onClick={cancelEdit} className={["px-2 py-1 rounded border text-xs", dark?"border-neutral-700":"border-neutral-300"].join(' ')}>Cancel</button>
                      </div>
                    </td>
                  </>
                ) : (
                  <>
                    <td className="px-3 py-1.5 font-medium">{t.name}</td>
                    <td className="px-3 py-1.5"><span className="inline-block w-5 h-5 rounded border align-middle" style={{ background:t.color }} /></td>
                    <td className="px-3 py-1.5">
                      <div className="flex gap-2" onClick={(e)=> e.stopPropagation()}>
                        <button onClick={()=>beginEdit(t)} className={["px-2 py-1 rounded border text-xs", dark?"border-neutral-700":"border-neutral-300"].join(' ')}>Edit</button>
                        <button onClick={()=>onUpdate({ ...t, archived:true })} className={["px-2 py-1 rounded border text-xs", dark?"border-neutral-700":"border-neutral-300"].join(' ')}>Remove</button>
                        <button onClick={()=>{ if(onDelete){ if(confirm(`Delete posture "${t.name}"? This cannot be undone.`)) onDelete(t.id) } }} className={["px-2 py-1 rounded border text-xs", "bg-red-600 border-red-600 text-white"].join(' ')}>Delete</button>
                      </div>
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Add posture moved to bottom */}
      <form
        className="mt-4 grid grid-cols-1 md:grid-cols-6 gap-3 items-end"
        onSubmit={(e)=>{ e.preventDefault(); const name = draft.name.trim(); if(!name) return; onCreate({ ...draft, name }); setDraft({ name:'', color:'#2563eb' }) }}
      >
        <label className="text-sm flex flex-col md:col-span-3">
          <span className="mb-1">Name</span>
          <input
            className={["w-full border rounded-xl px-3 py-2", dark&&"bg-neutral-900 border-neutral-700"].filter(Boolean).join(' ')}
            value={draft.name}
            onChange={e=>setDraft({...draft, name:e.target.value})}
            placeholder="e.g., Support Inbox"
          />
        </label>
        <label className="text-sm flex flex-col md:col-span-1">
          <span className="mb-1">Color</span>
          <input
            type="color"
            className={["w-full border rounded-xl h-10", dark&&"bg-neutral-900 border-neutral-700"].filter(Boolean).join(' ')}
            value={draft.color}
            onChange={e=>setDraft({...draft, color:e.target.value})}
            aria-label="Posture color"
          />
        </label>
        <div className="md:col-span-2">
          <button
            type="submit"
            disabled={!draft.name.trim()}
            className={[
              "h-10 rounded-xl border font-medium px-4 w-full md:w-auto",
              draft.name.trim()
                ? (dark?"bg-neutral-800 border-neutral-700 hover:bg-neutral-700":"bg-blue-600 border-blue-600 text-white hover:bg-blue-500")
                : (dark?"bg-neutral-900 border-neutral-800 opacity-60":"bg-neutral-200 border-neutral-300 text-neutral-500 cursor-not-allowed")
            ].join(' ')}
          >Add Posture</button>
        </div>
      </form>

  {/* Archived postures section intentionally removed */}
    </section>
  )
}
