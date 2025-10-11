import type { MeetingCohort, Shift } from '../../types'

export type AgentRow = {
  firstName: string
  lastName: string
  tzId?: string
  hidden?: boolean
  isSupervisor?: boolean
  supervisorId?: string | null
  notes?: string
  meetingCohort?: MeetingCohort | null
}

export type StageChangeEntry = {
  id: string
  type: 'added' | 'updated' | 'removed'
  person: string
  stage?: Shift
  live?: Shift
}
