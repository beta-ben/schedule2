import React from 'react'

type Metric = {
  label: string
  value: string
  delta: string
  intent: 'up' | 'down' | 'neutral'
  tooltip?: string
}

type QueueRow = {
  queue: string
  calls: number
  answered: number
  missed: number
  avgHandle: string
  topAgent: string
}

type HeatCell = {
  hour: string
  load: number
}

type CoverageRow = {
  hour: string
  demand: number
  staffed: number
}

const METRICS: Metric[] = [
  { label: 'Total calls', value: '1,482', delta: '+6.2%', intent: 'up' },
  { label: 'Answered SLA', value: '89%', delta: '-3.0%', intent: 'down', tooltip: 'Answered under 45s / total offered' },
  { label: 'Avg handle time', value: '03:42', delta: '+0:18', intent: 'down' },
  { label: 'Transfers', value: '74', delta: '-11.0%', intent: 'up' },
  { label: 'SMS replies', value: '214', delta: '+15.4%', intent: 'up' },
  { label: 'Voicemail backlog', value: '9', delta: '-4', intent: 'up' },
]

const QUEUES: QueueRow[] = [
  { queue: 'Support • Queue A', calls: 562, answered: 504, missed: 22, avgHandle: '03:05', topAgent: 'Alex M.' },
  { queue: 'Support • Queue B', calls: 397, answered: 344, missed: 18, avgHandle: '04:12', topAgent: 'Priya P.' },
  { queue: 'Sales • Inbound', calls: 231, answered: 210, missed: 12, avgHandle: '05:06', topAgent: 'Jordan L.' },
  { queue: 'On-call escalation', calls: 92, answered: 88, missed: 1, avgHandle: '02:43', topAgent: 'Kim W.' },
]

const HEATMAP: HeatCell[] = [
  { hour: '06', load: 12 },
  { hour: '07', load: 24 },
  { hour: '08', load: 58 },
  { hour: '09', load: 81 },
  { hour: '10', load: 93 },
  { hour: '11', load: 78 },
  { hour: '12', load: 65 },
  { hour: '13', load: 72 },
  { hour: '14', load: 88 },
  { hour: '15', load: 70 },
  { hour: '16', load: 49 },
  { hour: '17', load: 36 },
]

const TIMELINE = [
  { ts: '08:00', event: 'Queue A hits 60% occupancy • recommended: pull in Flex agents' },
  { ts: '09:30', event: 'SMS backlog exceeded 30 • auto-reply triggered' },
  { ts: '12:15', event: 'Sales queue SLA breached for 5 min • notifying supervisor' },
  { ts: '14:40', event: 'On-call escalation answered in 22s • SLA recovered' },
]

const COVERAGE: CoverageRow[] = [
  { hour: '08', demand: 56, staffed: 48 },
  { hour: '09', demand: 82, staffed: 75 },
  { hour: '10', demand: 95, staffed: 88 },
  { hour: '11', demand: 78, staffed: 82 },
  { hour: '12', demand: 64, staffed: 70 },
  { hour: '13', demand: 71, staffed: 73 },
  { hour: '14', demand: 87, staffed: 80 },
  { hour: '15', demand: 68, staffed: 72 },
]

function metricStyle(intent: Metric['intent'], dark: boolean){
  if(intent === 'up') return dark ? 'bg-emerald-500/15 text-emerald-200 border border-emerald-500/30' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
  if(intent === 'down') return dark ? 'bg-rose-500/15 text-rose-200 border border-rose-500/30' : 'bg-rose-50 text-rose-700 border border-rose-200'
  return dark ? 'bg-neutral-500/10 text-neutral-200 border border-neutral-700/40' : 'bg-neutral-100 text-neutral-700 border border-neutral-200'
}

function heatIntensity(load: number, dark: boolean){
  const clamped = Math.max(0, Math.min(load, 100))
  const alpha = (10 + clamped * 0.9) / 100 // 0.1 -> 1.0
  return dark ? `rgba(59,130,246,${alpha.toFixed(2)})` : `rgba(59,130,246,${(alpha + 0.1).toFixed(2)})`
}

