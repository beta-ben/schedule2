import { describe, it, expect, vi } from 'vitest'
import { agentToPayload, normalizeMeetingCohort, pushAgentsToCloud } from './agents'

describe('agents helpers', () => {
  it('normalizes meeting cohorts', () => {
    expect(normalizeMeetingCohort(' Morning ')).toBe('Morning')
    expect(normalizeMeetingCohort('   ')).toBeNull()
    expect(normalizeMeetingCohort(null)).toBeNull()
    expect(normalizeMeetingCohort(undefined)).toBeUndefined()
  })

  it('maps agent meeting cohort and generates ids when missing', () => {
    const payload = agentToPayload({
      firstName: 'Ada',
      lastName: 'Lovelace',
      meetingCohort: '  Morning Meeting  ',
    }, { generateId: () => 'fixed-id' })
    expect(payload.id).toBe('fixed-id')
    expect(payload.firstName).toBe('Ada')
    expect(payload.lastName).toBe('Lovelace')
    expect(payload.meetingCohort).toBe('Morning Meeting')
  })

  it('pushAgentsToCloud forwards normalized payloads', async () => {
    const poster = vi.fn(async () => true)
    const ok = await pushAgentsToCloud([
      { id: 'a1', firstName: 'Sam', lastName: 'Hill', meetingCohort: ' Afternoon ' },
      { id: 'a2', firstName: 'Lee', lastName: 'Jones', meetingCohort: null }
    ], poster)
    expect(ok).toBe(true)
    expect(poster).toHaveBeenCalledTimes(1)
    const [payload] = poster.mock.calls[0]
    expect(payload).toEqual([
      expect.objectContaining({ id: 'a1', meetingCohort: 'Afternoon' }),
      expect.objectContaining({ id: 'a2', meetingCohort: null })
    ])
  })
})
