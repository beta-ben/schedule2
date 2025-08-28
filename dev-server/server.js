import 'dotenv/config'
import fs from 'fs'
import path from 'path'
import express from 'express'
import helmet from 'helmet'
import cors from 'cors'
import cookieParser from 'cookie-parser'
import rateLimit from 'express-rate-limit'
import { nanoid } from 'nanoid'
import { z } from 'zod'

const app = express()
const PORT = process.env.PORT || 8787
const ORIGIN = process.env.DEV_ALLOWED_ORIGIN || 'http://localhost:5173'
const ORIGINS = (process.env.DEV_ALLOWED_ORIGINS || ORIGIN)
  .split(',')
  .map(s => s.trim())
  .filter(Boolean)
// Convenience: if localhost:5173 is allowed, also allow 127.0.0.1:5173
if (ORIGINS.includes('http://localhost:5173') && !ORIGINS.includes('http://127.0.0.1:5173')) {
  ORIGINS.push('http://127.0.0.1:5173')
}
const ADMIN_PW = process.env.DEV_ADMIN_PASSWORD
const SITE_PW = process.env.DEV_SITE_PASSWORD || process.env.DEV_VIEW_PASSWORD
if (!ADMIN_PW) {
  console.error('DEV_ADMIN_PASSWORD is required in dev-server/.env')
  process.exit(1)
}
if (!SITE_PW) {
  console.error('DEV_SITE_PASSWORD (or DEV_VIEW_PASSWORD) is required in dev-server/.env')
  process.exit(1)
}

const dataDir = path.join(process.cwd(), 'dev-server')
const dataset = process.env.DATASET || 'data' // data | demo | snapshot
const dataBase = dataset.endsWith('.json') ? dataset.replace(/\.json$/,'') : dataset
const dataFile = path.join(dataDir, `${dataBase}.json`)
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true })
if (!fs.existsSync(dataFile)) fs.writeFileSync(dataFile, JSON.stringify({ schemaVersion: 1, shifts: [], pto: [], calendarSegs: [], updatedAt: new Date().toISOString() }, null, 2), 'utf8')

function backupFile(){
  try{
    const raw = fs.readFileSync(dataFile, 'utf8')
    const ts = new Date().toISOString().replace(/[:.]/g,'-')
    const backupsDir = path.join(dataDir, 'backups')
    if(!fs.existsSync(backupsDir)) fs.mkdirSync(backupsDir, { recursive: true })
    fs.writeFileSync(path.join(backupsDir, `${dataBase}.${ts}.json`), raw, 'utf8')
  }catch{}
}

// Simple HH:MM to minutes (00:00..24:00), returns 1440 for 24:00
function hhmmToMin(hhmm){
  if(hhmm === '24:00') return 1440
  const [h,m] = (hhmm||'').split(':').map(n=>parseInt(n,10))
  if(Number.isNaN(h) || Number.isNaN(m)) return NaN
  return (h*60)+m
}
function nextDayOf(day){
  const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
  const i = days.indexOf(day)
  if(i<0) return day
  return days[(i+1)%7]
}

app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      'default-src': ["'self'"],
      'script-src': ["'self'"],
      'style-src': ["'self'", "'unsafe-inline'"],
      'img-src': ["'self'", 'data:'],
      'connect-src': ["'self'", ...ORIGINS],
    }
  },
  crossOriginOpenerPolicy: { policy: 'same-origin' },
  crossOriginResourcePolicy: { policy: 'same-origin' }
}))

function isAllowedOrigin(origin){
  return !!origin && ORIGINS.includes(origin)
}
app.use(cors({
  origin: function(origin, cb){
    if (!origin) return cb(null, false)
    cb(null, isAllowedOrigin(origin))
  },
  credentials: true
}))
app.use(express.json({ limit: '1mb' }))
app.use(cookieParser())

// Separate site-view and admin sessions
const siteSessions = new Map()
const adminSessions = new Map()
const sessionTTLms = 8 * 60 * 60 * 1000 // 8h

