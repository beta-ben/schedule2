import { StageStore, StageDoc, StageKey, LiveDoc } from '../../domain/stage'
import { cloudGet } from '../api'

function keyFor(k: StageKey){ return `schedule2.stage.${k.weekStart}.${k.tzId}` }

function nowIso(){ return new Date().toISOString() }

function cloneArray<T>(value: unknown): T[]{
  if(!Array.isArray(value)) return []
  try{
    return JSON.parse(JSON.stringify(value)) as T[]
  }catch{
    return (value as T[]).map(item=>{
      if(item && typeof item === 'object'){
        return { ...(item as Record<string, unknown>) } as T
      }
      return item
    })
  }
}

function cloneAgents(value: unknown): StageDoc['agents'] | undefined{
  if(!Array.isArray(value)) return undefined
  const cloned = cloneArray<NonNullable<StageDoc['agents']>[number]>(value)
  return cloned
}

function ensureStageDocStructure(input: any, key: StageKey, fallbackUpdatedAt?: string): StageDoc{
  const updatedAt = typeof input?.updatedAt === 'string' ? input.updatedAt : (fallbackUpdatedAt || nowIso())
  const baseLiveUpdatedAt = typeof input?.baseLiveUpdatedAt === 'string' ? input.baseLiveUpdatedAt : undefined
  const doc: StageDoc = {
    weekStart: typeof input?.weekStart === 'string' ? input.weekStart : key.weekStart,
    tzId: typeof input?.tzId === 'string' ? input.tzId : key.tzId,
    updatedAt,
    baseLiveUpdatedAt,
    shifts: cloneArray<StageDoc['shifts'][number]>(input?.shifts),
    pto: cloneArray<StageDoc['pto'][number]>(input?.pto),
    overrides: cloneArray<StageDoc['overrides'][number]>(input?.overrides),
    calendarSegs: cloneArray<StageDoc['calendarSegs'][number]>(input?.calendarSegs),
    agents: cloneAgents(input?.agents),
  }
  return doc
}

function buildStageFromLive(key: StageKey, live: LiveDoc | null | undefined): StageDoc{
  const now = nowIso()
  return ensureStageDocStructure({
    weekStart: key.weekStart,
    tzId: key.tzId,
    updatedAt: now,
    baseLiveUpdatedAt: typeof live?.updatedAt === 'string' ? live.updatedAt : undefined,
    shifts: live?.shifts,
    pto: live?.pto,
    overrides: live?.overrides,
    calendarSegs: live?.calendarSegs,
    agents: live?.agents,
  }, key, now)
}

export function makeLocalStageStore(): StageStore{
  return {
    async get(key){
      const storageKey = keyFor(key)
      let stage: StageDoc | null = null
      try{
        const raw = localStorage.getItem(storageKey)
        if(raw){
          stage = ensureStageDocStructure(JSON.parse(raw), key)
          try{ localStorage.setItem(storageKey, JSON.stringify(stage)) }catch{}
        }
      }catch{}
      let live: LiveDoc | null = null
      try{ live = await cloudGet() as any }catch{}
      if(!stage && live){
        stage = buildStageFromLive(key, live)
        try{ localStorage.setItem(storageKey, JSON.stringify(stage)) }catch{}
      }
      return { stage, live }
    },
    async save(doc, opts){
      const ifMatch = typeof opts === 'string' ? opts : opts?.ifMatch
      if(ifMatch && ifMatch !== doc.updatedAt){ return { ok:false, conflict:true } }
      const updatedAt = nowIso()
      const normalized = ensureStageDocStructure({ ...doc, updatedAt }, doc, updatedAt)
      try{ localStorage.setItem(keyFor(doc), JSON.stringify(normalized)) }catch{}
      return { ok:true, updatedAt: normalized.updatedAt, stage: normalized }
    },
    async reset(key, liveArg){
      const live = liveArg || (await cloudGet() as any)
      const stage = buildStageFromLive(key, live)
      try{ localStorage.setItem(keyFor(key), JSON.stringify(stage)) }catch{}
      return { ok:true, stage }
    },
    async publish(){
      // Local adapter: no server publish; UI should call existing publish path.
      return { ok:true }
    },
    async snapshot(){
      return { ok:true }
    },
  }
}
