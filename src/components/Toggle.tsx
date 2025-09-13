import React from 'react'

type Size = 'sm' | 'md'

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
  const baseW = size==='sm' ? 'w-8' : 'w-10'
  const baseH = size==='sm' ? 'h-4' : 'h-6'
  const knobSize = size==='sm' ? 'w-3 h-3' : 'w-5 h-5'
  const translate = size==='sm' ? 'translate-x-4' : 'translate-x-5'
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
        baseW, baseH,
        checked ? onBg : offBg,
        disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer',
        'focus:ring-offset-0', ring,
        className||''
      ].join(' ')}
    >
      <span
        className={[
          'inline-block rounded-full bg-white shadow transform transition-transform',
          knobSize,
          'translate-x-1',
          checked ? translate : ''
        ].join(' ')}
      />
    </button>
  )
}

