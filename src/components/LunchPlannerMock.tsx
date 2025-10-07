import React from 'react'

type MetricTone = 'good' | 'warn' | 'bad' | 'neutral'

type CoverageMetric = {
  id: string
  label: string
  value: string
  sublabel: string
  tone: MetricTone
}

type QueueState = 'queued' | 'out' | 'overdue'

type QueueEntry = {
  id: string
  name: string
  state: QueueState
  requestedAt: string
  window: string
  eta: string
  notes?: string
  coverageImpact: 'low' | 'medium' | 'high'
}

type Suggestion = {
  id: string
  name: string
  window: string
  rationale: string
  confidence: 'high' | 'medium' | 'low'
  coverageAfter: string
}

const METRICS: CoverageMetric[] = [
  { id: 'coverage', label: 'Coverage after lunches', value: '92%', sublabel: 'Goal 90%', tone: 'good' },
  { id: 'queued', label: 'Agents queued', value: '3', sublabel: 'grant 1 slot in 5 min', tone: 'warn' },
  { id: 'out', label: 'Out to lunch', value: '2', sublabel: 'Max allowed 3', tone: 'neutral' },
  { id: 'overdue', label: 'Overdue returns', value: '1', sublabel: 'Ping Mateo (12 min)', tone: 'bad' },
]

const QUEUE: QueueEntry[] = [
  {
    id: 'q1',
    name: 'Faith Chen',
    state: 'queued',
    requestedAt: '11:07',
    window: '11:10 – 11:40',
    eta: 'next slot: 2 min',
    coverageImpact: 'low',
    notes: 'Covering chat handoff; tagged Riley.',
  },
  {
    id: 'q2',
    name: 'Jamal Ortiz',
    state: 'out',
    requestedAt: '11:02',
    window: '11:05 – 11:35',
    eta: 'Due back 11:35',
    coverageImpact: 'medium',
  },
  {
    id: 'q3',
    name: 'Mateo Ruiz',
    state: 'overdue',
    requestedAt: '10:42',
    window: '10:45 – 11:15',
    eta: '12 min late',
    coverageImpact: 'high',
    notes: 'Auto-ping sent on Slack #ops-alerts.',
  },
]

const SUGGESTIONS: Suggestion[] = [
  {
    id: 's1',
    name: 'Riley Cooper',
    window: '11:35 – 12:05',
    rationale: 'Phones coverage holds at 91%; Riley swaps with Mateo when back.',
    confidence: 'high',
    coverageAfter: '91% projected',
  },
  {
    id: 's2',
    name: 'Kim Park',
    window: '11:50 – 12:20',
    rationale: 'Meeting at 13:00; staggered to avoid double dip on queue B.',
    confidence: 'medium',
    coverageAfter: '89% projected',
  },
  {
    id: 's3',
    name: 'Noah Singh',
    window: '12:15 – 12:45',
    rationale: 'Pushes to 12:15 to keep Spanish chat staffed during promo spike.',
    confidence: 'medium',
    coverageAfter: '92% projected',
  },
]

const SELF_SERVE = {
  greeting: 'Hi Faith — you are next in the lunch queue.',
  shiftLabel: 'Shift',
  shiftRange: '08:30 – 16:30 ET',
  currentTask: 'Current task: Chat Queue • Tier 1',
  queuedAt: 'Queued at 11:07 (2 min ago)',
  countdown: 'Next slot opens in ~2 min',
  actions: [
    { id: 'stay', label: 'Stay queued', hint: 'We’ll alert you when your slot opens', intent: 'primary' as const },
    { id: 'start', label: 'Start lunch now', hint: 'Uses current slot', intent: 'neutral' as const },
    { id: 'skip', label: 'Skip lunch for now', hint: 'You keep your place for 15 min', intent: 'danger' as const },
  ],
  checklist: [
    { id: 'handoff', label: 'Handoff active chats to Riley', done: false },
    { id: 'status', label: 'Set Slack status → “At lunch”', done: true },
    { id: 'timer', label: 'Timer starts when you tap “Start lunch”', done: false },
  ],
}

function metricTone(tone: MetricTone, dark: boolean){
  if(tone==='good') return dark ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-200' : 'bg-emerald-50 border border-emerald-200 text-emerald-700'
  if(tone==='warn') return dark ? 'bg-amber-500/10 border border-amber-500/30 text-amber-200' : 'bg-amber-50 border border-amber-200 text-amber-700'
  if(tone==='bad') return dark ? 'bg-rose-500/10 border border-rose-500/30 text-rose-200' : 'bg-rose-50 border border-rose-200 text-rose-700'
  return dark ? 'bg-neutral-500/10 border border-neutral-500/20 text-neutral-200' : 'bg-neutral-100 border border-neutral-300 text-neutral-700'
}

