import React from 'react'
import type { StageDoc, StageKey, LiveDoc, StageStore } from '../domain/stage'
import { makeLocalStageStore } from '../lib/stage/localStageStore'
import { cloudGet } from '../lib/api'

type UseStageOpts = { weekStart: string; tzId: string; enabled?: boolean }

export function useStage(opts: UseStageOpts){
  const { weekStart, tzId, enabled } = opts
  const key = React.useMemo<StageKey>(()=> ({ weekStart, tzId }), [weekStart, tzId])
  const storeRef = React.useRef<StageStore | null>(null)
  if(storeRef.current == null){ storeRef.current = makeLocalStageStore() }
  const store = storeRef.current
  const [loading, setLoading] = React.useState(false)
  const [stage, setStage] = React.useState<StageDoc | null>(null)
  const [live, setLive] = React.useState<LiveDoc | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  const reload = React.useCallback(async()=>{
    if(!enabled) return
    setLoading(true); setError(null)
    try{
      const { stage, live } = await store.get(key)
      setStage(stage)
      setLive(live)
    }catch(e:any){ setError(e?.message || 'Failed to load stage') }
    setLoading(false)
  }, [store, key, enabled])

  React.useEffect(()=>{ reload() }, [reload])

  const save = React.useCallback(async(s: StageDoc)=>{
    const res = await store.save(s, s.updatedAt)
    if(res.ok){ setStage(prev=> prev ? { ...prev, updatedAt: res.updatedAt! } : prev) }
    return res
  }, [store])

  const reset = React.useCallback(async()=>{
    const liveNow = await cloudGet() as any
    const r = await store.reset(key, liveNow)
    if(r.ok){ setStage(r.stage); setLive(liveNow) }
    return r
  }, [store, key])

  const publish = React.useCallback(async (force?: boolean)=>{
    // Local adapter: leave to existing publish path in the page
    return { ok:true, conflict:false }
  }, [])

  return { loading, error, stage, live, reload, save, reset, publish }
}

export default useStage