const authLimiter = rateLimit({ windowMs: 10 * 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false })

// Site-wide login (view-only)
app.post('/api/login-site', authLimiter, (req, res) => {
  const { password } = req.body || {}
  if (typeof password !== 'string' || password.length < 3) return res.status(400).json({ error: 'invalid_input' })
  if (password !== SITE_PW) return res.status(401).json({ error: 'bad_password' })

  const sid = nanoid(24)
  siteSessions.set(sid, { expiresAt: Date.now() + sessionTTLms })
  res.cookie('site_sid', sid, { httpOnly: true, sameSite: 'lax', secure: false, maxAge: sessionTTLms })
  res.status(200).json({ ok: true })
})

app.post('/api/logout-site', (req, res) => {
  const sid = req.cookies?.site_sid
  if (sid) siteSessions.delete(sid)
  res.clearCookie('site_sid')
  res.status(200).json({ ok: true })
})

// Admin login (for management + writes)
app.post('/api/login', authLimiter, (req, res) => {
  const { password } = req.body || {}
  if (typeof password !== 'string' || password.length < 3) return res.status(400).json({ error: 'invalid_input' })
  if (password !== ADMIN_PW) return res.status(401).json({ error: 'bad_password' })

  const sid = nanoid(24)
  const csrf = nanoid(32)
  adminSessions.set(sid, { csrf, expiresAt: Date.now() + sessionTTLms })
  res.cookie('sid', sid, { httpOnly: true, sameSite: 'lax', secure: false, maxAge: sessionTTLms })
  res.cookie('csrf', csrf, { httpOnly: false, sameSite: 'lax', secure: false, maxAge: sessionTTLms })
  res.status(200).json({ ok: true })
})

app.post('/api/logout', (req, res) => {
  const sid = req.cookies?.sid
  if (sid) adminSessions.delete(sid)
  res.clearCookie('sid')
  res.clearCookie('csrf')
  res.status(200).json({ ok: true })
})

function requireSite(req, res, next) {
  const origin = req.headers.origin
  if (origin && !isAllowedOrigin(origin)) return res.status(403).json({ error: 'forbidden_origin', origin, allowed: ORIGINS })
  const sid = req.cookies?.site_sid
  if (!sid) return res.status(401).json({ error: 'missing_site_session' })
  const sess = siteSessions.get(sid)
  if (!sess || sess.expiresAt < Date.now()) {
    siteSessions.delete(sid)
    return res.status(401).json({ error: 'expired_site_session' })
  }
  next()
}

function requireAdmin(req, res, next) {
  const origin = req.headers.origin
  if (origin && !isAllowedOrigin(origin)) return res.status(403).json({ error: 'forbidden_origin', origin, allowed: ORIGINS })

  const sid = req.cookies?.sid
  const csrfCookie = req.cookies?.csrf
  const csrfHeader = req.header('x-csrf-token')
  if (!sid || !csrfCookie || !csrfHeader) return res.status(401).json({ error: 'missing_auth', need: ['sid','csrf cookie','x-csrf-token header'] })

  const sess = adminSessions.get(sid)
  if (!sess || sess.expiresAt < Date.now()) {
    adminSessions.delete(sid)
    return res.status(401).json({ error: 'expired_admin_session' })
  }
  if (sess.csrf !== csrfCookie || sess.csrf !== csrfHeader) return res.status(403).json({ error: 'csrf_mismatch' })
  next()
}

// For SSE: require site session (read-only)
function requireSession(req, res, next) {
  const origin = req.headers.origin
  if (origin && !isAllowedOrigin(origin)) return res.status(403).json({ error: 'forbidden_origin', origin, allowed: ORIGINS })
  const sid = req.cookies?.site_sid
  if (!sid) return res.status(401).json({ error: 'missing_site_session' })
  const sess = siteSessions.get(sid)
  if (!sess || sess.expiresAt < Date.now()) {
    siteSessions.delete(sid)
    return res.status(401).json({ error: 'expired_site_session' })
  }
  next()
}

