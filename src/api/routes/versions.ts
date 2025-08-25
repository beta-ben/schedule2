import { Router, type Request, type Response } from 'express'
import { query } from '../db'
import { mockDb } from '../mockDb'
import { z } from 'zod'

// Use mock database if DATABASE_URL is not set
const db = process.env.DATABASE_URL ? { query } : mockDb

const router = Router()

router.get('/', async (_req: Request, res: Response)=>{
  const { rows } = await db.query('SELECT id, week_start, status, notes, created_at FROM schedule_versions ORDER BY week_start DESC, created_at DESC')
  res.json(rows)
})

router.get('/:id', async (req: Request, res: Response)=>{
  const { rows } = await db.query('SELECT id, week_start, status, notes, created_at FROM schedule_versions WHERE id=$1',[req.params.id])
  if(!rows[0]) return res.status(404).json({error:'not_found'})
  const { rows: shifts } = await db.query('SELECT id, agent_id, start, "end", posture_id, notes FROM schedule_version_contents WHERE version_id=$1 ORDER BY start',[req.params.id])
  res.json({ version: rows[0], shifts })
})

router.post('/draft', async (req: Request, res: Response)=>{
  const schema = z.object({ week_start: z.string(), fork_from: z.string().uuid().optional() })
  const body = schema.parse(req.body)
  const { rows: v } = await db.query('INSERT INTO schedule_versions(week_start,status) VALUES ($1,\'draft\') RETURNING id, week_start, status',[body.week_start])
  const vid = (v[0] as any).id
  if(body.fork_from){
    await db.query('INSERT INTO schedule_version_contents(version_id, agent_id, start, "end", posture_id, notes) SELECT $1, agent_id, start, "end", posture_id, notes FROM schedule_version_contents WHERE version_id=$2',[vid, body.fork_from])
  }
  res.json({ id: vid })
})

router.post('/:id/save', async (req: Request, res: Response)=>{
  const schema = z.object({ shifts: z.array(z.object({ id: z.string().uuid().optional(), agent_id: z.string().uuid(), start: z.string(), end: z.string(), posture_id: z.string().optional(), notes: z.string().optional() })) })
  const body = schema.parse(req.body)
  const vid = req.params.id
  // replace-all approach for draft simplicity
  await db.query('DELETE FROM schedule_version_contents WHERE version_id=$1',[vid])
  for(const s of body.shifts){
    await db.query('INSERT INTO schedule_version_contents(id, version_id, agent_id, start, "end", posture_id, notes) VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6)',[vid, s.agent_id, s.start, s.end, s.posture_id||null, s.notes||null])
  }
  res.json({ ok: true })
})

router.post('/:id/publish', async (req: Request, res: Response)=>{
  const vid = req.params.id
  // find week_start of this version
  const { rows } = await db.query('SELECT week_start FROM schedule_versions WHERE id=$1',[vid])
  if(!rows[0]) return res.status(404).json({error:'not_found'})
  const week_start = (rows[0] as any).week_start
  await db.query("UPDATE schedule_versions SET status='archived' WHERE week_start=$1 AND status='active'", [week_start])
  await db.query("UPDATE schedule_versions SET status='active' WHERE id=$1", [vid])
  res.json({ ok: true })
})

router.get('/:id/export.csv', async (req: Request, res: Response)=>{
  const vid = req.params.id
  const { rows } = await db.query('SELECT id, agent_id, start, "end", posture_id, notes FROM schedule_version_contents WHERE version_id=$1 ORDER BY start',[vid])
  const header = 'id,agent_id,start,end,posture_id,notes\n'
  const lines = rows.map(r=> [r.id,r.agent_id,r.start,r.end,r.posture_id||'', (r.notes||'').replace(/\n/g,' ')].join(','))
  res.setHeader('Content-Type','text/csv')
  res.send(header + lines.join('\n'))
})

export default router
