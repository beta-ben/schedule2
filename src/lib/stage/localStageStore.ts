import { StageStore, StageDoc, StageKey, LiveDoc } from '../../domain/stage'
import { cloudGet } from '../api'

function keyFor(k: StageKey){ return `schedule2.stage.${k.weekStart}.${k.tzId}` }

function nowIso(){ return new Date().toISOString() }

export function makeLocalStageStore(): StageStore{
  return {
    async get(key){
      const k = keyFor(key)
      let stage: StageDoc | null = null
      try{
        const raw = localStorage.getItem(k)
        if(raw){ stage = JSON.parse(raw) as StageDoc }
      }catch{}
      let live: LiveDoc | null = null
      try{ live = await cloudGet() as any }catch{}
      if(!stage && live){
        // Initialize stage from live
        const doc: StageDoc = {
          ...key,
          updatedAt: nowIso(),
          baseLiveUpdatedAt: (live as any)?.updatedAt,
          shifts: live?.shifts||[],
        }
        try{ localStorage.setItem(k, JSON.stringify(doc)) }catch{}
        stage = doc
      }
      return { stage, live }
    },
    async save(doc, ifMatch){
      if(ifMatch && ifMatch !== doc.updatedAt){ return { ok:false, conflict:true } }
      const updatedAt = nowIso()
      const next: StageDoc = { ...doc, updatedAt }
      try{ localStorage.setItem(keyFor(doc), JSON.stringify(next)) }catch{}
      return { ok:true, updatedAt }
    },
    async reset(key, liveArg){
      const live = liveArg || (await cloudGet() as any)
      const doc: StageDoc = {
        ...key,
        updatedAt: nowIso(),
        baseLiveUpdatedAt: (live as any)?.updatedAt,
        shifts: live?.shifts||[],
      }
      try{ localStorage.setItem(keyFor(key), JSON.stringify(doc)) }catch{}
      return { ok:true, stage: doc }
    },
    async publish(){
      // Local adapter: no server publish; UI should call existing publish path.
      return { ok:true }
    },
    async snapshot(){ return { ok:true } },
  }
}
