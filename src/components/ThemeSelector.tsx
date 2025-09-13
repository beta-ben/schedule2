import React from 'react'

type ThemePreset = { id: string; label: string; chips: string[] }

const PRESETS: ThemePreset[] = [
  { id: 'system', label: 'System', chips: [] },
  { id: 'default-light', label: 'Default Light', chips: ['#ffffff','#111827'] },
  { id: 'default-dark', label: 'Default Dark', chips: ['#0a0a0a','#e5e7eb'] },
  { id: 'night-light', label: 'Night Light', chips: ['#ffffff','#ef4444'] },
  { id: 'night-dark', label: 'Night Dark', chips: ['#000000','#ef4444'] },
  { id: 'noir-light', label: 'Noir Light', chips: ['#ffffff','#000000'] },
  { id: 'noir-dark', label: 'Noir Dark', chips: ['#000000','#ffffff'] },
  { id: 'prism-light', label: 'Prism Light', chips: ['#f0f9ff','#0ea5e9'] },
  { id: 'prism-dark', label: 'Prism Dark', chips: ['#0f172a','#a3a3a3'] },
]

export default function ThemeSelector({ dark }:{ dark:boolean }){
  const [open,setOpen] = React.useState(false)
  const current = React.useMemo(()=>{
    try{ return localStorage.getItem('schedule_theme') || 'system' }catch{ return 'system' }
  },[])
  const apply = (id:string)=>{
    try{ window.dispatchEvent(new CustomEvent('schedule:set-theme', { detail: { value: id } })) }catch{}
    setOpen(false)
  }
  return (
    <div className="relative">
      <button
        onClick={()=> setOpen(v=>!v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className={["h-10 px-3 rounded-lg border text-sm font-medium inline-flex items-center gap-2", dark?"bg-neutral-900 border-neutral-700 text-neutral-200":"bg-white border-neutral-300 text-neutral-800"].join(' ')}
        title="Choose theme"
        aria-label="Choose theme"
      >
        {/* Sun icon */}
        <svg aria-hidden className={dark?"text-neutral-300":"text-neutral-700"} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="4"/>
          <path d="M12 2v2"/>
          <path d="M12 20v2"/>
          <path d="m4.93 4.93 1.41 1.41"/>
          <path d="m17.66 17.66 1.41 1.41"/>
          <path d="M2 12h2"/>
          <path d="M20 12h2"/>
          <path d="m4.93 19.07 1.41-1.41"/>
          <path d="m17.66 6.34 1.41-1.41"/>
        </svg>
        <span className="sr-only">Theme</span>
      </button>
      {open && (
        <div className={["absolute right-0 mt-2 z-50 w-[320px] rounded-xl p-2 border shadow-lg", dark?"bg-neutral-900 border-neutral-700":"bg-white border-neutral-200"].join(' ')} role="menu">
          <div className="grid grid-cols-2 gap-2">
            {PRESETS.map(p=> (
              <button
                key={p.id}
                onClick={()=>apply(p.id)}
                className={[
                  "flex items-center gap-2 p-2 rounded-lg border text-left",
                  (dark?"hover:bg-neutral-800 border-neutral-700":"hover:bg-neutral-100 border-neutral-300"),
                  (current===p.id? (dark?"ring-1 ring-blue-500":"ring-1 ring-blue-500") : ''),
                  (p.id==='system' ? 'col-span-2' : '')
                ].join(' ')}
              >
                <div className="flex -space-x-1">
                  {p.chips.map((c,i)=> (
                    <span key={i} className="inline-block w-5 h-5 rounded-full border border-black/10" style={{ background: c }} />
                  ))}
                </div>
                <span className="text-sm">{p.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
