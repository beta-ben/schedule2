import React from 'react'

export type AccordionSectionProps = {
  title: string
  children: React.ReactNode
  dark?: boolean
  defaultOpen?: boolean
  className?: string
  id?: string
}

export default function AccordionSection({
  title,
  children,
  dark = false,
  defaultOpen = true,
  className,
  id,
}: AccordionSectionProps){
  const reactId = React.useId()
  const contentId = id || `accordion-${reactId}`
  const [open, setOpen] = React.useState(defaultOpen)
  const containerCls = [
    'overflow-hidden rounded-xl border',
    dark ? 'border-neutral-800 bg-neutral-900' : 'border-neutral-200 bg-white',
  ].join(' ')
  const headerCls = dark
    ? 'bg-neutral-900 text-neutral-100 hover:bg-neutral-800 border-b border-neutral-800'
    : 'bg-white text-neutral-900 hover:bg-neutral-50 border-b border-neutral-200'
  const contentCls = 'px-3 pb-3 pt-3'
  const chevronCls = dark ? 'text-neutral-400' : 'text-neutral-500'

  return (
    <section className={[className].filter(Boolean).join(' ')}>
      <div className={containerCls}>
        <button
          type="button"
          className={[
            'w-full flex items-center justify-between gap-3 px-4 py-3 text-left text-base font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2',
            dark ? 'focus:ring-neutral-700 focus:ring-offset-neutral-900' : 'focus:ring-blue-500 focus:ring-offset-white',
            headerCls,
          ].join(' ')}
          aria-expanded={open}
          aria-controls={contentId}
          onClick={()=> setOpen(v=>!v)}
        >
          <span>{title}</span>
          <svg
            className={["w-4 h-4 transform transition-transform", chevronCls, open ? 'rotate-90' : 'rotate-0'].join(' ')}
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
        <div
          id={contentId}
          hidden={!open}
          className={contentCls}
        >
          {children}
        </div>
      </div>
    </section>
  )
}
