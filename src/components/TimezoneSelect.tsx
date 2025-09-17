import React from 'react'
import { TZ_OPTS } from '../constants'
import type { TZOpt } from '../types'

export type TimezoneSelectProps = {
  value: string
  onSelect: (tz: TZOpt) => void
  dark?: boolean
  className?: string
  containerClassName?: string
  ariaLabel?: string
  title?: string
}

export default function TimezoneSelect({
  value,
  onSelect,
  dark = false,
  className,
  containerClassName,
  ariaLabel = 'Timezone',
  title = 'Timezone',
}: TimezoneSelectProps){
  const baseSelectCls = 'border rounded-lg pl-9 pr-2 text-sm appearance-none'
  const themeSelectCls = dark ? 'bg-neutral-900 border-neutral-700 text-neutral-200' : 'bg-white border-neutral-300 text-neutral-800'
  const iconCls = dark ? 'text-neutral-300' : 'text-neutral-600'

  return (
    <div className={['relative', containerClassName].filter(Boolean).join(' ')}>
      <svg
        aria-hidden
        className={['pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 w-5 h-5', iconCls].join(' ')}
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="12" cy="12" r="10" />
        <path d="M2 12h20" />
        <path d="M12 2a15.3 15.3 0 0 1 0 20a15.3 15.3 0 0 1 0-20" />
      </svg>
      <select
        aria-label={ariaLabel}
        title={title}
        className={[baseSelectCls, themeSelectCls, className].filter(Boolean).join(' ')}
        value={value}
        onChange={(event)=>{
          const opt = TZ_OPTS.find(t=> t.id === event.target.value)
          if(opt){
            onSelect(opt)
          }
        }}
      >
        {TZ_OPTS.map(opt => {
          const rawLabel = opt.name || opt.label || opt.id
          const displayLabel = rawLabel.replace(/\s*Time$/i, '').trim()
          return (
            <option key={opt.id} value={opt.id}>
              {displayLabel}
            </option>
          )
        })}
      </select>
    </div>
  )
}