function stateBadge(state: QueueState, dark: boolean){
  if(state==='queued') return dark ? 'bg-sky-500/10 text-sky-200 border border-sky-500/30' : 'bg-sky-50 text-sky-700 border border-sky-200'
  if(state==='out') return dark ? 'bg-emerald-500/10 text-emerald-200 border border-emerald-500/30' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
  return dark ? 'bg-rose-500/10 text-rose-200 border border-rose-500/30' : 'bg-rose-50 text-rose-700 border border-rose-200'
}

function confidenceBadge(confidence: Suggestion['confidence'], dark: boolean){
  if(confidence==='high') return dark ? 'bg-emerald-500/10 text-emerald-200 border border-emerald-500/30' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
  if(confidence==='medium') return dark ? 'bg-amber-500/10 text-amber-200 border border-amber-500/30' : 'bg-amber-50 text-amber-700 border border-amber-200'
  return dark ? 'bg-rose-500/10 text-rose-200 border border-rose-500/30' : 'bg-rose-50 text-rose-700 border border-rose-200'
}

export default function LunchPlannerMock({ dark }: { dark: boolean }){
  const cardBase = dark ? 'bg-neutral-900 border-neutral-800' : 'bg-white border-neutral-200'
  const subtle = dark ? 'text-neutral-300' : 'text-neutral-600'
  const divider = dark ? 'border-neutral-800' : 'border-neutral-200'
  const timelineTime = dark ? 'text-neutral-400' : 'text-neutral-500'
  return (
    <div className="space-y-3">
      <section className={["rounded-xl border p-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between", cardBase].join(' ')}>
        <div>
          <div className="text-sm font-semibold">Lunch coverage planner</div>
          <div className={["text-xs", subtle].join(' ')}>Honor-system preview — supervisors can test queue flow without affecting production data.</div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className={["px-3 py-1.5 rounded-lg border text-xs font-medium", dark?"bg-blue-500/20 border-blue-400 text-blue-200":"bg-blue-600 text-white border-blue-600"].join(' ')}>
            Open queue monitor
          </button>
          <button className={["px-3 py-1.5 rounded-lg border text-xs font-medium", dark?"bg-neutral-900 border-neutral-700 hover:bg-neutral-800":"bg-neutral-100 border-neutral-300 hover:bg-neutral-200"].join(' ')}>
            Adjust lunch rules
          </button>
        </div>
      </section>

      <div className="grid gap-3 xl:grid-cols-[2fr_1.1fr]">
        <section className={["rounded-xl border p-4 space-y-3", cardBase].join(' ')}>
          <header>
            <div className="text-sm font-semibold">Operations view</div>
            <div className={["text-xs", subtle].join(' ')}>Real-time queue, active lunches, and forecast from the suggestion engine.</div>
          </header>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {METRICS.map(metric=>(
              <div key={metric.id} className={["rounded-lg border px-3 py-2", metricTone(metric.tone, dark)].join(' ')}>
                <div className="text-[11px] uppercase tracking-wide opacity-80">{metric.label}</div>
                <div className="text-lg font-semibold">{metric.value}</div>
                <div className="text-[11px] opacity-80">{metric.sublabel}</div>
              </div>
            ))}
          </div>

          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold">Lunch queue</div>
              <button className={["text-xs font-medium px-2 py-1 rounded-lg border", dark?"bg-neutral-900 border-neutral-700 hover:bg-neutral-800":"bg-neutral-100 border-neutral-300 hover:bg-neutral-200"].join(' ')}>
                Override slot
              </button>
            </div>
            <div className={["grid gap-2", dark?"":""].join(' ')}>
              {QUEUE.map(entry=>(
                <article key={entry.id} className={["rounded-lg border px-3 py-2", dark?"bg-neutral-900 border-neutral-800":"bg-white border-neutral-200"].join(' ')}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-sm font-semibold">{entry.name}</div>
                    <span className={["inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium", stateBadge(entry.state, dark)].join(' ')}>
                      {entry.state === 'queued' ? 'Queued' : entry.state === 'out' ? 'At lunch' : 'Overdue'}
                    </span>
                  </div>
                  <div className={["text-xs", subtle].join(' ')}>Requested {entry.requestedAt} • Window {entry.window}</div>
                  <div className="flex flex-wrap gap-2 text-xs">
                    <div className="font-medium">ETA: <span className={subtle}>{entry.eta}</span></div>
                    <div className="font-medium">Impact: <span className={subtle}>{entry.coverageImpact.toUpperCase()}</span></div>
                  </div>
                  {entry.notes && (
                    <div className={["text-[11px]", subtle].join(' ')}>Note: {entry.notes}</div>
                  )}
                  <div className="flex flex-wrap gap-2 pt-2 text-xs">
                    <button className={["px-2.5 py-1 rounded-lg border", dark?"bg-neutral-900 border-neutral-700 hover:bg-neutral-800":"bg-neutral-100 border-neutral-300 hover:bg-neutral-200"].join(' ')}>
                      Notify agent
                    </button>
                    <button className={["px-2.5 py-1 rounded-lg border", dark?"bg-neutral-900 border-neutral-700 hover:bg-neutral-800":"bg-neutral-100 border-neutral-300 hover:bg-neutral-200"].join(' ')}>
                      Swap order
                    </button>
                    <button className={["px-2.5 py-1 rounded-lg border", dark?"bg-emerald-500/20 border-emerald-400 text-emerald-200":"bg-emerald-600 border-emerald-600 text-white"].join(' ')}>
                      Mark returned
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </section>

          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold">Suggested next lunches</div>
              <button className={["text-xs font-medium px-2 py-1 rounded-lg border", dark?"bg-neutral-900 border-neutral-700 hover:bg-neutral-800":"bg-neutral-100 border-neutral-300 hover:bg-neutral-200"].join(' ')}>
                Re-run suggestions
              </button>
            </div>
            <div className="space-y-2">
              {SUGGESTIONS.map(suggestion=>(
                <article key={suggestion.id} className={["rounded-lg border px-3 py-2", dark?"bg-neutral-900 border-neutral-800":"bg-white border-neutral-200"].join(' ')}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="text-sm font-semibold">{suggestion.name}</div>
                      <div className={["text-xs", subtle].join(' ')}>Window {suggestion.window}</div>
                    </div>
                    <span className={["inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium", confidenceBadge(suggestion.confidence, dark)].join(' ')}>
                      {suggestion.confidence === 'high' ? 'High confidence' : suggestion.confidence === 'medium' ? 'Medium confidence' : 'Low confidence'}
                    </span>
                  </div>
                  <div className={["text-xs", subtle].join(' ')}>{suggestion.rationale}</div>
                  <div className="text-xs font-medium pt-1">Projected coverage: <span className={subtle}>{suggestion.coverageAfter}</span></div>
                  <div className="flex flex-wrap gap-2 pt-2 text-xs">
                    <button className={["px-2.5 py-1 rounded-lg border", dark?"bg-blue-500/20 border-blue-400 text-blue-200":"bg-blue-600 border-blue-600 text-white"].join(' ')}>
                      Approve slot
                    </button>
                    <button className={["px-2.5 py-1 rounded-lg border", dark?"bg-neutral-900 border-neutral-700 hover:bg-neutral-800":"bg-neutral-100 border-neutral-300 hover:bg-neutral-200"].join(' ')}>
                      Snooze 15 min
                    </button>
                    <button className={["px-2.5 py-1 rounded-lg border", dark?"bg-neutral-900 border-neutral-700 hover:bg-neutral-800":"bg-neutral-100 border-neutral-300 hover:bg-neutral-200"].join(' ')}>
                      Flag issue
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </section>
        </section>

        <aside className={["rounded-xl border p-4 space-y-3", cardBase].join(' ')}>
          <div>
            <div className="text-sm font-semibold">Agent self-serve preview</div>
            <div className={["text-xs", subtle].join(' ')}>What agents see when they join the lunch queue in the app.</div>
          </div>
          <div className={["rounded-lg border p-3 space-y-2", dark?"bg-neutral-950 border-neutral-800":"bg-neutral-50 border-neutral-200"].join(' ')}>
            <div className="text-sm font-semibold">{SELF_SERVE.greeting}</div>
            <div className={["text-xs", subtle].join(' ')}>{SELF_SERVE.currentTask}</div>
            <div className={["text-xs", subtle].join(' ')}>{SELF_SERVE.shiftLabel}: {SELF_SERVE.shiftRange}</div>
            <div className={["text-xs", subtle].join(' ')}>{SELF_SERVE.queuedAt}</div>
            <div className="text-xs font-medium">{SELF_SERVE.countdown}</div>
            <div className="flex flex-col gap-2">
              {SELF_SERVE.actions.map(action=>(
                <button
                  key={action.id}
                  className={["w-full px-3 py-1.5 rounded-lg border text-xs font-medium", action.intent==='primary'
                    ? (dark?"bg-blue-500/20 border-blue-400 text-blue-200":"bg-blue-600 border-blue-600 text-white")
                    : action.intent==='neutral'
                      ? (dark?"bg-neutral-900 border-neutral-700 hover:bg-neutral-800":"bg-neutral-100 border-neutral-300 hover:bg-neutral-200")
                      : (dark?"bg-rose-500/15 border border-rose-400 text-rose-200":"bg-rose-600 border-rose-600 text-white")
                  ].join(' ')}
                >
                  <div className="flex items-center justify-between">
                    <span>{action.label}</span>
                    <span className="text-[11px] opacity-80">{action.hint}</span>
                  </div>
                </button>
              ))}
            </div>
            <div className={["pt-2 border-t", divider].join(' ')}>
              <div className="text-xs font-semibold">Pre-lunch checklist</div>
              <ul className="mt-1 space-y-1">
                {SELF_SERVE.checklist.map(item=>(
                  <li key={item.id} className="flex items-start gap-2 text-xs">
                    <span className={["mt-0.5 h-3 w-3 rounded", item.done ? (dark?"bg-emerald-500":"bg-emerald-500") : (dark?"bg-neutral-800":"bg-neutral-200")].join(' ')}></span>
                    <span className={subtle}>{item.label}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className={["rounded-lg border p-3 space-y-2", dark?"bg-neutral-900 border-neutral-800":"bg-white border-neutral-200"].join(' ')}>
            <div className="text-sm font-semibold">Alerts &amp; escalations</div>
            <div className={["text-xs", subtle].join(' ')}>Supervisor notifications fan out to Slack, SMS, and email when coverage drops below 88%.</div>
            <ul className="space-y-1 text-xs">
              <li>
                <span className="font-medium">Auto-ping</span> → Mateo overdue by 12 min (Slack, SMS)
              </li>
              <li>
                <span className="font-medium">Coverage dip</span> → Queue B at 86% (Ops channel)
              </li>
              <li>
                <span className="font-medium">Override applied</span> → Riley lunch moved to 12:05 (audit log)
              </li>
            </ul>
            <button className={["w-full px-3 py-1.5 rounded-lg border text-xs font-medium", dark?"bg-neutral-900 border-neutral-700 hover:bg-neutral-800":"bg-neutral-100 border-neutral-300 hover:bg-neutral-200"].join(' ')}>
              View audit trail
            </button>
          </div>
        </aside>
      </div>

      <section className={["rounded-xl border p-4", cardBase].join(' ')}>
        <div className="flex flex-wrap items-center gap-2 justify-between">
          <div>
            <div className="text-sm font-semibold">Recent activity</div>
            <div className={["text-xs", subtle].join(' ')}>Mock timeline of events the Worker will emit for the lunch service.</div>
          </div>
          <button className={["px-3 py-1.5 rounded-lg border text-xs font-medium", dark?"bg-neutral-900 border-neutral-700 hover:bg-neutral-800":"bg-neutral-100 border-neutral-300 hover:bg-neutral-200"].join(' ')}>
            Export CSV
          </button>
        </div>
        <div className="mt-3 space-y-2 text-xs">
          <div className={["flex gap-3", subtle].join(' ')}>
            <span className={["w-16 font-semibold", timelineTime].join(' ')}>11:18</span>
            <span>Supervisor approved Riley for lunch slot 11:35 – 12:05.</span>
          </div>
          <div className={["flex gap-3", subtle].join(' ')}>
            <span className={["w-16 font-semibold", timelineTime].join(' ')}>11:15</span>
            <span>Mateo auto-ping escalated to SMS after 10 min overdue.</span>
          </div>
          <div className={["flex gap-3", subtle].join(' ')}>
            <span className={["w-16 font-semibold", timelineTime].join(' ')}>11:10</span>
            <span>Faith queued for lunch • flag: needs chat handoff.</span>
          </div>
          <div className={["flex gap-3", subtle].join(' ')}>
            <span className={["w-16 font-semibold", timelineTime].join(' ')}>11:05</span>
            <span>Coverage engine recomputed windows after PTO update.</span>
          </div>
        </div>
      </section>
    </div>
  )
}
