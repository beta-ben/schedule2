import { StageStore, StageDoc, StageKey, LiveDoc } from '../../domain/stage'

// Placeholder for future server-backed Stage endpoints.
export function makeApiStageStore(): StageStore{
  return {
    async get(_key: StageKey){ return { stage: null, live: null } },
    async save(_doc: StageDoc){ return { ok:false } },
    async reset(_key: StageKey, _live: LiveDoc){ return { ok:false, stage: { weekStart:'', tzId:'', updatedAt:'', shifts:[] } as any } },
    async publish(){ return { ok:false } },
    async snapshot(){ return { ok:false } },
  }
}
