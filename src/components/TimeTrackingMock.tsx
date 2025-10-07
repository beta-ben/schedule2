import React from 'react'

type MockAgent = {
  id: string
  name: string
  status: 'On Shift' | 'On Break' | 'Clocked Out'
  since: string
  scheduledShift: string
  nextBreak: string | null
  jobCode: string
  notes?: string
}

type MockMetric = {
  label: string
  value: string
  sublabel?: string
  tone: 'neutral' | 'positive' | 'negative'
}

const AGENTS: MockAgent[] = [
  {
    id: 'a1',
    name: 'Alex Murphy',
    status: 'On Shift',
    since: 'Clocked in 17m ago',
    scheduledShift: '08:00 – 16:00 ET',
    nextBreak: 'Break due in 23m',
    jobCode: 'Support • Queue A',
    notes: 'Covering phone & SMS handoffs',
  },
  {
    id: 'a2',
    name: 'Priya Patel',
    status: 'On Break',
    since: 'Break started 5m ago',
    scheduledShift: '07:30 – 15:30 PT',
    nextBreak: 'Meal finished at 12:30',
    jobCode: 'Support • Queue B',
  },
  {
    id: 'a3',
    name: 'Jordan Lee',
    status: 'Clocked Out',
    since: 'Missed 09:00 start',
    scheduledShift: '09:00 – 17:00 ET',
    nextBreak: null,
    jobCode: 'Field • Install Crew',
    notes: 'Auto-alert sent at 09:10',
  },
]

const METRICS: MockMetric[] = [
  { label: 'On shift', value: '8', sublabel: 'of 10 scheduled', tone: 'neutral' },
  { label: 'Late clock-ins', value: '2', sublabel: 'today', tone: 'negative' },
  { label: 'Over break', value: '1', sublabel: 'watch Priya Patel', tone: 'negative' },
  { label: 'Today’s coverage', value: '94%', sublabel: 'goal 92%', tone: 'positive' },
]

const TIMELINE = [
  { time: '08:43', label: 'Alex clocked in (Desktop)' },
  { time: '08:47', label: 'Automatic QB Time sync confirmed' },
  { time: '09:05', label: 'Late alert • Jordan not clocked in' },
  { time: '11:30', label: 'Priya meal break started (Mobile)' },
  { time: '11:35', label: 'Break compliance reminder pending' },
]

const AGENT_PANEL = {
  greeting: 'Good morning, Alex! 👋',
  today: 'Tuesday, Feb 11',
  location: 'Support • Queue A',
  primaryShift: { label: 'Scheduled shift', range: '08:00 – 16:00 ET', status: 'You are 15 min into your shift.' },
  nextBreak: { label: 'Meal break', window: '11:45 – 12:15', status: 'Starts in 2h 30m' },
  actions: [
    { id: 'clock-in', label: 'Clock in', hint: 'Syncs to QB Time', intent: 'primary' as const },
    { id: 'break', label: 'Start break', hint: '15 min paid break', intent: 'neutral' as const },
    { id: 'lunch', label: 'Start meal', hint: '30 min unpaid', intent: 'danger' as const },
  ],
  compliance: [
    { label: 'Today so far', value: '0.3h logged', tone: 'neutral' as const },
    { label: 'This week', value: '18.5h', tone: 'positive' as const },
    { label: 'Break owed', value: '1 remaining', tone: 'neutral' as const },
  ],
  footer: {
    caption: 'Need to switch jobs?',
    note: 'Tap “Change job code” to pick from your assigned queues or field tasks.',
  },
}

function badgeTone(status: MockAgent['status'], dark: boolean){
  switch(status){
    case 'On Shift':
      return dark
        ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/40'
        : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
    case 'On Break':
      return dark
        ? 'bg-amber-500/15 text-amber-200 border border-amber-500/30'
        : 'bg-amber-50 text-amber-700 border border-amber-200'
    default:
      return dark
        ? 'bg-rose-500/15 text-rose-200 border border-rose-500/30'
        : 'bg-rose-50 text-rose-700 border border-rose-200'
  }
}

