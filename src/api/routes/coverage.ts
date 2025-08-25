import { Router, type Request, type Response } from 'express'
import { query } from '../db'
import { mockDb } from '../mockDb'
import { computeCoverage } from '../../domain/coverage'

// Use mock database if DATABASE_URL is not set
const db = process.env.DATABASE_URL ? { query } : mockDb

const router = Router()

router.get('/:id', async (req: Request, res: Response)=>{
  const { rows } = await db.query('SELECT start, "end" FROM schedule_version_contents WHERE version_id=$1',[req.params.id])
  const series = computeCoverage(rows as any, 30)
  res.json(series)
})

export default router