// Simple SSE hub
const sseClients = new Set()
function sseBroadcast(event, data){
  const payload = typeof data === 'string' ? data : JSON.stringify(data)
  const frame = `event: ${event}\n` + `data: ${payload}\n\n`
  for (const res of sseClients){
    try { res.write(frame) } catch { /* drop on failure */ }
  }
}

app.get('/api/events', requireSession, (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  // Allow CORS preflight already set via cors() above; cookies included via withCredentials
  res.flushHeaders?.()
  // Initial comment to open the stream
  res.write(': connected\n\n')
  sseClients.add(res)
  req.on('close', () => { sseClients.delete(res); try{ res.end() }catch{} })
})

// Health/info for troubleshooting (no auth; read-only)
app.get('/api/_info', (req, res) => {
  res.json({
    ok: true,
    origins: ORIGINS,
    routes: [
      'POST /api/login-site',
      'POST /api/logout-site',
      'POST /api/login',
      'POST /api/logout',
      'GET  /api/schedule',
      'POST /api/schedule',
      'GET  /api/events',
      'POST /api/admin/seed?dataset=demo|data|snapshot',
      'GET  /api/admin/export',
      'POST /api/admin/import'
    ],
    env: {
      hasAdminPw: !!ADMIN_PW,
      hasSitePw: !!SITE_PW,
      port: PORT,
      dataset: dataBase
    }
  })
})

// Read requires site login (view gate)
app.get('/api/schedule', requireSite, (req, res) => {
  try {
    const raw = fs.readFileSync(dataFile, 'utf8')
    res.type('application/json').send(raw)
  } catch {
    res.status(500).json({ error: 'read_failed' })
  }
})