function metricTone(tone: MockMetric['tone'], dark: boolean){
  if(tone==='positive') return dark ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-200' : 'bg-emerald-50 border border-emerald-200 text-emerald-700'
  if(tone==='negative') return dark ? 'bg-rose-500/10 border border-rose-500/30 text-rose-200' : 'bg-rose-50 border border-rose-200 text-rose-700'
  return dark ? 'bg-neutral-500/10 border border-neutral-500/20 text-neutral-200' : 'bg-neutral-100 border border-neutral-300 text-neutral-700'
}

export default function TimeTrackingMock({ dark }: { dark: boolean }){
  const cardBase = dark
    ? 'bg-neutral-900 border-neutral-800'
    : 'bg-white border-neutral-200'
  const subtle = dark ? 'text-neutral-300' : 'text-neutral-600'
  const gridBg = dark ? 'bg-neutral-950' : 'bg-neutral-50'
  return (
    <div className="space-y-3">
      <div className={["rounded-xl border p-4", cardBase].join(' ')}>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-sm font-semibold">Clock &amp; Break Control</div>
            <div className={["text-xs", subtle].join(' ')}>Preview of the operator dashboard wired to QuickBooks Time.</div>
          </div>
          <div className="flex items-center gap-2">
            <button className={["px-3 py-1.5 rounded-lg border text-xs font-medium", dark?"bg-blue-500/20 border-blue-400 text-blue-200":"bg-blue-600 text-white border-blue-600"].join(' ')}>
              Launch Supervisor Console
            </button>
            <button className={["px-3 py-1.5 rounded-lg border text-xs font-medium", dark?"bg-neutral-900 border-neutral-700 hover:bg-neutral-800":"bg-neutral-100 border-neutral-300 hover:bg-neutral-200"].join(' ')}>
              Configure Rules
            </button>
          </div>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-[2fr_1fr]">
        <section className={["rounded-xl border p-4 space-y-3", cardBase].join(' ')}>
          <header className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
            <div className="text-sm font-semibold">Live roster</div>
            <div className={["text-xs", subtle].join(' ')}>Synced from QB Time every 30 seconds. Override any agent from here.</div>
          </header>
          <div className="space-y-2">
            {AGENTS.map(agent=>(
              <article
                key={agent.id}
                className={[
                  'rounded-lg border px-3 py-2 grid gap-y-1',
                  dark ? 'bg-neutral-900 border-neutral-800' : 'bg-white border-neutral-200',
                ].join(' ')}
              >
                <div className="flex flex-wrap items-center gap-2 justify-between">
                  <div className="text-sm font-semibold">{agent.name}</div>
                  <span className={["inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium", badgeTone(agent.status, dark)].join(' ')}>{agent.status}</span>
                </div>
                <div className={["text-xs", subtle].join(' ')}>{agent.jobCode}</div>
                <div className="grid sm:grid-cols-3 gap-2 text-xs">
                  <div>
                    <div className="font-medium">Status</div>
                    <div className={subtle}>{agent.since}</div>
                  </div>
                  <div>
                    <div className="font-medium">Scheduled</div>
                    <div className={subtle}>{agent.scheduledShift}</div>
                  </div>
                  <div>
                    <div className="font-medium">Next break</div>
                    <div className={subtle}>{agent.nextBreak || '—'}</div>
                  </div>
                </div>
                {agent.notes && (
                  <div className={["text-[11px]", subtle].join(' ')}>Note: {agent.notes}</div>
                )}
                <div className="flex flex-wrap gap-2 pt-1">
                  <button className={[
                    'px-2.5 py-1 rounded-lg border text-xs',
                    dark ? 'bg-neutral-900 border-neutral-700 hover:bg-neutral-800' : 'bg-neutral-100 border-neutral-300 hover:bg-neutral-200',
                  ].join(' ')}>
                    Clock in
                  </button>
                  <button className={[
                    'px-2.5 py-1 rounded-lg border text-xs',
                    dark ? 'bg-neutral-900 border-neutral-700 hover:bg-neutral-800' : 'bg-neutral-100 border-neutral-300 hover:bg-neutral-200',
                  ].join(' ')}>
                    Start break
                  </button>
                  <button className={[
                    'px-2.5 py-1 rounded-lg border text-xs',
                    dark ? 'bg-neutral-900 border-neutral-700 hover:bg-neutral-800' : 'bg-neutral-100 border-neutral-300 hover:bg-neutral-200',
                  ].join(' ')}>
                    End break
                  </button>
                  <button className={[
                    'px-2.5 py-1 rounded-lg border text-xs',
                    dark ? 'bg-neutral-900 border-neutral-700 hover:bg-neutral-800' : 'bg-neutral-100 border-neutral-300 hover:bg-neutral-200',
                  ].join(' ')}>
                    Clock out
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>

        <aside className="space-y-3">
          <div className={["rounded-xl border p-4", cardBase].join(' ')}>
            <div className="text-sm font-semibold mb-2">Compliance snapshot</div>
            <div className="grid grid-cols-2 gap-2">
              {METRICS.map(metric=>(
                <div key={metric.label} className={["rounded-lg px-3 py-2", metricTone(metric.tone, dark)].join(' ')}>
                  <div className="text-xs opacity-80">{metric.label}</div>
                  <div className="text-lg font-semibold">{metric.value}</div>
                  {metric.sublabel && (<div className="text-[11px] opacity-75">{metric.sublabel}</div>)}
                </div>
              ))}
            </div>
          </div>
          <div className={["rounded-xl border p-4", cardBase].join(' ')}>
            <div className="text-sm font-semibold mb-2">Activity feed</div>
            <div className={["rounded-lg p-3 space-y-2 text-xs", gridBg, dark?"text-neutral-200":"text-neutral-700"].join(' ')}>
              {TIMELINE.map(item=>(
                <div key={item.time} className="flex gap-3">
                  <span className="font-mono text-[11px] opacity-70 w-12">{item.time}</span>
                  <span>{item.label}</span>
                </div>
              ))}
            </div>
          </div>
          <div className={["rounded-xl border p-4", cardBase].join(' ')}>
            <div className="text-sm font-semibold mb-1">Automation rules</div>
            <ul className={["text-xs space-y-1", subtle].join(' ')}>
              <li>• Auto-clock-in allowed within 5 min of first meeting.</li>
              <li>• Break reminder DM at 4h elapsed time.</li>
              <li>• Escalate to supervisor if break exceeds 15 min.</li>
            </ul>
          </div>
        </aside>
      </div>

      <section className={["rounded-xl border p-4", cardBase].join(' ')}>
        <header className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between mb-3">
          <div>
            <div className="text-sm font-semibold">Agent kiosk preview</div>
            <div className={["text-xs", subtle].join(' ')}>This is the mobile-friendly view agents see when they clock in or manage breaks.</div>
          </div>
          <button className={["px-3 py-1.5 rounded-lg border text-xs font-medium", dark?"bg-blue-500/20 border-blue-400 text-blue-200":"bg-blue-600 text-white border-blue-600"].join(' ')}>
            Open kiosk in demo mode
          </button>
        </header>

        <div className={[
          'grid gap-3 md:grid-cols-[minmax(0,360px)_1fr]',
          dark ? 'bg-neutral-950/60' : 'bg-neutral-100',
          'rounded-xl p-4',
        ].join(' ')}>
          <div className={[
            'rounded-[36px] border p-6 mx-auto w-full max-w-[320px] shadow-inner flex flex-col gap-4',
            dark ? 'bg-neutral-900 border-neutral-800 text-neutral-100' : 'bg-white border-neutral-200 text-neutral-800',
          ].join(' ')}>
            <div>
              <div className="text-sm font-semibold">{AGENT_PANEL.greeting}</div>
              <div className={["text-xs", subtle].join(' ')}>{AGENT_PANEL.today}</div>
              <div className={["text-xs", subtle].join(' ')}>{AGENT_PANEL.location}</div>
            </div>
            <div className="space-y-2 text-xs">
              <div className={["rounded-lg border px-3 py-2", dark?"bg-neutral-900 border-neutral-800":"bg-neutral-50 border-neutral-200"].join(' ')}>
                <div className="font-medium">{AGENT_PANEL.primaryShift.label}</div>
                <div>{AGENT_PANEL.primaryShift.range}</div>
                <div className={["text-[11px]", subtle].join(' ')}>{AGENT_PANEL.primaryShift.status}</div>
              </div>
              <div className={["rounded-lg border px-3 py-2", dark?"bg-neutral-900 border-neutral-800":"bg-neutral-50 border-neutral-200"].join(' ')}>
                <div className="font-medium">{AGENT_PANEL.nextBreak.label}</div>
                <div>{AGENT_PANEL.nextBreak.window}</div>
                <div className={["text-[11px]", subtle].join(' ')}>{AGENT_PANEL.nextBreak.status}</div>
              </div>
            </div>
            <div className="space-y-2">
              {AGENT_PANEL.actions.map(action=>{
                const base = 'w-full px-3 py-2 rounded-lg text-sm font-semibold'
                const palette = action.intent==='primary'
                  ? (dark? 'bg-emerald-500 text-emerald-950' : 'bg-emerald-500 text-white')
                  : action.intent==='danger'
                    ? (dark? 'bg-rose-500/20 text-rose-200 border border-rose-500/40' : 'bg-rose-50 text-rose-700 border border-rose-200')
                    : (dark? 'bg-neutral-900 border border-neutral-700 text-neutral-100' : 'bg-white border border-neutral-300 text-neutral-800')
                return (
                  <button key={action.id} className={[base, palette].join(' ')}>
                    <div>{action.label}</div>
                    <div className="text-[11px] font-normal opacity-75">{action.hint}</div>
                  </button>
                )
              })}
            </div>
            <div className="grid grid-cols-3 gap-2 text-center text-[11px]">
              {AGENT_PANEL.compliance.map(item=>{
                const cls = item.tone==='positive'
                  ? (dark? 'bg-emerald-500/10 text-emerald-200' : 'bg-emerald-50 text-emerald-700')
                  : 'bg-neutral-200/40 text-neutral-700'
                return (
                  <div key={item.label} className={[cls, 'rounded-lg px-2 py-1'].join(' ')}>
                    <div className="font-semibold text-sm">{item.value}</div>
                    <div>{item.label}</div>
                  </div>
                )
              })}
            </div>
            <div className={["text-[11px]", subtle].join(' ')}>
              <div className="font-medium text-neutral-400">{AGENT_PANEL.footer.caption}</div>
              <div>{AGENT_PANEL.footer.note}</div>
            </div>
          </div>
          <div className={["text-xs space-y-3", subtle].join(' ')}>
            <div>
              <div className="text-sm font-semibold mb-1 text-neutral-400">Agent journey</div>
              <ol className="space-y-2">
                <li>1. Agent authenticates via magic link or SSO and lands here.</li>
                <li>2. “Clock in” posts a `POST /timesheets` to QB Time and locks the shift.</li>
                <li>3. Break buttons open separate QB Time entries with the right job code.</li>
                <li>4. Compliance tiles show accumulated hours from the latest sync.</li>
                <li>5. Sticky footer links to Knowledge Base or escalation channel.</li>
              </ol>
            </div>
            <div>
              <div className="text-sm font-semibold mb-1 text-neutral-400">Offline fallback</div>
              <p>If the QB Time API is unavailable, the kiosk stores events locally and replays them once the sync health check passes. Agents see a yellow banner until confirmation returns.</p>
            </div>
            <div>
              <div className="text-sm font-semibold mb-1 text-neutral-400">Customization hooks</div>
              <ul className="space-y-1">
                <li>• Swap the job selector for a dropdown if you have &gt;5 queues.</li>
                <li>• Surface target adherence % with green/yellow/red thresholds.</li>
                <li>• Add device telemetry (web, kiosk, mobile) for audit trails.</li>
              </ul>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
