import { Router, type Request, type Response } from 'express'
import { query } from '../db'
import { computeCoverage } from '../../domain/coverage'

const router = Router()

router.get('/:id', async (req: Request, res: Response)=>{
  const { rows } = await query('SELECT start, "end" FROM schedule_version_contents WHERE version_id=$1',[req.params.id])
  const series = computeCoverage(rows as any, 30)
  res.json(series)
})

export default router
