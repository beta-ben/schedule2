import type { MeetingCohort } from '../types'

export type AgentLike = {
  id?: string
  firstName?: string
  lastName?: string
  tzId?: string
  hidden?: boolean
  isSupervisor?: boolean
  supervisorId?: string | null
  notes?: string
  meetingCohort?: MeetingCohort | string | null | undefined
}

export type AgentPayload = {
  id: string
  firstName: string
  lastName: string
  tzId?: string
  hidden: boolean
  isSupervisor: boolean
  supervisorId: string | null
  notes?: string
  meetingCohort?: string | null
}

const defaultId = () => crypto.randomUUID?.() || Math.random().toString(36).slice(2)

export function normalizeMeetingCohort(raw: unknown): string | null | undefined {
  if(typeof raw === 'string'){
    const trimmed = raw.trim()
    if(trimmed.length === 0) return null
    return trimmed
  }
  if(raw === null) return null
  return undefined
}

export function agentToPayload(agent: AgentLike, options: { generateId?: () => string } = {}): AgentPayload {
  const generateId = options.generateId ?? defaultId
  const id = agent.id ? String(agent.id) : generateId()
  const meeting = normalizeMeetingCohort((agent as any).meetingCohort)
  const payload: AgentPayload = {
    id,
    firstName: agent.firstName || '',
    lastName: agent.lastName || '',
    tzId: agent.tzId,
    hidden: !!agent.hidden,
    isSupervisor: agent.isSupervisor === true,
    supervisorId: agent.supervisorId ?? null,
    notes: agent.notes,
  }
  if(meeting !== undefined){
    payload.meetingCohort = meeting
  }
  return payload
}

export function mapAgentsToPayloads<T extends AgentLike>(agents: T[], options?: { generateId?: () => string }): AgentPayload[]{
  return agents.map(agent=> agentToPayload(agent, options))
}

export async function pushAgentsToCloud<T extends AgentLike>(agents: T[], poster: (payload: AgentPayload[]) => Promise<boolean>, options?: { generateId?: () => string }): Promise<boolean>{
  const payload = mapAgentsToPayloads(agents, options)
  return poster(payload)
}
