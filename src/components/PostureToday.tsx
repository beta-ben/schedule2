import React, { useEffect, useMemo, useState } from 'react'
import type { Shift, Task } from '../types'
import type { CalendarSegmentSlice } from '../lib/utils'
import { nowInTZ, toMin, tzAbbrev, agentDisplayName } from '../lib/utils'
import { useTimeFormat } from '../context/TimeFormatContext'
import { useThemeBase } from '../hooks/useThemeBase'

const EMPTY_AGENTS: [] = []

export default function PostureToday({ dark, tz, dayKey: _dayKey, shifts, tasks, calendarSegs, agents }:{
  dark: boolean
  tz: { id:string; label:string; offset:number }
  dayKey: string
  shifts: Shift[]
  tasks: Task[]
  calendarSegs?: CalendarSegmentSlice[]
  agents?: Array<{ id?: string; firstName?: string; lastName?: string }>
}){
  const [nowTick, setNowTick] = useState(Date.now())
  useEffect(()=>{
    let to: number | undefined
    let iv: number | undefined
    const poke = ()=> setNowTick(Date.now())
    const schedule = ()=>{
      if(iv) clearInterval(iv)
      if(to) clearTimeout(to)
      const now = Date.now()
      const msToNextMinute = 60000 - (now % 60000)
      to = window.setTimeout(()=>{ poke(); iv = window.setInterval(poke, 60000) }, msToNextMinute)
    }
    const onVis = ()=>{ if(document.visibilityState==='visible'){ poke(); schedule() } }
    poke(); schedule(); document.addEventListener('visibilitychange', onVis)
    return ()=>{ if(iv) clearInterval(iv); if(to) clearTimeout(to); document.removeEventListener('visibilitychange', onVis) }
  },[])
  const nowTz = nowInTZ(tz.id)
  const nowMin = nowTz.minutes
  const { formatTime } = useTimeFormat()
  const themeBase = useThemeBase()
  const isNight = themeBase === 'night'
  const isNoir = themeBase === 'noir'
  const isPrism = themeBase === 'prism'

  // Map task id to display info
  const taskMap = useMemo(()=>{
    const m = new Map<string, Task>()
    tasks.forEach(t=> m.set(t.id, t))
    return m
  },[tasks])

  const agentList = agents ?? EMPTY_AGENTS

  type SegRec = {
    taskId:string
    person:string
    displayName:string
    agentId?: string
    start:number
    end:number
  }

  const segs: SegRec[] = useMemo(()=>{
    const daySegs = calendarSegs || []
    const out: SegRec[] = []
    if(daySegs.length>0){
      for(const seg of daySegs){
        const start = Math.max(0, Math.min(1440, toMin(seg.start)))
        const rawEnd = seg.end === '24:00' ? 1440 : toMin(seg.end)
        const end = Math.max(start, Math.min(1440, rawEnd))
        if(end <= start) continue
        const displayName = agentDisplayName(agentList, seg.agentId, seg.person)
        out.push({
          taskId: seg.taskId,
          person: seg.person,
          displayName: displayName || seg.person,
          agentId: seg.agentId,
          start,
          end
        })
      }
    }
    if(out.length===0){
      for(const s of shifts){
        if(!Array.isArray(s.segments) || s.segments.length===0) continue
        const sAbs = toMin(s.start)
        for(const seg of s.segments){
          const startAbs = sAbs + seg.startOffsetMin
          const endAbs = startAbs + seg.durationMin
          const start = Math.max(0, Math.min(1440, startAbs))
          const end = Math.max(start, Math.min(1440, endAbs))
          if(end <= start) continue
          out.push({
            taskId: seg.taskId,
            person: s.person,
            displayName: s.person,
            start,
            end
          })
        }
      }
    }
    return out.sort((a,b)=> a.start - b.start || a.end - b.end || a.displayName.localeCompare(b.displayName))
  },[calendarSegs, shifts, agentList])

  type CoverageGap = { start:number; end:number }
  type PlacedSeg = SegRec & { lane:number; startClamped:number; endClamped:number }
  type TimelineEntry = {
    taskId: string
    placed: PlacedSeg[]
    laneCount: number
    onNow: SegRec[]
    nextOne: SegRec | null
    earliest: number
    coverageGaps: CoverageGap[]
    totalCoverageMin: number
    nextGap: CoverageGap | null
  }

  const timelineData = useMemo(()=>{
    const grouped = new Map<string, SegRec[]>()
    for(const rec of segs){
      const arr = grouped.get(rec.taskId)
      if(arr) arr.push(rec)
      else grouped.set(rec.taskId, [rec])
    }

    const entries: TimelineEntry[] = []
    const activeSegments: PlacedSeg[] = []
    let globalNextSegment: { taskId:string; seg:PlacedSeg } | null = null
    let globalNextGap: { taskId:string; gap:CoverageGap } | null = null

    for(const [taskId, list] of grouped.entries()){
      const sorted = list.slice().sort((a,b)=> a.start - b.start || a.end - b.end || a.displayName.localeCompare(b.displayName))
      const laneEnds: number[] = []
      const placed: PlacedSeg[] = []
      const onNow: SegRec[] = []
      const coverageGaps: CoverageGap[] = []
      let nextOne: SegRec | null = null
      let earliest = Number.POSITIVE_INFINITY
      let coverageCursor = 0
      let totalCoverageMin = 0

      for(const rec of sorted){
        const startClamped = Math.max(0, Math.min(1440, rec.start))
        const endClamped = Math.max(startClamped, Math.min(1440, rec.end))
        if(endClamped <= startClamped) continue
        if(rec.start < earliest) earliest = rec.start
        if(startClamped > coverageCursor + 0.5){
          coverageGaps.push({ start: coverageCursor, end: startClamped })
        }
        coverageCursor = Math.max(coverageCursor, endClamped)
        totalCoverageMin += endClamped - startClamped
        const lane = (()=>{
          let candidate = 0
          for(; candidate<laneEnds.length; candidate++){
            if(startClamped >= laneEnds[candidate] - 0.5) break
          }
          if(candidate===laneEnds.length){
            laneEnds.push(endClamped)
          }else{
            laneEnds[candidate] = endClamped
          }
          return candidate
        })()
        const placedSeg: PlacedSeg = { ...rec, lane, startClamped, endClamped }
        placed.push(placedSeg)
        if(rec.start <= nowMin && nowMin < rec.end){
          onNow.push(rec)
          activeSegments.push(placedSeg)
        }else if(startClamped > nowMin){
          if(!nextOne || startClamped < Math.max(0, Math.min(1440, nextOne.start))){
            nextOne = rec
          }
          if(!globalNextSegment || startClamped < globalNextSegment.seg.startClamped){
            globalNextSegment = { taskId, seg: placedSeg }
          }
        }
      }

      if(coverageCursor < 1440 - 0.5){
        coverageGaps.push({ start: coverageCursor, end: 1440 })
      }

      coverageGaps.sort((a,b)=> a.start - b.start)
      const nextGap = coverageGaps.find(g=> g.start >= nowMin - 0.5 && g.end - g.start >= 1) || null
      if(nextGap && (!globalNextGap || nextGap.start < globalNextGap.gap.start)){
        globalNextGap = { taskId, gap: nextGap }
      }

      if(placed.length>0){
        entries.push({
          taskId,
          placed,
          laneCount: Math.max(1, laneEnds.length || 1),
          onNow: onNow.sort((a,b)=> a.end - b.end || a.displayName.localeCompare(b.displayName)),
          nextOne,
          earliest: Number.isFinite(earliest) ? earliest : Number.POSITIVE_INFINITY,
          coverageGaps,
          totalCoverageMin,
          nextGap
        })
      }
    }

    entries.sort((a,b)=>{
      const aOn = a.onNow.length>0 ? 0 : 1
      const bOn = b.onNow.length>0 ? 0 : 1
      if(aOn!==bOn) return aOn - bOn
      const aNext = a.nextOne ? 0 : 1
      const bNext = b.nextOne ? 0 : 1
      if(aNext!==bNext) return aNext - bNext
      if(a.earliest!==b.earliest) return a.earliest - b.earliest
      const aName = taskMap.get(a.taskId)?.name || a.taskId
      const bName = taskMap.get(b.taskId)?.name || b.taskId
      return aName.localeCompare(bName)
    })

    return {
      entries,
      activeSegments,
      globalNextSegment,
      globalNextGap
    }
  },[segs, nowMin, taskMap])

  const timelineEntries = timelineData.entries
  const activeSegments = timelineData.activeSegments
  const activeAgentCount = useMemo(()=>{
    if(activeSegments.length===0) return 0
    const names = new Set<string>()
    for(const seg of activeSegments){
      const key = seg.agentId || seg.person || seg.displayName
      names.add(key)
    }
    return names.size
  },[activeSegments])
  const activePostureCount = useMemo(()=>{
    if(activeSegments.length===0) return 0
    const ids = new Set<string>()
    for(const seg of activeSegments){ ids.add(seg.taskId) }
    return ids.size
  },[activeSegments])

  const clampToDay = (minutes:number)=> Math.max(0, Math.min(1440, minutes))

  const formatDuration = (minutes:number)=>{
    if(minutes <= 0) return '0m'
    if(minutes % 60 === 0) return `${minutes/60}h`
    const hours = Math.floor(minutes/60)
    const mins = minutes % 60
    return hours>0 ? `${hours}h ${mins}m` : `${mins}m`
  }

  const upcomingWindowMin = nowMin + 120
  const upcomingEvent = useMemo(()=>{
    const candidates: Array<{ type:'handoff'|'gap'; start:number; end:number; taskId:string; seg?:PlacedSeg; gap?:CoverageGap }> = []
    const nextSeg = timelineData.globalNextSegment
    if(nextSeg){
      candidates.push({ type: 'handoff', start: nextSeg.seg.startClamped, end: nextSeg.seg.endClamped, taskId: nextSeg.taskId, seg: nextSeg.seg })
    }
    const nextGap = timelineData.globalNextGap
    if(nextGap){
      const gapStart = Math.max(0, Math.min(1440, nextGap.gap.start))
      const gapEnd = Math.max(gapStart, Math.min(1440, nextGap.gap.end))
      candidates.push({ type: 'gap', start: gapStart, end: gapEnd, taskId: nextGap.taskId, gap: nextGap.gap })
    }
    candidates.sort((a,b)=> a.start - b.start)
    const next = candidates.find(c => c.start >= nowMin - 0.5)
    if(!next){
      return { label: 'No upcoming changes', detail: '', withinWindow: false, type: null as null }
    }
    const withinWindow = next.start <= upcomingWindowMin + 0.5
    const taskName = taskMap.get(next.taskId)?.name || next.taskId
    if(next.type === 'handoff' && next.seg){
      const timeLabel = formatTime(next.start)
      const entry = timelineEntries.find(e=> e.taskId===next.taskId)
      let handoffFrom = ''
      if(entry){
        const prior = entry.placed
          .filter(seg=> seg.endClamped <= next.start + 0.5 && seg.endClamped > next.start - 120)
          .sort((a,b)=> b.endClamped - a.endClamped)[0]
        handoffFrom = prior ? (prior.displayName || prior.person) : ''
      }
      const nextName = next.seg.displayName || next.seg.person
      const detail = handoffFrom
        ? `${handoffFrom} → ${nextName}`
        : `→ ${nextName}`
      return {
        label: `Handoff ${timeLabel}`,
        detail: `${taskName} ${detail}`.trim(),
        withinWindow,
        type: 'handoff' as const
      }
    }
    if(next.type === 'gap'){
      const windowLabel = `${formatTime(next.start)}–${formatTime(next.end)}`
      return {
        label: `Gap ${windowLabel}`,
        detail: taskName,
        withinWindow,
        type: 'gap' as const
      }
    }
    return { label: 'No upcoming changes', detail: '', withinWindow, type: null as null }
  },[formatTime, nowMin, upcomingWindowMin, timelineData.globalNextSegment, timelineData.globalNextGap, taskMap, timelineEntries])

  const hourMarks = useMemo(()=>Array.from({ length: 25 }, (_,i)=>i),[])
  const nowPct = Math.max(0, Math.min(100, (nowMin/1440)*100))

  const timelineHeight = 520
  const laneGap = 16
  const textSubtle = isNight
    ? 'text-red-300'
    : isNoir
      ? (dark ? 'text-neutral-300' : 'text-neutral-500')
      : (dark ? 'text-neutral-400' : 'text-neutral-500')
  const borderColor = isNight
    ? 'rgba(220,38,38,0.35)'
    : isNoir
      ? (dark ? 'rgba(245,245,245,0.22)' : 'rgba(34,34,34,0.18)')
      : (dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)')
  const bgTint = isNight
    ? 'rgba(220,38,38,0.08)'
    : isNoir
      ? (dark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)')
      : (dark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)')
  const showNowLine = nowMin >= 0 && nowMin <= 1440
  const nowLineColor = isNight
    ? 'rgba(220,38,38,0.75)'
    : dark ? 'rgba(239,68,68,0.75)' : 'rgba(220,38,38,0.75)'

  const sectionClasses = ['rounded-2xl', 'p-3', 'border']
  if(isPrism){
    sectionClasses.push('prism-surface-4', 'prism-cycle-4')
  }else if(isNight){
    sectionClasses.push('bg-black')
  }else if(isNoir){
    sectionClasses.push(dark ? 'bg-neutral-950 border-neutral-700' : 'bg-neutral-100 border-neutral-300')
  }else{
    sectionClasses.push(dark ? 'bg-neutral-900 border-neutral-700' : 'bg-white border-neutral-300 shadow-sm')
  }

  const sectionStyle: React.CSSProperties | undefined = isNight
    ? { backgroundColor: '#050505', borderColor: 'rgba(220,38,38,0.45)', color: '#dc2626' }
    : isNoir
      ? { backgroundColor: dark ? '#0c0c0d' : '#f5f5f5', borderColor: dark ? 'rgba(245,245,245,0.25)' : 'rgba(0,0,0,0.18)', color: dark ? '#f5f5f5' : '#111' }
      : undefined

  const headerSecondaryClass = isNight ? 'text-red-300' : (dark ? 'text-neutral-400' : 'text-neutral-500')
  const emptyClass = isNight ? 'text-red-300' : (dark ? 'text-neutral-400' : 'text-neutral-600')

  const snapshotLabelClass = isNight ? 'text-red-400' : (dark ? 'text-neutral-400' : 'text-neutral-500')
  const snapshotValueClass = isNight ? 'text-red-100' : (dark ? 'text-neutral-100' : 'text-neutral-900')
  const snapshotTileBase = isNight
    ? 'bg-black/80 border border-red-900/60'
    : isNoir
      ? (dark ? 'bg-neutral-950 border-neutral-700' : 'bg-neutral-100 border-neutral-300')
      : (dark ? 'bg-neutral-900 border-neutral-700' : 'bg-white border-neutral-200 shadow-sm')
  const tzLabel = tzAbbrev(tz.id)
  const upcomingLabel = upcomingEvent.withinWindow
    ? upcomingEvent.label
    : upcomingEvent.type
      ? `${upcomingEvent.label} (>2h)`
      : 'None in next 2h'
  const upcomingDetail = upcomingEvent.withinWindow
    ? upcomingEvent.detail
    : upcomingEvent.type
      ? upcomingEvent.detail
      : ''

  return (
    <section className={sectionClasses.join(' ')} style={sectionStyle}>
      <div className="flex items-baseline justify-between mb-4">
        <h2 className="text-base font-semibold">Posture schedule today</h2>
        <div className={["text-xs", headerSecondaryClass].join(' ')}>Updated {formatTime(nowMin)} {tzLabel}</div>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3 mb-4">
        <div className={[snapshotTileBase, 'rounded-xl px-3 py-3 flex flex-col gap-1 border-l-4'].join(' ')} style={{ borderColor: upcomingEvent.type === 'gap' ? (isNight ? '#f87171' : '#dc2626') : (isNight ? '#60a5fa' : '#2563eb') }}>
          <span className={['text-[11px] uppercase tracking-wide', snapshotLabelClass].join(' ')}>Next change</span>
          <span className={[snapshotValueClass, 'text-lg font-semibold'].join(' ')}>{upcomingLabel}</span>
          {upcomingDetail ? (
            <span className={[snapshotLabelClass, 'text-[11px] leading-snug'].join(' ')}>{upcomingDetail}</span>
          ) : null}
        </div>
        <div className={[snapshotTileBase, 'rounded-xl px-3 py-3 flex flex-col gap-1'].join(' ')}>
          <span className={['text-[11px] uppercase tracking-wide', snapshotLabelClass].join(' ')}>Active agents</span>
          <span className={[snapshotValueClass, 'text-lg font-semibold tabular-nums'].join(' ')}>{activeAgentCount}</span>
          <span className={[snapshotLabelClass, 'text-[11px]'].join(' ')}>{activeAgentCount === 1 ? 'person on posture' : 'people on posture'}</span>
        </div>
        <div className={[snapshotTileBase, 'rounded-xl px-3 py-3 flex flex-col gap-1'].join(' ')}>
          <span className={['text-[11px] uppercase tracking-wide', snapshotLabelClass].join(' ')}>Active postures</span>
          <span className={[snapshotValueClass, 'text-lg font-semibold tabular-nums'].join(' ')}>{activePostureCount}</span>
          <span className={[snapshotLabelClass, 'text-[11px]'].join(' ')}>{activePostureCount === 1 ? 'lane live now' : 'lanes live now'}</span>
        </div>
      </div>
      {timelineEntries.length === 0 ? (
        <div className={["text-sm", emptyClass].join(' ')}>No posture coverage configured today.</div>
      ) : (
        <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>
          {timelineEntries.map(entry=>{
            const t = taskMap.get(entry.taskId)
            const color = isNight
              ? '#dc2626'
              : isNoir
                ? (dark ? 'rgba(245,245,245,0.85)' : 'rgba(34,34,34,0.8)')
                : (t?.color || '#2563eb')
            const laneCount = Math.max(1, entry.laneCount)
            const lanes: PlacedSeg[][] = Array.from({ length: laneCount }, () => [])
            entry.placed.forEach(seg => { if (seg.lane >= 0 && seg.lane < laneCount) lanes[seg.lane].push(seg) })
            const coverageGaps = entry.coverageGaps.filter(g => (g.end - g.start) > 1)
            const currentGap = coverageGaps.find(g => g.start <= nowMin && nowMin < g.end) || null
            const upcomingGapSoon = coverageGaps.find(g => g.start > nowMin + 0.5 && g.start <= nowMin + 120) || null
            const gapBanner = currentGap ?? upcomingGapSoon
            const gapLabel = gapBanner
              ? `${formatTime(clampToDay(gapBanner.start))}–${formatTime(clampToDay(gapBanner.end))}`
              : ''
            const gapChipTone = currentGap ? 'urgent' : 'warn'
            const minutesUntilGap = gapBanner && !currentGap
              ? Math.max(0, clampToDay(gapBanner.start) - nowMin)
              : 0
            const summaryTextClass = isNight ? 'text-red-200' : (dark ? 'text-neutral-300' : 'text-neutral-600')
            const summaryHighlightClass = isNight ? 'text-red-100' : (dark ? 'text-neutral-100' : 'text-neutral-800')
            const activeNowItems = entry.onNow
              .map(seg => ({
                name: seg.displayName || seg.person,
                until: formatTime(clampToDay(seg.end)),
                agentKey: seg.agentId || seg.person || seg.displayName
              }))
            const nextSeg = entry.nextOne
            const nextStart = nextSeg ? clampToDay(nextSeg.start) : 0
            const nextEnd = nextSeg ? clampToDay(nextSeg.end) : 0
            const nextLineBase = nextSeg
              ? `Next: ${(nextSeg.displayName || nextSeg.person)} ${formatTime(nextStart)}–${formatTime(nextEnd)}`
              : 'Next: No coverage scheduled'
            const followingSeg = nextSeg
              ? entry.placed
                  .filter(seg => seg.startClamped >= nextEnd + 1)
                  .sort((a,b)=> a.startClamped - b.startClamped || (a.displayName || a.person).localeCompare(b.displayName || b.person))[0]
              : null
            const hasGapAfterNext = nextSeg
              ? coverageGaps.some(g => g.start >= nextEnd - 0.5 && g.start <= nextEnd + 1)
              : false
            const nextLine = followingSeg
              ? `${nextLineBase} • Handoff to ${(followingSeg.displayName || followingSeg.person)}`
              : hasGapAfterNext
                ? `${nextLineBase} • Gap after`
                : nextLineBase
            const totalCoverageLine = `Total coverage: ${formatDuration(Math.round(entry.totalCoverageMin))} / 24h`
            let prismSegCycle = 0
            return (
              <div key={entry.taskId} className="rounded-lg p-2" style={{ background: bgTint }}>
                <div className="flex items-center gap-2">
                  <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: color }} aria-hidden />
                  <div className="font-medium">{t?.name || entry.taskId}</div>
                </div>
                {gapBanner && (
                  <div className="mt-1">
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${gapChipTone === 'urgent'
                        ? (isNight ? 'bg-red-900/60 text-red-200' : dark ? 'bg-red-900/40 text-red-200' : 'bg-red-100 text-red-700')
                        : (isNight ? 'bg-red-900/40 text-red-200' : dark ? 'bg-amber-900/40 text-amber-200' : 'bg-amber-100 text-amber-700')}`}
                    >
                      <span aria-hidden>{currentGap ? '⛔' : '⚠'}</span>
                      <span>{currentGap ? `No coverage ${gapLabel}` : `Gap ${gapLabel}`}</span>
                    </span>
                  </div>
                )}
                <div className="mt-2 rounded-lg border px-3 pb-3" style={{
                  height: timelineHeight,
                  background: isNight
                    ? 'rgba(0,0,0,0.65)'
                    : isNoir
                      ? (dark ? 'rgba(12,12,12,0.92)' : 'rgba(252,252,252,0.94)')
                      : (dark ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.9)'),
                  borderColor,
                  position: 'relative'
                }}>
                  <div className="absolute inset-0 pointer-events-none">
                    {hourMarks.map(h => {
                      if (h === 0 || h === 24) return null
                      const top = (h / 24) * timelineHeight
                      const major = h % 6 === 0
                      const lineColor = isNight
                        ? (major ? 'rgba(220,38,38,0.3)' : 'rgba(220,38,38,0.18)')
                        : isNoir
                          ? (major ? (dark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.18)') : (dark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.1)'))
                          : (major ? (dark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.2)') : (dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'))
                      return (
                        <div key={`grid-${h}`} className="absolute left-0 right-0" style={{ top, height: 1, backgroundColor: lineColor }} />
                      )
                    })}
                    {coverageGaps.map((gap, gapIdx) => {
                      const start = clampToDay(gap.start)
                      const end = clampToDay(gap.end)
                      if(end - start < 1) return null
                      const top = (start / 1440) * timelineHeight
                      const height = Math.max(2, Math.min(16, ((end - start) / 1440) * timelineHeight))
                      const future = start >= nowMin - 0.5
                      const baseColor = isNight
                        ? (future ? 'rgba(220,38,38,0.55)' : 'rgba(220,38,38,0.35)')
                        : isNoir
                          ? (dark ? (future ? 'rgba(239,68,68,0.35)' : 'rgba(239,68,68,0.22)') : (future ? 'rgba(220,38,38,0.35)' : 'rgba(220,38,38,0.2)'))
                          : (dark ? (future ? 'rgba(239,68,68,0.3)' : 'rgba(239,68,68,0.18)') : (future ? 'rgba(220,38,38,0.28)' : 'rgba(220,38,38,0.16)'))
                      const border = isNight
                        ? 'rgba(220,38,38,0.75)'
                        : (dark ? 'rgba(239,68,68,0.55)' : 'rgba(220,38,38,0.6)')
                      return (
                        <div
                          key={`gap-${gapIdx}`}
                          className="absolute left-2 right-2"
                          style={{
                            top,
                            height,
                            backgroundColor: baseColor,
                            borderRadius: 8,
                            border: `1px dashed ${border}`
                          }}
                        />
                      )
                    })}
                  </div>
                  {showNowLine && (
                    <div className="absolute left-0 right-0 pointer-events-none" style={{ top: `${nowPct}%`, transform: 'translateY(-1px)' }}>
                      <div className="h-[2px]" style={{ backgroundColor: nowLineColor }} />
                    </div>
                  )}
                  <div className="relative h-full" style={{ display: 'grid', gridTemplateColumns: `repeat(${laneCount}, minmax(0, 1fr))`, columnGap: laneGap }}>
                    {lanes.map((laneSegs, laneIdx) => {
                      const hasSegments = laneSegs.length > 0
                      return (
                        <div key={`lane-${laneIdx}`} className="relative" style={{ height: timelineHeight }}>
                          {!hasSegments && (
                            <div className={["absolute inset-x-2 top-1/2 -translate-y-1/2 text-[11px] text-center", textSubtle].join(' ')}>
                              No coverage
                            </div>
                          )}
                          {laneSegs.map((seg, segIdx) => {
                            const topPx = (seg.startClamped / 1440) * timelineHeight
                            const heightPx = Math.max(6, ((seg.endClamped - seg.startClamped) / 1440) * timelineHeight)
                            const active = seg.startClamped <= nowMin && nowMin < seg.endClamped
                            const cycleIndex = isPrism ? ((prismSegCycle++) % 6) + 1 : 0
                            const blockStyle: React.CSSProperties = {
                              left: 0,
                              right: 0,
                              top: topPx,
                              height: heightPx,
                              borderLeft: `4px solid ${color}`,
                              borderRadius: 8,
                              border: isNight
                                ? '1px solid rgba(220,38,38,0.4)'
                                : isNoir
                                  ? (dark ? '1px solid rgba(245,245,245,0.28)' : '1px solid rgba(34,34,34,0.2)')
                                  : (dark ? '1px solid rgba(255,255,255,0.18)' : '1px solid rgba(0,0,0,0.12)'),
                              background: isNight
                                ? 'rgba(8,8,8,0.94)'
                                : isNoir
                                  ? (dark ? 'rgba(18,18,18,0.9)' : 'rgba(245,245,245,0.96)')
                                  : (dark ? 'rgba(17,24,39,0.88)' : 'rgba(255,255,255,0.98)'),
                              boxShadow: isNight
                                ? '0 2px 8px rgba(220,38,38,0.2)'
                                : isNoir
                                  ? (dark ? '0 2px 6px rgba(0,0,0,0.45)' : '0 2px 6px rgba(0,0,0,0.08)')
                                  : (dark ? '0 2px 6px rgba(0,0,0,0.45)' : '0 2px 6px rgba(15,23,42,0.12)'),
                              padding: '6px 8px',
                              position: 'absolute',
                              display: 'flex',
                              flexDirection: 'column',
                              justifyContent: 'center',
                              alignItems: 'flex-start',
                              gap: 4,
                              overflow: 'hidden'
                            }
                            if(isPrism){
                              const angle = 45 + (cycleIndex * 28)
                              const baseMix = `color-mix(in oklab, ${color} 78%, rgba(255,255,255,0.08) 22%)`
                              const endMix = `color-mix(in oklab, ${color} 62%, rgba(0,0,0,0.4) 38%)`
                              blockStyle.background = 'rgba(5,6,12,0.75)'
                              blockStyle.backgroundImage = `linear-gradient(${angle}deg, ${baseMix} 0%, ${endMix} 100%)`
                              blockStyle.backgroundSize = '260% 100%'
                              blockStyle.backgroundPosition = 'var(--prism-chip-pos, 0% 50%)'
                              blockStyle.backgroundBlendMode = 'screen'
                            }
                            if (active) {
                              blockStyle.boxShadow = isNight
                                ? '0 0 0 2px rgba(220,38,38,0.6) inset'
                                : isNoir
                                  ? (dark ? '0 0 0 2px rgba(245,245,245,0.4) inset' : '0 0 0 2px rgba(34,34,34,0.4) inset')
                                  : (dark ? `0 0 0 2px ${color} inset` : `0 0 0 2px ${color} inset`)
                            }
                            const showTime = heightPx >= 36
                            const showPerson = heightPx >= 22
                            const personLabel = seg.displayName || seg.person
                            const title = `${personLabel} • ${formatTime(seg.startClamped)}–${formatTime(seg.endClamped)}`
                            const chipClassName = [
                              isNight ? 'text-red-300 text-[11px] leading-tight' : dark ? 'text-neutral-100 text-[11px] leading-tight' : 'text-neutral-900 text-[11px] leading-tight',
                              isPrism ? 'prism-chip' : '',
                              isPrism ? `prism-chip-cycle-${cycleIndex}` : ''
                            ].filter(Boolean).join(' ')
                            return (
                              <div
                                key={`${(seg.agentId || seg.person || personLabel)}-${seg.startClamped}-${seg.endClamped}-${seg.lane}`}
                                className={chipClassName}
                                style={blockStyle}
                                title={title}
                              >
                                {showPerson ? (
                                  <span className={['font-medium truncate', isNight ? 'text-red-400' : ''].join(' ')}>{personLabel}</span>
                                  ) : (
                                  <span className="font-medium">•</span>
                                )}
                                {showTime && (
                                  <span className={isNight ? 'text-red-300' : dark ? 'text-neutral-300' : 'text-neutral-600'}>
                                    {formatTime(seg.startClamped)}–{formatTime(seg.endClamped)}
                                  </span>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      )
                    })}
                  </div>
                </div>
                <div className={`mt-3 space-y-1 text-xs ${summaryTextClass}`}>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className={summaryHighlightClass}>Now:</span>
                    {activeNowItems.length > 0 ? (
                      activeNowItems.map((item, idx) => (
                        <span key={`${item.agentKey || item.name}-${idx}`} className="inline-flex items-center gap-1">
                          {idx > 0 ? <span className="opacity-50">·</span> : null}
                          <span className={summaryHighlightClass}>{item.name}</span>
                          <span className={summaryTextClass}>until {item.until}</span>
                        </span>
                      ))
                    ) : (
                      <span className={summaryTextClass}>No one on posture</span>
                    )}
                    {gapBanner && !currentGap && minutesUntilGap > 0 && (
                      <span className={[isNight ? 'text-red-200' : dark ? 'text-amber-200' : 'text-amber-600', 'inline-flex items-center gap-1'].join(' ')}>
                        <span className="opacity-60">·</span>
                        <span>gap in {formatDuration(Math.max(1, Math.round(minutesUntilGap)))} </span>
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className={summaryHighlightClass}>{nextLine}</span>
                    <span className={summaryTextClass}>• {totalCoverageLine}</span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
