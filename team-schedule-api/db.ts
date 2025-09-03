/// <reference types="@cloudflare/workers-types" />
export interface Env {
  DB: D1Database
  SCHEDULE_KV: KVNamespace
  USE_D1?: string
}

export type Agent = { id: string; name: string; color?: string; active: number; meta?: unknown }
export type Shift = { id: string; agent_id: string; start_ts: number; end_ts: number; role?: string; note?: string }

export interface Store {
  listAgents(): Promise<Agent[]>
  listShiftsRange(startTs: number, endTs: number): Promise<Shift[]>
  upsertAgent(a: Agent): Promise<void>
  upsertShift(s: Shift): Promise<void>
  deleteShift(id: string): Promise<void>
}

export function makeStore(env: Env): Store {
  return new D1Store(env.DB)
}

export class D1Store implements Store {
  constructor(private db: D1Database) {}

  async listAgents(): Promise<Agent[]> {
    const { results } = await this.db.prepare(
      'SELECT id, name, color, active, meta FROM agents WHERE active = 1 ORDER BY name'
    ).all()
    return (results || []).map((r: any) => ({
      id: r.id,
      name: r.name,
      color: r.color ?? undefined,
      active: Number(r.active) ?? 1,
      meta: r.meta ? safeJsonParse(String(r.meta)) : undefined,
    }))
  }

  async listShiftsRange(startTs: number, endTs: number): Promise<Shift[]> {
    const { results } = await this.db
      .prepare('SELECT id, agent_id, start_ts, end_ts, role, note FROM shifts WHERE start_ts < ?2 AND end_ts > ?1 ORDER BY start_ts')
      .bind(startTs, endTs)
      .all()
    return (results || []) as Shift[]
  }

  async upsertAgent(a: Agent): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO agents (id,name,color,active,meta)
         VALUES (?1,?2,?3,?4,?5)
         ON CONFLICT(id) DO UPDATE SET
           name=excluded.name,
           color=excluded.color,
           active=excluded.active,
           meta=excluded.meta,
           updated_at=unixepoch()`
      )
      .bind(a.id, a.name, a.color ?? null, a.active ?? 1, a.meta ? JSON.stringify(a.meta) : null)
      .run()
  }

  async upsertShift(s: Shift): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO shifts (id,agent_id,start_ts,end_ts,role,note)
         VALUES (?1,?2,?3,?4,?5,?6)
         ON CONFLICT(id) DO UPDATE SET
           agent_id=excluded.agent_id,
           start_ts=excluded.start_ts,
           end_ts=excluded.end_ts,
           role=excluded.role,
           note=excluded.note,
           updated_at=unixepoch()`
      )
      .bind(s.id, s.agent_id, s.start_ts, s.end_ts, s.role ?? null, s.note ?? null)
      .run()
  }

  async deleteShift(id: string): Promise<void> {
    await this.db.prepare('DELETE FROM shifts WHERE id=?1').bind(id).run()
  }
}

function safeJsonParse(s: string) {
  try {
    return JSON.parse(s)
  } catch {
    return undefined
  }
}
