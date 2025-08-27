import 'dotenv/config'
import fs from 'fs'
import path from 'path'
import express from 'express'
import helmet from 'helmet'
import cors from 'cors'
import cookieParser from 'cookie-parser'
import rateLimit from 'express-rate-limit'
import { nanoid } from 'nanoid'

const app = express()
const PORT = process.env.PORT || 8787
const ORIGIN = process.env.DEV_ALLOWED_ORIGIN || 'http://localhost:5173'
const ADMIN_PW = process.env.DEV_ADMIN_PASSWORD
if (!ADMIN_PW) {
  console.error('DEV_ADMIN_PASSWORD is required in dev-server/.env')
  process.exit(1)
}

const dataDir = path.join(process.cwd(), 'dev-server')
const dataFile = path.join(dataDir, 'data.json')
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true })
if (!fs.existsSync(dataFile)) fs.writeFileSync(dataFile, JSON.stringify({ shifts: [], pto: [], calendarSegs: [] }, null, 2), 'utf8')

app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      'default-src': ["'self'"],
      'script-src': ["'self'"],
      'style-src': ["'self'", "'unsafe-inline'"],
      'img-src': ["'self'", 'data:'],
      'connect-src': ["'self'", ORIGIN],
    }
  },
  crossOriginOpenerPolicy: { policy: 'same-origin' },
  crossOriginResourcePolicy: { policy: 'same-origin' }
}))

app.use(cors({ origin: ORIGIN, credentials: true }))
app.use(express.json({ limit: '1mb' }))
app.use(cookieParser())

const sessions = new Map()
const sessionTTLms = 8 * 60 * 60 * 1000 // 8h

const authLimiter = rateLimit({ windowMs: 10 * 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false })

app.post('/api/login', authLimiter, (req, res) => {
  const { password } = req.body || {}
  if (typeof password !== 'string' || password.length < 3) return res.sendStatus(400)
  if (password !== ADMIN_PW) return res.sendStatus(401)

  const sid = nanoid(24)
  const csrf = nanoid(32)
  sessions.set(sid, { csrf, expiresAt: Date.now() + sessionTTLms })
  res.cookie('sid', sid, { httpOnly: true, sameSite: 'lax', secure: false, maxAge: sessionTTLms })
  res.cookie('csrf', csrf, { httpOnly: false, sameSite: 'lax', secure: false, maxAge: sessionTTLms })
  res.status(200).json({ ok: true })
})

app.post('/api/logout', (req, res) => {
  const sid = req.cookies?.sid
  if (sid) sessions.delete(sid)
  res.clearCookie('sid')
  res.clearCookie('csrf')
  res.status(200).json({ ok: true })
})

function requireAuth(req, res, next) {
  const origin = req.headers.origin
  if (origin && origin !== ORIGIN) return res.sendStatus(403)

  const sid = req.cookies?.sid
  const csrfCookie = req.cookies?.csrf
  const csrfHeader = req.header('x-csrf-token')
  if (!sid || !csrfCookie || !csrfHeader) return res.sendStatus(401)

  const sess = sessions.get(sid)
  if (!sess || sess.expiresAt < Date.now()) {
    sessions.delete(sid)
    return res.sendStatus(401)
  }
  if (sess.csrf !== csrfCookie || sess.csrf !== csrfHeader) return res.sendStatus(403)
  next()
}

app.get('/api/schedule', requireAuth, (req, res) => {
  try {
    const raw = fs.readFileSync(dataFile, 'utf8')
    res.type('application/json').send(raw)
  } catch {
    res.status(500).json({ error: 'read_failed' })
  }
})

app.post('/api/schedule', requireAuth, (req, res) => {
  try {
    const body = req.body
    if (typeof body !== 'object' || body === null) return res.sendStatus(400)
    fs.writeFileSync(dataFile, JSON.stringify(body, null, 2))
    res.status(200).json({ ok: true, updatedAt: new Date().toISOString() })
  } catch {
    res.status(500).json({ error: 'write_failed' })
  }
})

app.listen(PORT, () => {
  console.log(`Dev auth proxy listening on http://localhost:${PORT}`)
  console.log(`Allowed origin: ${ORIGIN}`)
})
