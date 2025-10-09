import React from 'react'

type Size = 'sm' | 'md' | 'lg'

const SIZE_STYLES: Record<Size, { trackW: string; trackH: string; knob: string; translate: string }> = {
  sm: { trackW: 'w-8', trackH: 'h-4', knob: 'w-3 h-3', translate: 'translate-x-4' },
  md: { trackW: 'w-10', trackH: 'h-6', knob: 'w-5 h-5', translate: 'translate-x-5' },
  lg: { trackW: 'w-16', trackH: 'h-8', knob: 'w-7 h-7', translate: 'translate-x-8' },
}

export default function Toggle({
  checked,
  onChange,
  disabled,
  size = 'md',
  dark,
  className,
  ariaLabel,
}:{
  checked: boolean
  onChange: (next: boolean)=>void
  disabled?: boolean
  size?: Size
  dark?: boolean
  className?: string
  ariaLabel?: string
}){
  const { trackW, trackH, knob, translate } = SIZE_STYLES[size] || SIZE_STYLES.md
  const offBg = dark ? 'bg-neutral-700' : 'bg-neutral-300'
  const onBg = 'bg-blue-600'
  const ring = dark ? 'ring-neutral-600' : 'ring-neutral-300'
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={()=> !disabled && onChange(!checked)}
      className={[
        'relative inline-flex items-center rounded-full transition-colors focus:outline-none focus:ring-2',
        trackW, trackH,
        checked ? onBg : offBg,
        disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer',
        'focus:ring-offset-0', ring,
        className||''
      ].join(' ')}
    >
      <span
        className={[
          'inline-block rounded-full bg-white shadow transform transition-transform',
          knob,
          'translate-x-1',
          checked ? translate : ''
        ].join(' ')}
      />
    </button>
  )
}
