import React from 'react'
import type { Shift, PTO, Override } from '../types'
import type { AgentRow } from './manageV2/types'

type Props = {
  dark: boolean
  weekStart: string
  shifts: Shift[]
  pto: PTO[]
  overrides: Override[]
  tz: { id: string; label: string; offset: number }
  agents: AgentRow[]
}

export default function ImmersiveSchedulePage({ dark }: Props){
  const wrapperCls = [
    'min-h-[60vh] rounded-2xl border px-6 py-10 flex flex-col items-center justify-center text-center space-y-3',
    dark ? 'bg-neutral-950 border-neutral-800 text-neutral-100' : 'bg-white border-neutral-200 text-neutral-800'
  ].join(' ')
  return (
    <section className={wrapperCls}>
      <h1 className="text-xl font-semibold tracking-tight">Immersive schedule preview is coming soon</h1>
      <p className="max-w-md text-sm opacity-75">
        We’re polishing the immersive waterfall experience. In the meantime, use the standard schedule or manage views for daily operations.
      </p>
    </section>
  )
}
