import { useCallback, useEffect, useRef, useState } from 'react'
import { cloudGet } from '../lib/api'
import type { Shift, PTO } from '../types'
import type { CalendarSegment } from '../lib/utils'

export type LiveDoc = { shifts: Shift[]; pto: PTO[]; calendarSegs: CalendarSegment[]; agents?: any[] }

export function useScheduleLive(opts: { enabled?: boolean; sse?: boolean; intervalMs?: number } = {}){
  const { enabled = true, sse = true, intervalMs = 5 * 60 * 1000 } = opts
  const [doc, setDoc] = useState<LiveDoc | null>(null)
  const [loading, setLoading] = useState(true)
  const lastRef = useRef<{shifts:string;pto:string;cal:string;agents:string}>({shifts:'',pto:'',cal:'',agents:''})
  const pull = useCallback(async ()=>{
    if(!enabled) return
    try{
      const data = await cloudGet()
      if(!data) return
      const s = JSON.stringify(data.shifts||[])
      const p = JSON.stringify(data.pto||[])
      const c = JSON.stringify(Array.isArray(data.calendarSegs)? data.calendarSegs : [])
      const a = JSON.stringify(Array.isArray((data as any).agents)? (data as any).agents : [])
      if(s!==lastRef.current.shifts || p!==lastRef.current.pto || c!==lastRef.current.cal || a!==lastRef.current.agents){
        lastRef.current = { shifts:s, pto:p, cal:c, agents:a }
        setDoc({ shifts: data.shifts, pto: data.pto, calendarSegs: (data.calendarSegs as any)||[], agents: (data as any).agents })
      }
    }finally{ setLoading(false) }
  },[enabled])
  useEffect(()=>{ pull(); }, [pull])
  useEffect(()=>{
    if(!enabled) return
    const id = setInterval(pull, intervalMs)
    let es: EventSource | null = null
    if(sse){
      try{ es = new EventSource(`/api/events`, { withCredentials: true } as any); es.addEventListener('updated', ()=> pull()) }catch{}
    }
    return ()=>{ clearInterval(id); try{ es?.close() }catch{} }
  }, [enabled, pull, intervalMs, sse])
  return { doc, loading, refresh: pull }
}
