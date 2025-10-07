import React from 'react'

type Availability = 'live' | 'beta' | 'planned'

type TeamsCommand = {
  id: string
  trigger: string
  description: string
  example: string
  availability: Availability
}

type Workflow = {
  id: string
  title: string
  subtitle: string
  steps: Array<{ id: string; label: string; detail: string; status: 'complete' | 'pending' | 'blocked' }>
}

type Notification = {
  id: string
  time: string
  channel: string
  summary: string
}

const COMMANDS: TeamsCommand[] = [
  {
    id: 'cmd-queue',
    trigger: '/lunch queue',
    description: 'Show who is queued or out for lunch right now.',
    example: 'Ops just typed /lunch queue in #support-ops.',
    availability: 'live',
  },
  {
    id: 'cmd-slot',
    trigger: '/lunch slot @name',
    description: 'Approve or deny a suggested lunch window for an agent.',
    example: 'Reply “/lunch slot approve @faith” to grant the open slot.',
    availability: 'beta',
  },
  {
    id: 'cmd-rules',
    trigger: '/lunch rules',
    description: 'Get the current stagger and coverage guardrails.',
    example: 'Command posts a card with the editable rules summary.',
    availability: 'planned',
  },
]

const WORKFLOWS: Workflow[] = [
  {
    id: 'wf-daily',
    title: 'Daily Ops Rundown',
    subtitle: 'Trigger at 10:45 ET in #support-ops',
    steps: [
      { id: 'step-coverage', label: 'Coverage snapshot', detail: 'Pulls from lunch service metrics.', status: 'complete' },
      { id: 'step-queue', label: 'Lunch queue card', detail: 'Embeds queued + out agents.', status: 'complete' },
      { id: 'step-alerts', label: 'Escalations', detail: 'Lists overdue lunches, pings supervisors.', status: 'pending' },
    ],
  },
  {
    id: 'wf-adhoc',
    title: 'Ad-hoc Agent Request',
    subtitle: 'For supervisors replying in DM threads',
    steps: [
      { id: 'step-check', label: 'Validate coverage', detail: 'Checks projected coverage before approval.', status: 'complete' },
      { id: 'step-approve', label: 'Apply override', detail: 'Calls lunch override endpoint with Teams user id.', status: 'pending' },
      { id: 'step-log', label: 'Write audit trail', detail: 'Records Teams message link + supervisor id.', status: 'blocked' },
    ],
  },
]

const NOTIFICATIONS: Notification[] = [
  { id: 'n1', time: '11:12', channel: 'DM to Mateo Ruiz', summary: 'Heads-up: your lunch slot ends in 3 min.' },
  { id: 'n2', time: '11:10', channel: '#support-ops', summary: 'Faith queued for lunch; Riley will cover chats.' },
  { id: 'n3', time: '11:05', channel: 'DM to Ops Supervisor', summary: 'Coverage dips to 88% if another lunch is approved before 11:30.' },
]

function availabilityTone(availability: Availability, dark: boolean){
  if(availability==='live') return dark ? 'bg-emerald-500/15 text-emerald-200 border border-emerald-500/30' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
  if(availability==='beta') return dark ? 'bg-amber-500/15 text-amber-200 border border-amber-500/30' : 'bg-amber-50 text-amber-700 border border-amber-200'
  return dark ? 'bg-neutral-500/15 text-neutral-200 border border-neutral-500/25' : 'bg-neutral-100 text-neutral-700 border border-neutral-300'
}

function stepStatusTone(status: Workflow['steps'][number]['status'], dark: boolean){
  if(status==='complete') return dark ? 'text-emerald-200' : 'text-emerald-700'
  if(status==='pending') return dark ? 'text-amber-200' : 'text-amber-700'
  return dark ? 'text-rose-200' : 'text-rose-700'
}