// Write requires admin login + CSRF
app.post('/api/schedule', requireAdmin, (req, res) => {
  try {
    const body = req.body
    if (typeof body !== 'object' || body === null) return res.sendStatus(400)
    // Validate legacy document shape using Zod
    const HHMM = /^\d{2}:\d{2}$/
    const DayZ = z.enum(['Sun','Mon','Tue','Wed','Thu','Fri','Sat'])
    const ShiftZ = z.object({
      id: z.string(),
      person: z.string().min(1),
      agentId: z.string().min(1).optional(),
      day: DayZ,
      start: z.string().regex(HHMM),
      end: z.string().regex(HHMM),
      endDay: DayZ.optional(),
      segments: z.array(z.object({
        id: z.string(), shiftId: z.string(), taskId: z.string(), startOffsetMin: z.number().int().min(0), durationMin: z.number().int().min(1), notes: z.string().optional()
      })).optional(),
    }).superRefine((val, ctx)=>{
      // start must not be 24:00; end may be 24:00; both HH:MM already ensured
      if(val.start === '24:00') ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'start cannot be 24:00', path: ['start'] })
      // sanity window: 00:00..24:00; handled by regex, but ensure 00<=mm<60
      const [sh, sm] = val.start.split(':').map(Number)
      const [eh, em] = val.end.split(':').map(Number)
      if(sm>=60) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'invalid minutes in start', path: ['start'] })
      if(em>=60) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'invalid minutes in end', path: ['end'] })
      if(eh===24 && em!==0) ctx.addIssue({ code: z.ZodIssueCode.custom, message: '24:00 must be exact', path: ['end'] })
    })
    const PTOZ = z.object({ id: z.string(), person: z.string().min(1), agentId: z.string().min(1).optional(), startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), notes: z.string().optional() })
    const CalSegZ = z.object({ person: z.string(), agentId: z.string().min(1).optional(), day: DayZ, start: z.string().regex(HHMM), end: z.string().regex(HHMM), taskId: z.string() }).superRefine((val, ctx)=>{
      if(val.start === '24:00') ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'start cannot be 24:00', path: ['start'] })
      const [sh, sm] = val.start.split(':').map(Number)
      const [eh, em] = val.end.split(':').map(Number)
      if(sm>=60) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'invalid minutes in start', path: ['start'] })
      if(em>=60) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'invalid minutes in end', path: ['end'] })
      if(eh===24 && em!==0) ctx.addIssue({ code: z.ZodIssueCode.custom, message: '24:00 must be exact', path: ['end'] })
      // allow end < start (wrap) for posture segments, but disallow equal times
      if(val.start === val.end) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'segment start and end cannot be equal', path: ['start'] })
    })
    const DocZ = z.object({
      schemaVersion: z.number().int().min(1).default(1),
      shifts: z.array(ShiftZ),
      pto: z.array(PTOZ),
      calendarSegs: z.array(CalSegZ).default([]).optional(),
      updatedAt: z.string().optional(),
    })
    const parsed = DocZ.safeParse(body)
    if (!parsed.success) return res.status(400).json({ error: 'invalid_body', details: parsed.error.flatten() })
    // Concurrency check: updatedAt must be >= stored updatedAt if present
    try {
      const prevRaw = fs.readFileSync(dataFile, 'utf8')
      const prev = JSON.parse(prevRaw)
      if (prev?.updatedAt && body?.updatedAt && new Date(body.updatedAt) < new Date(prev.updatedAt)) {
        return res.status(409).json({ error: 'conflict', prevUpdatedAt: prev.updatedAt })
      }
      // Build previous name->id mapping to help backfill
      var prevNameToId = new Map()
      const take = (arr)=>{ try{ for(const r of (arr||[])){ if(r && r.person && r.agentId){ const key=(r.person||'').trim().toLowerCase(); if(!prevNameToId.has(key)) prevNameToId.set(key, r.agentId) } } }catch{} }
      take(prev?.shifts); take(prev?.pto); take(prev?.calendarSegs)
    } catch {}

    // Referential integrity within payload: enforce consistent mapping between person and agentId
    const nameToId = new Map()
    const idToName = new Map()
    function addPair(name, id, where){
      if(!name || !id) return
      const key = name.trim().toLowerCase()
      const existingId = nameToId.get(key)
      if(existingId && existingId !== id){ throw { type:'name_conflict', name, a: existingId, b: id, where } }
      nameToId.set(key, id)
      const existingName = idToName.get(id)
      if(existingName && existingName !== key){ throw { type:'id_conflict', id, a: existingName, b: key, where } }
      idToName.set(id, key)
    }
    const doc = parsed.data
    try{
      for(const s of doc.shifts){ if(s.agentId) addPair(s.person, s.agentId, { kind:'shift', id:s.id }) }
      for(const p of doc.pto){ if(p.agentId) addPair(p.person, p.agentId, { kind:'pto', id:p.id }) }
      for(const c of (doc.calendarSegs||[])){ if(c.agentId) addPair(c.person, c.agentId, { kind:'cal', person:c.person, day:c.day, start:c.start, end:c.end }) }
    }catch(err){ if(err && (err.type==='name_conflict' || err.type==='id_conflict')){ return res.status(400).json({ error:'agent_mapping_conflict', details: err }) } }

    // Backfill missing agentIds from current mapping or previous file mapping
    const fillIdForName = (name)=>{
      const key = (name||'').trim().toLowerCase()
      return nameToId.get(key) || prevNameToId?.get(key) || undefined
    }
    for(const s of doc.shifts){ if(!s.agentId){ const id=fillIdForName(s.person); if(id) s.agentId=id } }
    for(const p of doc.pto){ if(!p.agentId){ const id=fillIdForName(p.person); if(id) p.agentId=id } }
    for(const c of (doc.calendarSegs||[])){ if(!c.agentId){ const id=fillIdForName(c.person); if(id) c.agentId=id } }

    // Normalize endDay for shifts: if end <= start and end !== '24:00', shift ends next day; else endDay = day
    for(const s of doc.shifts){
      const sMin = hhmmToMin(s.start)
      const eMin = hhmmToMin(s.end)
      if(Number.isNaN(sMin) || Number.isNaN(eMin)) continue
      if(eMin === 1440){
        // ends exactly at midnight of next day; keep endDay = day by convention
        if(!s.endDay) s.endDay = s.day
      } else if(eMin <= sMin){
        s.endDay = s.endDay || nextDayOf(s.day)
      } else {
        s.endDay = s.endDay || s.day
      }
    }

    // Ensure unique shift ids
    const seenShiftIds = new Set()
    for(const s of doc.shifts){ if(seenShiftIds.has(s.id)){ return res.status(400).json({ error:'duplicate_shift_id', id:s.id }) } seenShiftIds.add(s.id) }

    // Persist an agentsIndex (name->id) for future backfills and bump schemaVersion
    const agentsIndex = {}
    for(const [k,v] of nameToId){ agentsIndex[k]=v }
    const toWrite = { ...doc, schemaVersion: Math.max(2, doc.schemaVersion||1), agentsIndex }

    backupFile()
    fs.writeFileSync(dataFile, JSON.stringify(toWrite, null, 2))
    const ts = new Date().toISOString()
    res.status(200).json({ ok: true, updatedAt: ts })
  // Notify any listeners to refresh
  setImmediate(()=> sseBroadcast('updated', { ts }))
  } catch {
    res.status(500).json({ error: 'write_failed' })
  }
})

