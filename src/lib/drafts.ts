import type { PTO, Shift, Override } from '../types'
import type { CalendarSegment } from './utils'
import { mapAgentsToPayloads } from './agents'

type AgentIdResolver = (name: string) => string | undefined

export type DraftBundle = {
  shifts: Shift[]
  pto: PTO[]
  overrides: Override[]
  calendarSegs: CalendarSegment[]
}

export type PublishDraftResult = {
  ok: boolean
  payload: {
    shifts: Shift[]
    pto: PTO[]
    overrides: Override[]
    calendarSegs: CalendarSegment[]
    agents: ReturnType<typeof mapAgentsToPayloads>
    updatedAt: string
  }
}

export async function publishDraftBundle(input: {
  draft: DraftBundle
  agents: Array<{ id?: string; firstName?: string; lastName?: string; tzId?: string; hidden?: boolean; isSupervisor?: boolean; supervisorId?: string | null; notes?: string; meetingCohort?: string | null | undefined }>
  cloudPost: (payload: PublishDraftResult['payload']) => Promise<boolean>
  agentIdByFullName: AgentIdResolver
  now?: () => string
}): Promise<PublishDraftResult> {
  const { draft, agents, cloudPost, agentIdByFullName } = input
  const nowIso = input.now ? input.now() : new Date().toISOString()
  const shiftsWithIds = draft.shifts.map(s=> s.agentId ? s : ({ ...s, agentId: agentIdByFullName(s.person) }))
  const ptoWithIds = draft.pto.map(p=> (p as any).agentId ? p : ({ ...p, agentId: agentIdByFullName(p.person) }))
  const agentsPayload = mapAgentsToPayloads(agents)
  const payload = {
    shifts: shiftsWithIds,
    pto: ptoWithIds,
    overrides: draft.overrides,
    calendarSegs: draft.calendarSegs,
    agents: agentsPayload,
    updatedAt: nowIso
  }
  const ok = await cloudPost(payload)
  return { ok, payload }
}