export default function TeamsCommandsMock({ dark }: { dark: boolean }){
  const cardBase = dark ? 'bg-neutral-900 border-neutral-800' : 'bg-white border-neutral-200'
  const subtle = dark ? 'text-neutral-300' : 'text-neutral-600'
  const divider = dark ? 'border-neutral-800' : 'border-neutral-200'
  return (
    <div className="space-y-3">
      <section className={["rounded-xl border p-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between", cardBase].join(' ')}>
        <div>
          <div className="text-sm font-semibold">Teams command integration</div>
          <div className={["text-xs", subtle].join(' ')}>Honor-system pilot — commands talk to the lunch service through the Worker webhook.</div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className={["px-3 py-1.5 rounded-lg border text-xs font-medium", dark?"bg-blue-500/20 border-blue-400 text-blue-200":"bg-blue-600 text-white border-blue-600"].join(' ')}>
            Connect to Teams
          </button>
          <button className={["px-3 py-1.5 rounded-lg border text-xs font-medium", dark?"bg-neutral-900 border-neutral-700 hover:bg-neutral-800":"bg-neutral-100 border-neutral-300 hover:bg-neutral-200"].join(' ')}>
            Configure bot commands
          </button>
        </div>
      </section>

      <div className="grid gap-3 xl:grid-cols-[1.6fr_1.1fr]">
        <section className={["rounded-xl border p-4 space-y-3", cardBase].join(' ')}>
          <header className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
            <div>
              <div className="text-sm font-semibold">Available commands</div>
              <div className={["text-xs", subtle].join(' ')}>Slash commands surfaced via the Teams messaging extension.</div>
            </div>
            <button className={["text-xs font-medium px-2 py-1 rounded-lg border", dark?"bg-neutral-900 border-neutral-700 hover:bg-neutral-800":"bg-neutral-100 border-neutral-300 hover:bg-neutral-200"].join(' ')}>
              Manage scopes
            </button>
          </header>
          <div className="space-y-2">
            {COMMANDS.map(command=>(
              <article key={command.id} className={["rounded-lg border px-3 py-2", dark?"bg-neutral-900 border-neutral-800":"bg-white border-neutral-200"].join(' ')}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="text-sm font-semibold">{command.trigger}</div>
                    <div className={["text-xs", subtle].join(' ')}>{command.description}</div>
                  </div>
                  <span className={["inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium", availabilityTone(command.availability, dark)].join(' ')}>
                    {command.availability === 'live' ? 'Live' : command.availability === 'beta' ? 'Beta' : 'Planned' }
                  </span>
                </div>
                <div className={["text-xs", subtle].join(' ')}>{command.example}</div>
              </article>
            ))}
          </div>

          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold">Workflows</div>
              <button className={["text-xs font-medium px-2 py-1 rounded-lg border", dark?"bg-neutral-900 border-neutral-700 hover:bg-neutral-800":"bg-neutral-100 border-neutral-300 hover:bg-neutral-200"].join(' ')}>
                View adaptive cards
              </button>
            </div>
            <div className="space-y-2">
              {WORKFLOWS.map(workflow=>(
                <article key={workflow.id} className={["rounded-lg border px-3 py-2", dark?"bg-neutral-900 border-neutral-800":"bg-white border-neutral-200"].join(' ')}>
                  <div className="text-sm font-semibold">{workflow.title}</div>
                  <div className={["text-xs", subtle].join(' ')}>{workflow.subtitle}</div>
                  <ul className="mt-2 space-y-1">
                    {workflow.steps.map(step=>(
                      <li key={step.id} className="flex items-start gap-2 text-xs">
                        <span className={["mt-0.5 h-3 w-3 rounded-full", step.status==='complete'
                          ? (dark?"bg-emerald-500":"bg-emerald-500")
                          : step.status==='pending'
                            ? (dark?"bg-amber-500":"bg-amber-500")
                            : (dark?"bg-rose-500":"bg-rose-500")].join(' ')}></span>
                        <div>
                          <div className={["font-medium", stepStatusTone(step.status, dark)].join(' ')}>{step.label}</div>
                          <div className={subtle}>{step.detail}</div>
                        </div>
                      </li>
                    ))}
                  </ul>
                </article>
              ))}
            </div>
          </section>
        </section>

        <aside className={["rounded-xl border p-4 space-y-3", cardBase].join(' ')}>
          <div>
            <div className="text-sm font-semibold">Sample Teams thread</div>
            <div className={["text-xs", subtle].join(' ')}>Preview of the command replies Agents and supervisors will see.</div>
          </div>
          <div className={["rounded-lg border p-3 space-y-2", dark?"bg-neutral-950 border-neutral-800":"bg-neutral-50 border-neutral-200"].join(' ')}>
            <div className="flex items-center gap-2 text-xs">
              <span className="font-semibold">Faith Chen</span>
              <span className={["px-2 py-0.5 rounded-full text-[11px] font-medium", dark?"bg-sky-500/15 text-sky-200":"bg-sky-50 text-sky-700 border border-sky-200"].join(' ')}>
                /lunch queue
              </span>
            </div>
            <div className={["rounded border px-3 py-2 space-y-2", dark?"bg-neutral-900 border-neutral-800":"bg-white border-neutral-200"].join(' ')}>
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold">Lunch queue — 11:10 ET</span>
                <span className="text-[11px] opacity-80">Coverage 92%</span>
              </div>
              <div className="space-y-1 text-xs">
                <div className={["flex items-center gap-2", subtle].join(' ')}>
                  <span className="font-medium text-white bg-emerald-500 px-1.5 py-0.5 rounded">✔</span>
                  <span>Faith Chen — next slot in 2 min • chats handing to Riley</span>
                </div>
                <div className={["flex items-center gap-2", subtle].join(' ')}>
                  <span className="font-medium text-white bg-emerald-500 px-1.5 py-0.5 rounded">✔</span>
                  <span>Jamal Ortiz — at lunch • due back 11:35</span>
                </div>
                <div className={["flex items-center gap-2", subtle].join(' ')}>
                  <span className="font-medium text-white bg-rose-500 px-1.5 py-0.5 rounded">!</span>
                  <span>Mateo Ruiz — overdue 12 min • ping sent to #ops-alerts</span>
                </div>
              </div>
              <button className={["w-full text-xs font-medium px-2 py-1.5 rounded-lg border", dark?"bg-neutral-900 border-neutral-700 hover:bg-neutral-800":"bg-neutral-100 border-neutral-300 hover:bg-neutral-200"].join(' ')}>
                Approve suggested slot for Riley
              </button>
            </div>
          </div>

          <div className={["rounded-lg border p-3 space-y-2", dark?"bg-neutral-900 border-neutral-800":"bg-white border-neutral-200"].join(' ')}>
            <div className="text-sm font-semibold">Notifications</div>
            <div className={["text-xs", subtle].join(' ')}>Recent hooks we will emit to Teams.</div>
            <ul className="space-y-1 text-xs">
              {NOTIFICATIONS.map(note=>(
                <li key={note.id} className="flex items-start gap-2">
                  <span className="w-14 font-semibold text-neutral-500 dark:text-neutral-400">{note.time}</span>
                  <div>
                    <div className="font-medium">{note.channel}</div>
                    <div className={subtle}>{note.summary}</div>
                  </div>
                </li>
              ))}
            </ul>
            <button className={["w-full px-3 py-1.5 rounded-lg border text-xs font-medium", dark?"bg-neutral-900 border-neutral-700 hover:bg-neutral-800":"bg-neutral-100 border-neutral-300 hover:bg-neutral-200"].join(' ')}>
              Configure routing
            </button>
          </div>
        </aside>
      </div>

      <section className={["rounded-xl border p-4", cardBase].join(' ')}>
        <div className="flex flex-wrap items-center gap-2 justify-between">
          <div>
            <div className="text-sm font-semibold">Setup checklist</div>
            <div className={["text-xs", subtle].join(' ')}>Add Teams app id + secret to Worker env vars and map Teams user ids to agents.</div>
          </div>
          <button className={["px-3 py-1.5 rounded-lg border text-xs font-medium", dark?"bg-neutral-900 border-neutral-700 hover:bg-neutral-800":"bg-neutral-100 border-neutral-300 hover:bg-neutral-200"].join(' ')}>
            Open configuration doc
          </button>
        </div>
        <div className="mt-3 grid gap-2 text-xs">
          <div className={["flex items-center gap-2", subtle].join(' ')}>
            <span className="h-3 w-3 rounded-full bg-emerald-500"></span>
            <span>App registration created in Azure and bot endpoint reachable.</span>
          </div>
          <div className={["flex items-center gap-2", subtle].join(' ')}>
            <span className="h-3 w-3 rounded-full bg-amber-500"></span>
            <span>D1 table <code>teams_command_audit</code> scaffolded (pending migrations).</span>
          </div>
          <div className={["flex items-center gap-2", subtle].join(' ')}>
            <span className="h-3 w-3 rounded-full bg-rose-500"></span>
            <span>User mapping between Teams AAD ids and agents not yet imported.</span>
          </div>
        </div>
      </section>
    </div>
  )
}