// Admin: seed from a fixture (demo/data/snapshot)
app.post('/api/admin/seed', requireAdmin, (req, res) => {
  try{
    const ds = (req.query.dataset||'').toString() || 'demo'
    const src = path.join(dataDir, `${ds}.json`)
    if(!fs.existsSync(src)) return res.status(404).json({ error: 'not_found', dataset: ds })
    backupFile()
    const raw = fs.readFileSync(src,'utf8')
    fs.writeFileSync(dataFile, raw, 'utf8')
    const ts = new Date().toISOString()
    setImmediate(()=> sseBroadcast('updated', { ts }))
    res.json({ ok:true, dataset: ds, updatedAt: ts })
  }catch{ res.status(500).json({ error: 'seed_failed' }) }
})

// Admin: export current file
app.get('/api/admin/export', requireAdmin, (req, res) => {
  try{
    const raw = fs.readFileSync(dataFile,'utf8')
    res.setHeader('Content-Disposition', `attachment; filename="${dataBase}.json"`)
    res.type('application/json').send(raw)
  }catch{ res.status(500).json({ error: 'export_failed' }) }
})

// Admin: import uploaded JSON
app.post('/api/admin/import', requireAdmin, (req, res) => {
  try{
    const body = req.body
    if(typeof body !== 'object' || body===null) return res.status(400).json({ error: 'invalid_body' })
    // Reuse schemas from write handler
    const HHMM = /^\d{2}:\d{2}$/
    const DayZ = z.enum(['Sun','Mon','Tue','Wed','Thu','Fri','Sat'])
    const ShiftZ = z.object({
      id: z.string(), person: z.string().min(1), agentId: z.string().min(1).optional(), day: DayZ,
      start: z.string().regex(HHMM), end: z.string().regex(HHMM), endDay: DayZ.optional(),
      segments: z.array(z.object({ id: z.string(), shiftId: z.string(), taskId: z.string(), startOffsetMin: z.number().int().min(0), durationMin: z.number().int().min(1), notes: z.string().optional() })).optional(),
    }).superRefine((val, ctx)=>{
      if(val.start === '24:00') ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'start cannot be 24:00', path: ['start'] })
      const [sh, sm] = val.start.split(':').map(Number)
      const [eh, em] = val.end.split(':').map(Number)
      if(sm>=60) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'invalid minutes in start', path: ['start'] })
      if(em>=60) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'invalid minutes in end', path: ['end'] })
      if(eh===24 && em!==0) ctx.addIssue({ code: z.ZodIssueCode.custom, message: '24:00 must be exact', path: ['end'] })
    })
    const PTOZ = z.object({ id: z.string(), person: z.string().min(1), agentId: z.string().min(1).optional(), startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), notes: z.string().optional() })
    const CalSegZ = z.object({ person: z.string(), agentId: z.string().min(1).optional(), day: DayZ, start: z.string().regex(HHMM), end: z.string().regex(HHMM), taskId: z.string() }).superRefine((val, ctx)=>{
      if(val.start === '24:00') ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'start cannot be 24:00', path: ['start'] })
      const [sh, sm] = val.start.split(':').map(Number)
      const [eh, em] = val.end.split(':').map(Number)
      if(sm>=60) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'invalid minutes in start', path: ['start'] })
      if(em>=60) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'invalid minutes in end', path: ['end'] })
      if(eh===24 && em!==0) ctx.addIssue({ code: z.ZodIssueCode.custom, message: '24:00 must be exact', path: ['end'] })
      if(val.start === val.end) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'segment start and end cannot be equal', path: ['start'] })
    })
    const DocZ = z.object({ schemaVersion: z.number().int().min(1).default(1), shifts: z.array(ShiftZ), pto: z.array(PTOZ), calendarSegs: z.array(CalSegZ).default([]).optional(), updatedAt: z.string().optional() })
    const parsed = DocZ.safeParse(body)
    if(!parsed.success) return res.status(400).json({ error:'invalid_body', details: parsed.error.flatten() })
    const doc = parsed.data
    // Name/id consistency and backfill
    const nameToId = new Map(); const idToName = new Map()
    function addPair(name,id){ if(!name||!id) return; const k=name.trim().toLowerCase(); const ex=nameToId.get(k); if(ex&&ex!==id) throw new Error('agent_mapping_conflict'); nameToId.set(k,id); const exn=idToName.get(id); if(exn&&exn!==k) throw new Error('agent_mapping_conflict') }
    for(const s of doc.shifts){ if(s.agentId) addPair(s.person, s.agentId) }
    for(const p of doc.pto){ if(p.agentId) addPair(p.person, p.agentId) }
    for(const c of (doc.calendarSegs||[])){ if(c.agentId) addPair(c.person, c.agentId) }
    const agentsIndex = {}; for(const [k,v] of nameToId){ agentsIndex[k]=v }
    // endDay normalization
    for(const s of doc.shifts){ const sMin=hhmmToMin(s.start), eMin=hhmmToMin(s.end); if(Number.isNaN(sMin)||Number.isNaN(eMin)) continue; if(eMin===1440){ if(!s.endDay) s.endDay=s.day } else if(eMin<=sMin){ s.endDay=s.endDay||nextDayOf(s.day) } else { s.endDay=s.endDay||s.day } }
    // Unique ids
    const seen = new Set(); for(const s of doc.shifts){ if(seen.has(s.id)) return res.status(400).json({ error:'duplicate_shift_id', id:s.id }); seen.add(s.id) }
    backupFile()
    fs.writeFileSync(dataFile, JSON.stringify({ ...doc, schemaVersion: Math.max(2, doc.schemaVersion||1), agentsIndex }, null, 2), 'utf8')
    const ts = new Date().toISOString()
    setImmediate(()=> sseBroadcast('updated', { ts }))
    res.json({ ok:true, updatedAt: ts })
  }catch(err){ res.status(500).json({ error: 'import_failed' }) }
})

app.listen(PORT, () => {
  console.log(`Dev auth proxy listening on http://localhost:${PORT}`)
  console.log(`Allowed origins: ${ORIGINS.join(', ')}`)
  console.log('Routes:')
  console.log('  POST /api/login-site  (sets site_sid)')
  console.log('  POST /api/logout-site (clears site_sid)')
  console.log('  POST /api/login       (sets sid + csrf)')
  console.log('  POST /api/logout      (clears sid + csrf)')
  console.log('  GET  /api/schedule    (requires site session)')
  console.log('  POST /api/schedule    (requires admin session + CSRF)')
  console.log('  GET  /api/events      (SSE; requires site session)')
  console.log('  POST /api/admin/seed  (requires admin; dataset=demo|data|snapshot)')
  console.log('  GET  /api/admin/export(requires admin)')
  console.log('  POST /api/admin/import(requires admin)')
  console.log(`  DATASET file: ${dataFile}`)
})