function coverageDelta(row: CoverageRow){
  const diff = row.staffed - row.demand
  const pct = row.demand === 0 ? 0 : Math.round((diff / row.demand) * 100)
  return { diff, pct }
}

function coverageTone(diff: number, dark: boolean){
  if(diff >= 5) return dark ? 'text-emerald-300' : 'text-emerald-600'
  if(diff <= -5) return dark ? 'text-rose-300' : 'text-rose-600'
  return dark ? 'text-amber-200' : 'text-amber-600'
}

export default function ZoomAnalyticsMock({ dark }: { dark: boolean }){
  const card = dark ? 'bg-neutral-900 border-neutral-800' : 'bg-white border-neutral-200'
  const subtle = dark ? 'text-neutral-300' : 'text-neutral-600'
  const gridBg = dark ? 'bg-neutral-950/60' : 'bg-neutral-100'
  const peakLoad = Math.max(1, ...COVERAGE.map(row=> Math.max(row.demand, row.staffed)))

  return (
    <div className="space-y-3">
      <div className={["rounded-xl border p-4", card].join(' ')}>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-sm font-semibold">Zoom Phone analytics snapshot</div>
            <div className={["text-xs", subtle].join(' ')}>Mocked insights generated from queue call logs, SMS events, and Zoom’s quality dashboards.</div>
          </div>
          <div className="flex items-center gap-2">
            <button className={["px-3 py-1.5 rounded-lg border text-xs font-medium", dark?"bg-blue-500/20 border-blue-400 text-blue-200":"bg-blue-600 text-white border-blue-600"].join(' ')}>
              Export CSV
            </button>
            <button className={["px-3 py-1.5 rounded-lg border text-xs font-medium", dark?"bg-neutral-900 border-neutral-700 hover:bg-neutral-800":"bg-neutral-100 border-neutral-300 hover:bg-neutral-200"].join(' ')}>
              Schedule report
            </button>
          </div>
        </div>
      </div>

      <div className="grid gap-3 xl:grid-cols-[2fr_1fr]">
        <section className={["rounded-xl border p-4 space-y-3", card].join(' ')}>
          <div className="text-sm font-semibold">Key metrics — last 7 days</div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {METRICS.map(metric=>(
              <div key={metric.label} className={["rounded-lg px-3 py-2 border", metricStyle(metric.intent, dark)].join(' ')}>
                <div className="text-xs uppercase tracking-wide opacity-70">{metric.label}</div>
                <div className="text-2xl font-semibold">{metric.value}</div>
                <div className="text-xs">{metric.delta}</div>
                {metric.tooltip && (<div className="text-[11px] opacity-70">{metric.tooltip}</div>)}
              </div>
            ))}
          </div>

          <div>
            <div className="flex items-center justify-between text-sm font-semibold mb-2">
              <span>Queue performance</span>
              <button className={["text-xs underline", dark?"text-blue-300":"text-blue-600"].join(' ')}>View details</button>
            </div>
            <div className={["overflow-auto rounded-lg border", dark?"border-neutral-800":"border-neutral-200"].join(' ')}>
              <table className={["w-full text-xs", dark?"text-neutral-200":"text-neutral-700"].join(' ')}>
                <thead className={dark?"bg-neutral-900":"bg-neutral-100"}>
                  <tr>
                    <th className="text-left px-3 py-2">Queue</th>
                    <th className="text-right px-3 py-2">Offered</th>
                    <th className="text-right px-3 py-2">Answered</th>
                    <th className="text-right px-3 py-2">Missed</th>
                    <th className="text-right px-3 py-2">Avg handle</th>
                    <th className="text-left px-3 py-2">Top agent</th>
                  </tr>
                </thead>
                <tbody>
                  {QUEUES.map(row=>(
                    <tr key={row.queue} className={dark?"odd:bg-neutral-900/40":"odd:bg-neutral-50"}>
                      <td className="px-3 py-2 font-medium">{row.queue}</td>
                      <td className="px-3 py-2 text-right">{row.calls}</td>
                      <td className="px-3 py-2 text-right">{row.answered}</td>
                      <td className={['px-3 py-2 text-right', row.missed > 15 ? (dark?'text-rose-300':'text-rose-600'):'' ].join(' ')}>{row.missed}</td>
                      <td className="px-3 py-2 text-right">{row.avgHandle}</td>
                      <td className="px-3 py-2">{row.topAgent}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between text-sm font-semibold mb-2">
              <span>Demand heatmap (call attempts per hour)</span>
              <span className={["text-xs", subtle].join(' ')}>Last 7 days • Eastern time</span>
            </div>
            <div className={["grid grid-cols-6 sm:grid-cols-12 gap-1 rounded-lg p-3", gridBg].join(' ')}>
              {HEATMAP.map(cell=>(
                <div key={cell.hour} className="flex flex-col items-center gap-1 text-[11px]">
                  <div
                    className="w-full h-12 rounded-md"
                    style={{ background: heatIntensity(cell.load, dark) }}
                  ></div>
                  <span className="opacity-70">{cell.hour}</span>
                </div>
              ))}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between text-sm font-semibold mb-2">
              <span>Coverage vs demand (agents vs call attempts)</span>
              <span className={["text-xs", subtle].join(' ')}>Peak {peakLoad} agents needed</span>
            </div>
            <div className={["space-y-2 rounded-lg border p-3", dark?"border-neutral-800 bg-neutral-900/40":"border-neutral-200 bg-neutral-50"].join(' ')}>
              {COVERAGE.map(row=>{
                const demandPct = Math.round((row.demand / peakLoad) * 100)
                const staffedPct = Math.round((row.staffed / peakLoad) * 100)
                const { diff, pct } = coverageDelta(row)
                const tone = coverageTone(diff, dark)
                return (
                  <div key={row.hour} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium">{row.hour}:00</span>
                      <span className={["font-mono", tone].join(' ')}>
                        {diff >= 0 ? '+' : ''}{diff} ({pct >=0 ? '+' : ''}{pct}%)
                      </span>
                    </div>
                    <div className="relative h-8 rounded-md overflow-hidden">
                      <div
                        className={["absolute inset-y-0 left-0", dark?"bg-sky-500/40":"bg-sky-400/40"].join(' ')}
                        style={{ width: `${demandPct}%` }}
                        aria-hidden
                      ></div>
                      <div
                        className={["absolute inset-y-0 left-0", diff >=0 ? (dark?"bg-emerald-500/40":"bg-emerald-400/40") : (dark?"bg-rose-500/40":"bg-rose-400/40")].join(' ')}
                        style={{ width: `${staffedPct}%` }}
                        aria-hidden
                      ></div>
                      <div className="relative flex h-full items-center justify-between px-2 text-[11px] font-medium">
                        <span>Demand {row.demand}</span>
                        <span>Staffed {row.staffed}</span>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </section>

        <aside className={["space-y-3",].join(' ')}>
          <div className={["rounded-xl border p-4", card].join(' ')}>
            <div className="text-sm font-semibold mb-1">Today’s live feed</div>
            <div className={["space-y-2 text-xs", subtle].join(' ')}>
              {TIMELINE.map(item=>(
                <div key={item.ts} className={dark?"bg-neutral-900 rounded-lg px-3 py-2":"bg-white rounded-lg px-3 py-2 border border-neutral-200"}>
                  <div className="font-mono text-[11px] opacity-70">{item.ts}</div>
                  <div>{item.event}</div>
                </div>
              ))}
            </div>
          </div>
          <div className={["rounded-xl border p-4", card].join(' ')}>
            <div className="text-sm font-semibold mb-1">Next steps</div>
            <ul className={["text-xs space-y-1", subtle].join(' ')}>
              <li>• Enable abandoned-call alerts for Sales when SLA &lt; 80%.</li>
              <li>• Pipe MOS scores into QA dashboard for coaching tags.</li>
              <li>• Add SMS response leaderboard to weekly standup pack.</li>
            </ul>
          </div>
        </aside>
      </div>
    </div>
  )
}
