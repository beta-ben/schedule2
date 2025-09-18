import { describe, it, expect, vi } from 'vitest'
import { publishDraftBundle } from './drafts'
import type { PublishDraftResult } from './drafts'

const agentIdByFullName = (name: string) => ({
  'Alice Smith': 'agent-alice',
  'Bob Stone': 'agent-bob'
} as Record<string, string>)[name]

describe('publishDraftBundle', () => {
  it('sends agent cohorts and notes when publishing', async () => {
    const cloudPost = vi.fn<(payload: PublishDraftResult['payload']) => Promise<boolean>>(async () => true)
    const draft = {
      shifts: [{ id: 's1', person: 'Alice Smith', day: 'Mon', start: '09:00', end: '17:00' }],
      pto: [{ id: 'p1', person: 'Bob Stone', startDate: '2025-09-15', endDate: '2025-09-15' }],
      overrides: [],
      calendarSegs: []
    } as any
    const agents = [
      { id: 'agent-alice', firstName: 'Alice', lastName: 'Smith', meetingCohort: 'Morning Meeting', notes: 'Trainer' },
      { id: 'agent-bob', firstName: 'Bob', lastName: 'Stone', meetingCohort: null, notes: 'Night shift' }
    ]
    const result = await publishDraftBundle({ draft, agents, cloudPost, agentIdByFullName })
    expect(result.ok).toBe(true)
    expect(cloudPost).toHaveBeenCalledTimes(1)
    const firstCall = cloudPost.mock.calls[0]
    expect(firstCall).toBeDefined()
    const payload = firstCall![0]
    expect(payload.agents).toEqual([
      expect.objectContaining({ id: 'agent-alice', meetingCohort: 'Morning Meeting', notes: 'Trainer' }),
      expect.objectContaining({ id: 'agent-bob', meetingCohort: null, notes: 'Night shift' })
    ])
    const [firstShift] = payload.shifts
    expect(firstShift).toBeDefined()
    expect(firstShift!.agentId).toBe('agent-alice')
    const [firstPto] = payload.pto
    expect(firstPto).toBeDefined()
    expect(firstPto!.agentId).toBe('agent-bob')
  })

  it('reflects cloud failure status', async () => {
    const cloudPost = vi.fn(async () => false)
    const draft = { shifts: [], pto: [], overrides: [], calendarSegs: [] }
    const agents: any[] = []
    const result = await publishDraftBundle({ draft, agents, cloudPost, agentIdByFullName: () => undefined })
    expect(result.ok).toBe(false)
  })
})
