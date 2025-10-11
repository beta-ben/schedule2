import React from 'react'
import type { StageDoc, StageKey, LiveDoc, StageStore } from '../domain/stage'
import { makeApiStageStore } from '../lib/stage/apiStageStore'
import { cloudGet } from '../lib/api'
import { stageDebugLog } from '../lib/stage/debug'

type UseStageOpts = { weekStart: string; tzId: string; enabled?: boolean }

function summarize(doc: StageDoc | LiveDoc | null | undefined){
  if(!doc) return null
  const record = doc as Record<string, unknown>
  const lengthOf = (value: unknown)=> Array.isArray(value) ? value.length : 0
  return {
    updatedAt: typeof record.updatedAt === 'string' ? record.updatedAt : null,
    shifts: lengthOf(record.shifts),
    pto: lengthOf(record.pto),
    overrides: lengthOf(record.overrides),
    calendarSegs: lengthOf(record.calendarSegs),
    agents: lengthOf(record.agents),
  }
}

export function useStage(opts: UseStageOpts){
  const { weekStart, tzId, enabled } = opts
  const key = React.useMemo<StageKey>(()=> ({ weekStart, tzId }), [weekStart, tzId])
  const storeRef = React.useRef<StageStore | null>(null)
  if(storeRef.current == null){ storeRef.current = makeApiStageStore() }
  const store = storeRef.current
  const [loading, setLoading] = React.useState(false)
  const [stage, setStage] = React.useState<StageDoc | null>(null)
  const [live, setLive] = React.useState<LiveDoc | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const lastServerUpdatedAtRef = React.useRef<string | null>(null)
  const suppressNextReloadRef = React.useRef(false)

  const reload = React.useCallback(async()=>{
    if(!enabled){
      stageDebugLog('hook:reload:skip_disabled', { key })
      return
    }
    if(suppressNextReloadRef.current){
      suppressNextReloadRef.current = false
      stageDebugLog('hook:reload:suppressed', { key })
      return
    }
    stageDebugLog('hook:reload:start', { key })
    setLoading(true); setError(null)
    try{
      const started = new Date().toISOString()
      const { stage, live, unauthorized } = await store.get(key)
      console.debug('[stage] get:summary', {
        when: started,
        key,
        stageUpdatedAt: stage?.updatedAt ?? null,
        stageBaseLive: stage?.baseLiveUpdatedAt ?? null,
        stageCounts: stage ? {
          shifts: Array.isArray(stage.shifts) ? stage.shifts.length : 0,
          pto: Array.isArray(stage.pto) ? stage.pto.length : 0,
          overrides: Array.isArray(stage.overrides) ? stage.overrides.length : 0,
          calendarSegs: Array.isArray(stage.calendarSegs) ? stage.calendarSegs.length : 0,
          agents: Array.isArray(stage.agents) ? stage.agents.length : 0
        } : null,
        liveUpdatedAt: live?.updatedAt ?? null,
        unauthorized
      })
      stageDebugLog('hook:reload:result', {
        started,
        key,
        unauthorized: !!unauthorized,
        stage: summarize(stage),
        live: summarize(live)
      })
      if(unauthorized){
        stageDebugLog('hook:reload:unauthorized', { key })
        setStage(null)
        setLive(null)
        setError('unauthorized')
        return
      }
      if(stage && lastServerUpdatedAtRef.current){
        const incomingTs = Date.parse(stage.updatedAt || '')
        const prevTs = Date.parse(lastServerUpdatedAtRef.current)
        if(Number.isFinite(incomingTs) && Number.isFinite(prevTs) && incomingTs < prevTs){
          console.debug('[stage] get:skip-stale', { when: started, incoming: stage.updatedAt, prev: lastServerUpdatedAtRef.current })
          stageDebugLog('hook:reload:skip_stale', { incoming: stage.updatedAt ?? null, previous: lastServerUpdatedAtRef.current })
          return
        }
      }
      if(stage && stage.updatedAt){
        lastServerUpdatedAtRef.current = stage.updatedAt
      }
      setStage(stage ?? null)
      setLive(live ?? null)
    }catch(e:any){
      stageDebugLog('hook:reload:error', { message: e?.message || String(e) }, 'error')
      setError(e?.message || 'Failed to load stage')
    }finally{
      setLoading(false)
    }
  }, [store, key, enabled])

  React.useEffect(()=>{ reload() }, [reload])

  const save = React.useCallback(async(s: StageDoc, opts?: { ifMatch?: string })=>{
    stageDebugLog('hook:save:start', {
      key: { weekStart: s.weekStart, tzId: s.tzId },
      ifMatch: opts?.ifMatch ?? null,
      counts: summarize(s)
    })
    const res = await store.save(s, opts)
    stageDebugLog('hook:save:result', {
      ok: res.ok,
      updatedAt: res.updatedAt ?? null,
      conflict: !!res.conflict,
      unauthorized: !!res.unauthorized,
      status: res.status ?? null,
      counts: summarize(res.stage)
    })
    if(res.ok){
      setStage(prev=>{
        if(res.stage){
          if(prev && prev.updatedAt === res.stage.updatedAt){
            return prev
          }
          return res.stage
        }
        if(prev && res.updatedAt) return { ...prev, updatedAt: res.updatedAt }
        return prev
      })
      if(res.stage?.updatedAt){
        lastServerUpdatedAtRef.current = res.stage.updatedAt
      }else if(res.updatedAt){
        lastServerUpdatedAtRef.current = res.updatedAt
      }else if(s.updatedAt){
        lastServerUpdatedAtRef.current = s.updatedAt
      }
      suppressNextReloadRef.current = true
    }else if(res?.unauthorized){
      stageDebugLog('hook:save:unauthorized', { key: { weekStart: s.weekStart, tzId: s.tzId } })
      setStage(null)
      setLive(null)
      setError('unauthorized')
    }else if(res?.ok === false){
      stageDebugLog('hook:save:failure', {
        status: res.status ?? null,
        conflict: !!res.conflict,
        error: res.error ?? null
      }, 'warn')
    }
    return res
  }, [store])

  const reset = React.useCallback(async()=>{
    stageDebugLog('hook:reset:start', { key })
    const liveNow = await cloudGet() as any
    stageDebugLog('hook:reset:live_snapshot', { live: summarize(liveNow) })
    const r = await store.reset(key, liveNow)
    stageDebugLog('hook:reset:result', {
      ok: r.ok,
      status: r.status ?? null,
      unauthorized: !!r.unauthorized,
      stage: summarize(r.stage)
    })
    if(r.ok && r.stage){ setStage(r.stage); setLive(liveNow) }
    else if(r?.unauthorized){
      stageDebugLog('hook:reset:unauthorized', { key })
      setStage(null)
      setLive(null)
      setError('unauthorized')
    }else if(!r.ok){
      stageDebugLog('hook:reset:failure', {
        status: r.status ?? null,
        error: r.error ?? null
      }, 'warn')
    }
    return r
  }, [store, key])

  const publish = React.useCallback(async (force?: boolean)=>{
    stageDebugLog('hook:publish:invoke', { force: !!force })
    // Local adapter: leave to existing publish path in the page
    return { ok:true, conflict:false }
  }, [])

  return { loading, error, stage, live, reload, save, reset, publish }
}

export default useStage
