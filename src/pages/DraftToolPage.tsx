import React from 'react'
import { api } from '../state/apiClient'

export default function DraftToolPage(){
  const [versions,setVersions]=React.useState<any[]>([])
  const [selected,setSelected]=React.useState<string>('')
  const [json,setJson]=React.useState<any>(null)
  React.useEffect(()=>{ (async()=>{ const v=await api<any[]>('/api/versions'); setVersions(v); if(v[0]) setSelected(v[0].id) })() },[])
  React.useEffect(()=>{ if(!selected) return; (async()=>{ setJson(await api(`/api/versions/${selected}`)) })() },[selected])
  return (
    <section className="rounded-2xl p-3">
      <div className="flex items-center gap-2 mb-3">
        <select className="border rounded px-3 py-2" value={selected} onChange={e=>setSelected(e.target.value)}>
          {versions.map(v=> <option key={v.id} value={v.id}>{v.week_start} · {v.status}</option>)}
        </select>
        <button className="px-3 py-2 rounded border">Export CSV</button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="rounded-xl p-3 border">
          <h3 className="font-semibold mb-2">Shift Editor</h3>
          <pre className="text-xs overflow-auto">{json?JSON.stringify(json,null,2):'Loading…'}</pre>
        </div>
        <div className="rounded-xl p-3 border">
          <h3 className="font-semibold mb-2">Coverage Heatmap</h3>
          <div className="text-sm opacity-70">(stub)</div>
        </div>
      </div>
    </section>
  )
}
