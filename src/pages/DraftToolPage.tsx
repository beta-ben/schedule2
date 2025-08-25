import React from 'react'
import { api } from '../state/apiClient'

function CoverageHeatmap({ versionId, dark }: { versionId: string; dark: boolean }) {
  const [coverage, setCoverage] = React.useState<{ binMinutes: number; bins: number[] } | null>(null)
  
  React.useEffect(() => {
    if (!versionId) return
    ;(async () => {
      try {
        const data = await api<{ binMinutes: number; bins: number[] }>(`/api/coverage/${versionId}`)
        setCoverage(data)
      } catch (err) {
        console.error('Failed to load coverage:', err)
      }
    })()
  }, [versionId])

  if (!coverage) return <div className="text-sm opacity-70">Loading coverage...</div>

  const maxCoverage = Math.max(...coverage.bins)
  const hours = Array.from({ length: 24 }, (_, i) => i)

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-12 gap-1 text-xs">
        {hours.filter((_, i) => i % 2 === 0).map(hour => (
          <div key={hour} className="text-center text-xs opacity-70">
            {hour === 0 ? '12a' : hour <= 12 ? `${hour}a` : `${hour - 12}p`}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-24 gap-px">
        {coverage.bins.map((count, i) => {
          const intensity = maxCoverage > 0 ? count / maxCoverage : 0
          const opacity = Math.max(0.1, intensity)
          return (
            <div
              key={i}
              className={`h-8 rounded-sm ${dark ? 'bg-blue-400' : 'bg-blue-600'}`}
              style={{ opacity }}
              title={`${Math.floor(i * coverage.binMinutes / 60)}:${String(i * coverage.binMinutes % 60).padStart(2, '0')} - ${count} agents`}
            />
          )
        })}
      </div>
      <div className="text-xs opacity-70 text-center">
        Each bar represents {coverage.binMinutes} minutes • Darker = more coverage
      </div>
    </div>
  )
}

export default function DraftToolPage({ dark }: { dark: boolean }){
  const [versions,setVersions]=React.useState<any[]>([])
  const [selected,setSelected]=React.useState<string>('')
  const [json,setJson]=React.useState<any>(null)
  
  React.useEffect(()=>{ 
    (async()=>{ 
      try {
        const v = await api<any[]>('/api/versions')
        setVersions(v)
        if(v[0]) setSelected(v[0].id)
      } catch (err) {
        console.error('Failed to load versions:', err)
      }
    })() 
  },[])
  
  React.useEffect(()=>{ 
    if(!selected) return
    ;(async()=>{ 
      try {
        const data = await api(`/api/versions/${selected}`)
        setJson(data)
      } catch (err) {
        console.error('Failed to load version:', err)
      }
    })() 
  },[selected])

  const handleExportCsv = async () => {
    if (!selected) return
    try {
      const response = await fetch(`${import.meta.env.VITE_API_BASE || ''}/api/versions/${selected}/export.csv`)
      if (!response.ok) throw new Error('Export failed')
      const csvData = await response.text()
      const blob = new Blob([csvData], { type: 'text/csv' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `schedule-${selected}.csv`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error('Export failed:', err)
      alert('Export failed. Please try again.')
    }
  }

  return (
    <section className={`rounded-2xl p-3 ${dark ? 'bg-neutral-900' : 'bg-white shadow-sm'}`}>
      <div className="flex items-center gap-2 mb-3">
        <select 
          className={`border rounded px-3 py-2 ${dark ? 'bg-neutral-800 border-neutral-700 text-white' : 'border-neutral-300'}`} 
          value={selected} 
          onChange={e=>setSelected(e.target.value)}
        >
          {versions.map(v=> <option key={v.id} value={v.id}>{v.week_start} · {v.status}</option>)}
        </select>
        <button 
          onClick={handleExportCsv}
          className={`px-3 py-2 rounded border ${dark ? 'border-neutral-600 text-white hover:bg-neutral-800' : 'border-neutral-300 hover:bg-neutral-100'}`}
        >
          Export CSV
        </button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className={`rounded-xl p-3 border ${dark ? 'border-neutral-700' : 'border-neutral-300'}`}>
          <h3 className="font-semibold mb-2">Shift Editor</h3>
          <pre className={`text-xs overflow-auto max-h-96 ${dark ? 'text-neutral-300' : 'text-neutral-700'}`}>
            {json ? JSON.stringify(json, null, 2) : 'Loading…'}
          </pre>
        </div>
        <div className={`rounded-xl p-3 border ${dark ? 'border-neutral-700' : 'border-neutral-300'}`}>
          <h3 className="font-semibold mb-2">Coverage Heatmap</h3>
          {selected ? (
            <CoverageHeatmap versionId={selected} dark={dark} />
          ) : (
            <div className="text-sm opacity-70">Select a version to view coverage</div>
          )}
        </div>
      </div>
    </section>
  )
}
