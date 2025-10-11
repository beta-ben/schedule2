import { StageStore } from '../../domain/stage'
import { stageGet, stageSave, stageReset, stagePublish, stageSnapshot } from '../api'
import { makeLocalStageStore } from './localStageStore'

function toOptions(opts?: { ifMatch?: string } | string): { ifMatch?: string } | undefined{
  if(typeof opts === 'string') return { ifMatch: opts }
  return opts
}

export function makeApiStageStore(): StageStore{
  const localFallback = makeLocalStageStore()
  return {
    async get(key){
      const res = await stageGet(key)
      if(!res.ok && res.unsupported){
        return localFallback.get(key)
      }
      if(!res.ok){
        return { stage: null, live: null, unauthorized: res.unauthorized }
      }
      return { stage: res.stage ?? null, live: res.live ?? null }
    },
    async save(doc, opts){
      const options = toOptions(opts)
      const res = await stageSave(doc, options)
      if(!res.ok && res.unsupported){
        return localFallback.save(doc, options)
      }
      if(!res.ok){
        return { ok:false, conflict: !!res.conflict, status: res.status, unauthorized: res.unauthorized, error: res.error }
      }
      const updatedAt = res.stage?.updatedAt ?? res.updatedAt ?? doc.updatedAt
      const stage = res.stage ? res.stage : { ...doc, updatedAt }
      return { ok:true, updatedAt, stage, conflict:false }
    },
    async reset(key, live){
      const res = await stageReset(key, live)
      if((!res.ok || !res.stage) && res?.unsupported){
        return localFallback.reset(key, live)
      }
      if(!res.ok || !res.stage){
        if(res.unauthorized){
          return { ok:false, status: res.status, unauthorized: true }
        }
        // API failed but supported; fall back to local behavior to avoid leaving UI without data.
        return localFallback.reset(key, live)
      }
      return { ok:true, stage: res.stage }
    },
    async publish(doc, live, opts){
      const res = await stagePublish(doc, live, opts)
      if(!res.ok && res.unsupported){
        return localFallback.publish ? localFallback.publish(doc, live, opts) : { ok:true }
      }
      if(!res.ok){
        return { ok:false, conflict: !!res.conflict, status: res.status, unauthorized: res.unauthorized, error: res.error }
      }
      return { ok:true, conflict:false }
    },
    async snapshot(doc, title){
      const res = await stageSnapshot(doc, title)
      if(!res.ok && res.unsupported){
        return localFallback.snapshot ? localFallback.snapshot(doc, title) : { ok:false }
      }
      if(!res.ok){
        return { ok:false, status: res.status, unauthorized: res.unauthorized, error: res.error }
      }
      return { ok:true, id: res.id }
    },
  }
}
