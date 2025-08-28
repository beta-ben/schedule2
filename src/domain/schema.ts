// V1 Schedule schema: Types and Zod validators
import { z } from 'zod'

export type ID = string

export interface Org { id: ID; name: string }

export interface Employee {
  id: ID
  displayName: string
  email?: string
  active: boolean
  roleIds: ID[]
}

export interface Role { id: ID; name: string; color?: string }
export interface Location { id: ID; name: string; addressLine1?: string; tz?: string }

export type EventBase = {
  id: ID
  start: string // ISO-8601 UTC
  end: string   // ISO-8601 UTC
  tz?: string   // IANA tz; default org.timezone
  notes?: string
  createdAt: string // ISO-8601 UTC
  updatedAt: string // ISO-8601 UTC
  status?: 'planned' | 'published' | 'canceled'
}

export type ShiftEvent = EventBase & {
  kind: 'shift'
  employeeId: ID
  roleId?: ID
  locationId?: ID
}

export type PtoEvent = EventBase & {
  kind: 'pto'
  employeeId: ID
  ptoType: 'vacation' | 'sick' | 'unpaid' | 'other'
  state: 'requested' | 'approved' | 'denied' | 'canceled'
}

export type HolidayEvent = EventBase & {
  kind: 'holiday'
  name: string
}

export type Event = ShiftEvent | PtoEvent | HolidayEvent

export interface ScheduleDoc {
  schemaVersion: 1
  org: Org
  timezone: string
  employees: Employee[]
  roles: Role[]
  locations: Location[]
  events: Event[]
  published: { from: string | null; to: string | null }
  meta: { generatedAt: string; source?: string }
}

// Zod validators
const iso = z.string().refine((s: string) => !Number.isNaN(Date.parse(s)), 'ISO date expected')

export const OrgZ = z.object({ id: z.string(), name: z.string().min(1) })

export const EmployeeZ = z.object({
  id: z.string(),
  displayName: z.string().min(1),
  email: z.string().email().optional(),
  active: z.boolean(),
  roleIds: z.array(z.string()).default([]),
})

export const RoleZ = z.object({ id: z.string(), name: z.string().min(1), color: z.string().optional() })
export const LocationZ = z.object({ id: z.string(), name: z.string().min(1), addressLine1: z.string().optional(), tz: z.string().optional() })

const EventBaseZ = z.object({
  id: z.string(),
  start: iso,
  end: iso,
  tz: z.string().optional(),
  notes: z.string().optional(),
  createdAt: iso,
  updatedAt: iso,
  status: z.enum(['planned','published','canceled']).optional(),
})

export const ShiftEventZ = EventBaseZ.extend({
  kind: z.literal('shift'),
  employeeId: z.string(),
  roleId: z.string().optional(),
  locationId: z.string().optional(),
})

export const PtoEventZ = EventBaseZ.extend({
  kind: z.literal('pto'),
  employeeId: z.string(),
  ptoType: z.enum(['vacation','sick','unpaid','other']),
  state: z.enum(['requested','approved','denied','canceled']),
})

export const HolidayEventZ = EventBaseZ.extend({ kind: z.literal('holiday'), name: z.string() })
export const EventZ = z.discriminatedUnion('kind', [ShiftEventZ, PtoEventZ, HolidayEventZ])

export const ScheduleDocZ = z.object({
  schemaVersion: z.literal(1),
  org: OrgZ,
  timezone: z.string().min(1),
  employees: z.array(EmployeeZ),
  roles: z.array(RoleZ),
  locations: z.array(LocationZ),
  events: z.array(EventZ),
  published: z.object({ from: iso.nullable(), to: iso.nullable() }),
  meta: z.object({ generatedAt: iso, source: z.string().optional() }),
})

export type V1ScheduleDoc = ScheduleDoc
