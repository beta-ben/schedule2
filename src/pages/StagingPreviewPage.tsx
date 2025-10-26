import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { DAYS } from '../constants'
import type { PTO, Shift, Override } from '../types'
import { applyOverrides, clamp, fmtNice, fmtYMD, minToHHMM, nowInTZ, parseYMD, shiftsForDayInTZ, toMin, tzAbbrev } from '../lib/utils'
import { computeSlimlineShifts } from '../lib/scheduleView'

const MINUTES_PER_DAY = 24 * 60
const PX_PER_MINUTE = 1.1
const ROW_HEIGHT = 36
const AXIS_HEIGHT = 56
const STICKY_OFFSET = 64
const MAX_OFFSET_MIN = 12 * 60
const PLAY_SPEED_MIN_PER_SEC = 240

type Props = {
  dark: boolean
  weekStart: string
  shifts: Shift[]
  pto: PTO[]
  overrides?: Override[]
  tz: { id: string; label: string; offset: number }
  agents?: Array<{ id?: string; firstName?: string; lastName?: string; hidden?: boolean }>
}

export default function StagingPreviewPage({
  dark,
  weekStart,
  shifts,
  pto,
  overrides,
  tz,
  agents,
}: Props){
  const [clockTick, setClockTick] = useState(()=> Date.now())
  const [timeOffsetMin, setTimeOffsetMin] = useState(0)
  const [playState, setPlayState] = useState<'paused'|'forward'|'reverse'>('paused')
  useEffect(()=>{
    let timeoutId: number | undefined
    let intervalId: number | undefined
    const sync = ()=> setClockTick(Date.now())
    const schedule = ()=>{
      if(intervalId) window.clearInterval(intervalId)
      if(timeoutId) window.clearTimeout(timeoutId)
      const now = Date.now()
      const msToNextMinute = 60000 - (now % 60000)
      timeoutId = window.setTimeout(()=>{
        sync()
        intervalId = window.setInterval(sync, 60000)
      }, msToNextMinute)
    }
    sync()
    schedule()
    const onVis = ()=>{ if(document.visibilityState === 'visible'){ sync(); schedule() } }
    document.addEventListener('visibilitychange', onVis)
    return ()=>{
      document.removeEventListener('visibilitychange', onVis)
      if(intervalId) window.clearInterval(intervalId)
      if(timeoutId) window.clearTimeout(timeoutId)
    }
  }, [])

  const rafRef = useRef<number>()
  const lastFrameRef = useRef<number>()
  useEffect(()=>{
    if(playState === 'paused'){
      if(rafRef.current){ cancelAnimationFrame(rafRef.current); rafRef.current = undefined }
      lastFrameRef.current = undefined
      return
    }
    const speed = playState === 'forward' ? PLAY_SPEED_MIN_PER_SEC : -PLAY_SPEED_MIN_PER_SEC
    const step = (ts: number)=>{
      const last = lastFrameRef.current ?? ts
      const deltaSec = (ts - last) / 1000
      lastFrameRef.current = ts
      setTimeOffsetMin(prev=>{
        const next = clamp(prev + speed * deltaSec, -MAX_OFFSET_MIN, MAX_OFFSET_MIN)
        return Math.round(next)
      })
      rafRef.current = requestAnimationFrame(step)
    }
    rafRef.current = requestAnimationFrame(step)
    return ()=>{
      if(rafRef.current){ cancelAnimationFrame(rafRef.current); rafRef.current = undefined }
      lastFrameRef.current = undefined
    }
  }, [playState])

  useEffect(()=>{
    if(playState !== 'paused' && (timeOffsetMin <= -MAX_OFFSET_MIN || timeOffsetMin >= MAX_OFFSET_MIN)){
      setPlayState('paused')
    }
  }, [timeOffsetMin, playState])

  const now = useMemo(()=>{
    const base = nowInTZ(tz.id)
    const totalMinutes = base.minutes + timeOffsetMin
    const normalizedMinutes = ((totalMinutes % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY
    const dayOffset = Math.floor((totalMinutes - normalizedMinutes) / MINUTES_PER_DAY)
    const baseDate = parseYMD(base.ymd)
    baseDate.setHours(base.h, base.m, 0, 0)
    const shiftedDate = new Date(baseDate.getTime() + dayOffset * MINUTES_PER_DAY * 60000)
    const h = Math.floor(normalizedMinutes / 60)
    const m = normalizedMinutes % 60
    shiftedDate.setHours(h, m, 0, 0)
    const weekdayShort = DAYS[shiftedDate.getDay()] as (typeof DAYS)[number]
    return {
      ...base,
      minutes: normalizedMinutes,
      h,
      m,
      weekdayShort,
      y: shiftedDate.getFullYear(),
      mo: shiftedDate.getMonth() + 1,
      d: shiftedDate.getDate(),
      ymd: fmtYMD(shiftedDate),
    }
  }, [tz.id, clockTick, timeOffsetMin])
  const dayKey = now.weekdayShort as (typeof DAYS)[number]
  const currentDate = useMemo(()=> parseYMD(now.ymd), [now.ymd])

  const effectiveShifts = useMemo(
    ()=> applyOverrides(shifts, overrides || [], weekStart, agents || []),
    [shifts, overrides, weekStart, agents]
  )

  const hiddenNames = useMemo(()=>{
    const set = new Set<string>()
    for(const agent of agents || []){
      const full = [agent.firstName || '', agent.lastName || ''].filter(Boolean).join(' ').trim()
      if(full && agent.hidden){
        set.add(full)
      }
    }
    return set
  }, [agents])

  const dayShifts = useMemo(()=>{
    const base = shiftsForDayInTZ(effectiveShifts, dayKey as any, tz.offset)
      .slice()
      .sort((a,b)=> toMin(a.start) - toMin(b.start))
    return base.filter(s=> !hiddenNames.has(s.person))
  }, [effectiveShifts, dayKey, tz.offset, hiddenNames])

  const slimlineState = useMemo(()=>{
    return computeSlimlineShifts({
      shifts: dayShifts,
      dayKey,
      tzId: tz.id,
      pto,
      now,
    })
  }, [dayShifts, dayKey, tz.id, pto, now.minutes, now.ymd])

  const people = slimlineState.people
  const slimlineShifts = slimlineState.shifts

  const rowData = useMemo(()=>{
    const byPerson = new Map<string, Shift[]>()
    for(const shift of slimlineShifts){
      const arr = byPerson.get(shift.person)
      if(arr){
        arr.push(shift)
      }else{
        byPerson.set(shift.person, [shift])
      }
    }
    return people.map(person=>{
      const entries = (byPerson.get(person) || []).slice()
      entries.sort((a,b)=> toMin(a.start) - toMin(b.start))
      return { person, shifts: entries }
    })
  }, [slimlineShifts, people])

  const colorMap = useMemo(()=>{
    const total = Math.max(1, people.length)
    const m = new Map<string, number>()
    people.forEach((person, idx)=>{
      const hue = Math.round((idx / total) * 360)
      m.set(person, hue)
    })
    return m
  }, [people])

  const containerRef = useRef<HTMLDivElement|null>(null)
  const [containerWidth, setContainerWidth] = useState(0)
  useEffect(()=>{
    const update = ()=>{
      if(containerRef.current){
        setContainerWidth(containerRef.current.clientWidth)
      }
    }
    update()
    window.addEventListener('resize', update)
    return ()=> window.removeEventListener('resize', update)
  }, [])

  const [mounted, setMounted] = useState(false)
  useEffect(()=>{ setMounted(true) }, [])

  const pxPerMinute = useMemo(()=>{
    if(containerWidth <= 0) return PX_PER_MINUTE
    const ideal = containerWidth / MINUTES_PER_DAY
    return Math.min(PX_PER_MINUTE, Math.max(0.7, ideal))
  }, [containerWidth])

  const timelineWidth = MINUTES_PER_DAY * pxPerMinute
  const desiredTranslate = (containerWidth / 2) - (now.minutes * pxPerMinute)
  const freeSpace = containerWidth - timelineWidth
  const margin = 32
  const [minTranslate, maxTranslate] = freeSpace >= 0
    ? [freeSpace / 2, freeSpace / 2]
    : [Math.min(0, containerWidth - timelineWidth + margin), Math.min(margin, 0)]
  const translateX = Math.min(Math.max(desiredTranslate, minTranslate), maxTranslate)
  const sharedTransform: React.CSSProperties = {
    transform: `translateX(${Number.isFinite(translateX) ? translateX : 0}px)`,
    transition: mounted ? 'transform 0.6s ease-out' : undefined,
    willChange: 'transform',
  }

  const nowClock = `${minToHHMM(now.minutes)} ${now.h >= 12 ? 'PM' : 'AM'}`
  const tzLabel = tzAbbrev(tz.id)

  const nudgeOffset = useCallback((delta: number)=>{
    setPlayState('paused')
    setTimeOffsetMin(prev=> Math.round(clamp(prev + delta, -MAX_OFFSET_MIN, MAX_OFFSET_MIN)))
  }, [])

  const togglePlay = useCallback((direction: 'forward' | 'reverse')=>{
    setPlayState(prev=> prev === direction ? 'paused' : direction)
  }, [])

  const resetOffset = useCallback(()=>{
    setPlayState('paused')
    setTimeOffsetMin(0)
  }, [])

  const offsetLabel = useMemo(()=>{
    if(Math.abs(timeOffsetMin) < 1) return 'Live'
    const abs = Math.abs(timeOffsetMin)
    const sign = timeOffsetMin > 0 ? '+' : '-'
    const hours = Math.floor(abs / 60)
    const minutes = Math.floor(abs % 60)
    return `${sign}${String(hours).padStart(2,'0')}:${String(minutes).padStart(2,'0')}`
  }, [timeOffsetMin])

  const controlButton = (active: boolean)=> [
    'h-8 px-2 rounded-md border text-xs font-semibold transition pointer-events-auto',
    dark
      ? active ? 'bg-red-500/80 border-red-500 text-black' : 'bg-neutral-900/90 border-neutral-700 text-neutral-200 hover:bg-neutral-800'
      : active ? 'bg-red-500 text-white border-red-500' : 'bg-white/90 border-neutral-300 text-neutral-700 hover:bg-neutral-100'
  ].join(' ')

  const nudgeButton = dark
    ? 'h-8 px-2 rounded-md border bg-neutral-900/90 border-neutral-700 text-neutral-200 hover:bg-neutral-800 pointer-events-auto text-xs font-semibold'
    : 'h-8 px-2 rounded-md border bg-white/90 border-neutral-300 text-neutral-700 hover:bg-neutral-100 pointer-events-auto text-xs font-semibold'

  const offsetBadgeClass = [
    'px-2 py-0.5 rounded-md text-xs font-semibold pointer-events-auto border',
    dark ? 'bg-neutral-900/90 border-neutral-700 text-neutral-200' : 'bg-white/90 border-neutral-300 text-neutral-700'
  ].join(' ')

  const surfaceCls = [
    'rounded-2xl p-4 border space-y-4',
    dark ? 'bg-neutral-900 border-neutral-800 text-neutral-100' : 'bg-white border-neutral-200 text-neutral-900'
  ].join(' ')
  const subTextCls = dark ? 'text-neutral-400' : 'text-neutral-500'
  const lineColor = dark ? 'rgba(220,38,38,0.6)' : 'rgba(220,38,38,0.8)'

  return (
    <section className={surfaceCls}>
      <header className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2">
        <div>
          <div className="text-sm uppercase tracking-wide font-semibold text-red-500">Preview</div>
          <h1 className="text-2xl font-semibold leading-tight">Flow View</h1>
          <div className={["text-sm", subTextCls].join(' ')}>
            {dayKey} · {fmtNice(currentDate)}
          </div>
        </div>
        <div className="text-sm sm:text-base font-medium">
          <span className={dark ? 'text-neutral-300' : 'text-neutral-700'}>Now</span>
          <span className="mx-2 text-lg font-semibold">{nowClock}</span>
          <span className={subTextCls}>{tzLabel}</span>
        </div>
      </header>

      <div className="relative">
        <div className="sticky z-40" style={{ top: STICKY_OFFSET }}>
          <div className="grid grid-cols-[auto_1fr] gap-3 items-end">
            <div className="flex items-end pr-3" style={{ height: AXIS_HEIGHT }}>
              <div className={["px-2 py-1 rounded-md text-xs font-semibold uppercase tracking-wide shadow-sm", dark ? 'bg-neutral-800/95 text-neutral-200 border border-neutral-700' : 'bg-white/95 text-neutral-700 border border-neutral-200'].join(' ')}>
                Flow timeline
              </div>
            </div>
            <div
              className={[
                'relative rounded-2xl border overflow-hidden shadow-sm',
                dark ? 'bg-neutral-900/96 border-neutral-700/80 backdrop-blur' : 'bg-white/95 border-neutral-200 backdrop-blur'
              ].join(' ')}
              style={{ height: AXIS_HEIGHT }}
            >
              <div className="absolute inset-y-2 left-1/2 w-px" style={{ backgroundColor: lineColor }} />
              <div className="absolute left-1/2 top-2 -translate-x-1/2">
                <div className={["px-2 py-0.5 rounded text-xs font-semibold shadow-sm", dark ? 'bg-red-500/90 text-black' : 'bg-red-500 text-white'].join(' ')}>
                  Now
                </div>
              </div>
              <div className="absolute top-2 right-2 flex items-center gap-1 pointer-events-auto">
                <span className={offsetBadgeClass}>{offsetLabel}</span>
                <button
                  type="button"
                  className={controlButton(playState==='reverse')}
                  onClick={()=> togglePlay('reverse')}
                  title="Rewind"
                >
                  ⏪
                </button>
                <button type="button" className={nudgeButton} onClick={()=> nudgeOffset(-60)} title="-1 hour">−1h</button>
                <button type="button" className={nudgeButton} onClick={()=> nudgeOffset(-15)} title="-15 minutes">−15m</button>
                <button type="button" className={nudgeButton} onClick={resetOffset} title="Return to now">Reset</button>
                <button type="button" className={nudgeButton} onClick={()=> nudgeOffset(15)} title="+15 minutes">+15m</button>
                <button type="button" className={nudgeButton} onClick={()=> nudgeOffset(60)} title="+1 hour">+1h</button>
                <button
                  type="button"
                  className={controlButton(playState==='forward')}
                  onClick={()=> togglePlay('forward')}
                  title="Fast forward"
                >
                  ⏩
                </button>
              </div>
              <div className="absolute inset-0 pointer-events-none" style={{ width: timelineWidth, ...sharedTransform }}>
                {Array.from({ length: 25 }, (_, hour)=> hour).map(hour=>{
                  const left = hour * 60 * pxPerMinute
                  const label = hour === 0 ? '12 AM' : hour < 12 ? `${hour} AM` : hour === 12 ? '12 PM' : `${hour - 12} PM`
                  return (
                    <div key={hour} className="absolute inset-y-0" style={{ left }}>
                      <div className="absolute inset-y-2 w-px" style={{ backgroundColor: dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)' }} />
                      <div className={["absolute bottom-2 left-1/2 -translate-x-1/2 text-xs font-medium whitespace-nowrap", dark ? 'text-neutral-300' : 'text-neutral-600'].join(' ')}>
                        {label}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-[auto_1fr] gap-3 mt-4">
          <div>
            {rowData.length === 0 ? (
              <div className={["text-sm", subTextCls].join(' ')}>No one on deck right now.</div>
            ) : (
              rowData.map(row=>(
                <div
                  key={row.person}
                  className="flex items-center pr-3"
                  style={{ height: ROW_HEIGHT }}
                >
                  <span className="truncate text-sm font-medium">{row.person}</span>
                </div>
              ))
            )}
          </div>
          <div
            ref={containerRef}
            className={["relative overflow-hidden rounded-2xl border", dark ? 'border-neutral-800 bg-neutral-950/40' : 'border-neutral-200 bg-neutral-50'].join(' ')}
          >
            <div className="relative" style={{ height: Math.max(ROW_HEIGHT, rowData.length * ROW_HEIGHT) }}>
              <div className="absolute inset-0" style={{ width: timelineWidth, ...sharedTransform }}>
                <div
                  className="absolute inset-0 pointer-events-none"
                  style={{
                    backgroundImage: `repeating-linear-gradient(to right, ${dark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)'} 0, ${dark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)'} ${pxPerMinute * 30}px, transparent ${pxPerMinute * 30}px, transparent ${pxPerMinute * 60}px)`,
                  }}
                />
                <div className="absolute inset-y-0 left-1/2 w-px pointer-events-none" style={{ backgroundColor: lineColor }} />
                {rowData.map((row, rowIdx)=>(
                  <div key={row.person} className="absolute left-0 right-0" style={{ top: rowIdx * ROW_HEIGHT, height: ROW_HEIGHT }}>
                    {row.shifts.map(shift=>{
                      const startMin = toMin(shift.start)
                      const endRaw = shift.end === '24:00' ? 1440 : toMin(shift.end)
                      const endMin = endRaw > startMin || shift.end === '24:00' ? endRaw : endRaw + 1440
                      const clampedStart = Math.max(0, Math.min(MINUTES_PER_DAY, startMin))
                      const clampedEnd = Math.max(clampedStart, Math.min(MINUTES_PER_DAY, endMin))
                      const left = clampedStart * pxPerMinute
                      const width = Math.max(12, (clampedEnd - clampedStart) * pxPerMinute)
                      const hue = colorMap.get(shift.person) ?? 0
                      const isActive = now.minutes >= clampedStart && now.minutes < clampedEnd
                      const bg = isActive
                        ? `hsl(${hue}, 80%, ${dark ? 48 : 55}%)`
                        : `hsla(${hue}, 70%, ${dark ? 35 : 75}%, ${dark ? 0.75 : 0.9})`
                      const border = `hsl(${hue}, 70%, ${dark ? 60 : 55}%)`
                      const actualLeft = left + translateX
                      const minEdgePadding = 8
                      const desiredInset = actualLeft < minEdgePadding ? (minEdgePadding - actualLeft) : minEdgePadding
                      const inset = Math.min(desiredInset, Math.max(minEdgePadding, width - 10))
                      return (
                        <div
                          key={`${shift.id}-${shift.start}-${shift.end}`}
                          className="absolute top-1 bottom-1 rounded-lg border flex items-center text-sm font-medium"
                          style={{
                            left,
                            width,
                            background: bg,
                            borderColor: border,
                            color: dark ? '#fff' : '#111',
                            boxShadow: isActive ? '0 0 0 1px rgba(255,255,255,0.15)' : undefined,
                          }}
                          title={`${shift.person} • ${shift.start}–${shift.end}`}
                        >
                          <span
                            className="truncate"
                            style={{
                              marginLeft: inset,
                              marginRight: 8,
                              whiteSpace: 'nowrap',
                              textShadow: dark ? '0 0 6px rgba(0,0,0,0.45)' : '0 0 4px rgba(255,255,255,0.8)',
                            }}
                          >
                            {shift.start} – {shift.end}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
