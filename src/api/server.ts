import express from 'express'
import cors from 'cors'
import versionsRouter from './routes/versions'
import coverageRouter from './routes/coverage'

const app = express()
app.use(express.json({ limit: '2mb' }))
app.use(cors())

app.use('/api/versions', versionsRouter)
app.use('/api/coverage', coverageRouter)

const PORT = process.env.PORT || 3001
app.listen(PORT, () => {
  console.log(`API listening on http://localhost:${PORT}`)
})
