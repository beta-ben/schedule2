import React from 'react'
import ManageEditor from './ManageEditor'
import { parseYMD, sha256Hex } from '../lib/utils'
import type { PTO, Shift } from '../types'

export default function ManagePage({ dark, weekStart, shifts, setShifts, pto, setPto, tz }:{ 
  dark: boolean
  weekStart: string
  shifts: Shift[]
  setShifts: (f:(prev:Shift[])=>Shift[])=>void
  pto: PTO[]
  setPto: (f:(prev:PTO[])=>PTO[])=>void
  tz: { id:string; label:string; offset:number }
}){
  const [unlocked, setUnlocked] = React.useState(false)
  const [pwInput, setPwInput] = React.useState('')
  const [msg, setMsg] = React.useState('')
  const weekStartDate = parseYMD(weekStart)

  React.useEffect(()=> { (async () => {
    const expected = await sha256Hex(import.meta.env.VITE_SCHEDULE_WRITE_PASSWORD || 'betacares')
    try {
      const saved = localStorage.getItem('schedule_pw_hash')
      if (saved === expected) setUnlocked(true)
    } catch {}
  })() }, [])

  if (!unlocked) {
    return (
      <section className={["rounded-2xl p-6", dark ? "bg-neutral-900" : "bg-white shadow-sm"].join(' ')}>
        <div className="max-w-md mx-auto space-y-3">
          <div className="text-lg font-semibold">Protected — Manage Data</div>
          <p className="text-sm opacity-80">Enter password to continue.</p>
          <form onSubmit={(e)=>{ e.preventDefault(); (async()=>{
            const expected = await sha256Hex(import.meta.env.VITE_SCHEDULE_WRITE_PASSWORD || 'betacares')
            const entered  = await sha256Hex(pwInput || '')
            if (pwInput === (import.meta.env.VITE_SCHEDULE_WRITE_PASSWORD || 'betacares') || entered === expected) {
              try { localStorage.setItem('schedule_pw_hash', expected) } catch {}
              setUnlocked(true); setMsg('')
            } else { setMsg('Wrong password.') }
          })() }}>
            <div className="flex gap-2">
              <input type="password" autoFocus className={["flex-1 border rounded-xl px-3 py-2", dark && "bg-neutral-900 border-neutral-700"].filter(Boolean).join(' ')} value={pwInput} onChange={(e)=>setPwInput(e.target.value)} placeholder="Password" />
              <button type="submit" className={["rounded-xl px-4 py-2 font-medium border", dark ? "bg-neutral-800 border-neutral-700" : "bg-blue-600 text-white border-blue-600"].join(' ')}>Unlock</button>
            </div>
          </form>
          {msg && (<div className={["text-sm", dark ? "text-red-300" : "text-red-600"].join(' ')}>{msg}</div>)}
        </div>
      </section>
    )
  }

  return (
    <ManageEditor
      dark={dark}
      weekStartDate={weekStartDate}
      shifts={shifts}
      setShifts={setShifts}
      pto={pto}
      setPto={setPto}
      tz={tz}
    />
  )
}
