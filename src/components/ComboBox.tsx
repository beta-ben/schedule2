import React from 'react'

type ComboBoxProps = {
  value: string
  onChange: (next: string) => void
  options: string[]
  placeholder?: string
  disabled?: boolean
  dark?: boolean
  className?: string
  inputClassName?: string
  menuMaxHeight?: number
  autoComplete?: string
}

function uniqueOptions(options: string[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const opt of options) {
    const key = opt ?? ''
    if (seen.has(key)) continue
    seen.add(key)
    result.push(opt)
  }
  return result
}

export default function ComboBox({
  value,
  onChange,
  options,
  placeholder,
  disabled,
  dark,
  className,
  inputClassName,
  menuMaxHeight = 240,
  autoComplete,
}: ComboBoxProps) {
  const containerRef = React.useRef<HTMLDivElement | null>(null)
  const inputRef = React.useRef<HTMLInputElement | null>(null)
  const [open, setOpen] = React.useState(false)
  const [highlight, setHighlight] = React.useState<number>(-1)
  const normalizedOptions = React.useMemo(() => uniqueOptions(options).sort((a, b) => a.localeCompare(b)), [options])
  const filtered = React.useMemo(() => {
    const needle = value.trim().toLowerCase()
    if (!needle) return normalizedOptions
    return normalizedOptions.filter(opt => opt.toLowerCase().includes(needle))
  }, [normalizedOptions, value])

  const closeMenu = React.useCallback(() => {
    setOpen(false)
    setHighlight(-1)
  }, [])

  const commitValue = React.useCallback((next: string) => {
    onChange(next)
    closeMenu()
    // Maintain focus for quick successive selections
    requestAnimationFrame(() => {
      inputRef.current?.focus()
      inputRef.current?.select()
    })
  }, [closeMenu, onChange])

  React.useEffect(() => {
    if (!open) return
    const handleClick = (event: MouseEvent) => {
      const target = event.target as Node | null
      if (!containerRef.current || !target) return
      if (!containerRef.current.contains(target)) {
        closeMenu()
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open, closeMenu])

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    onChange(event.target.value)
    setOpen(true)
    setHighlight(-1)
  }

  const handleFocus = () => {
    if (disabled) return
    setOpen(true)
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
      event.preventDefault()
      setOpen(true)
      setHighlight(prev => {
        if (filtered.length === 0) return -1
        if (event.key === 'ArrowDown') return 0
        return filtered.length - 1
      })
      return
    }
    if (!open) return
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setHighlight(prev => {
        if (filtered.length === 0) return -1
        const next = prev + 1
        return next >= filtered.length ? 0 : next
      })
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setHighlight(prev => {
        if (filtered.length === 0) return -1
        const next = prev - 1
        return next < 0 ? filtered.length - 1 : next
      })
    } else if (event.key === 'Enter') {
      if (highlight >= 0 && highlight < filtered.length) {
        event.preventDefault()
        commitValue(filtered[highlight])
      } else {
        closeMenu()
      }
    } else if (event.key === 'Escape') {
      event.preventDefault()
      closeMenu()
    }
  }

  const menuStyles = {
    maxHeight: `${menuMaxHeight}px`,
  }

  return (
    <div ref={containerRef} className={['relative', className || ''].filter(Boolean).join(' ')}>
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={handleInputChange}
        onFocus={handleFocus}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        autoComplete={autoComplete}
        className={[
          'w-full rounded-lg border px-2 py-1.5 text-sm outline-none transition-colors',
          dark ? 'bg-neutral-900 border-neutral-700 text-neutral-100 focus:border-neutral-500' : 'bg-white border-neutral-300 text-neutral-800 focus:border-blue-500',
          inputClassName || '',
        ].filter(Boolean).join(' ')}
      />
      {open && (
        <ul
          role="listbox"
          className={[
            'absolute left-0 right-0 z-20 mt-1 overflow-auto rounded-lg border shadow-lg',
            dark ? 'bg-neutral-900 border-neutral-700 text-neutral-100' : 'bg-white border-neutral-200 text-neutral-800',
          ].join(' ')}
          style={menuStyles}
        >
          {filtered.length === 0 ? (
            <li className="px-3 py-2 text-sm opacity-60" aria-disabled={true}>No matches</li>
          ) : (
            filtered.map((option, idx) => (
              <li
                key={option || idx}
                role="option"
                aria-selected={highlight === idx}
                className={[
                  'cursor-pointer px-3 py-2 text-base',
                  highlight === idx
                    ? dark ? 'bg-neutral-800' : 'bg-neutral-100'
                    : '',
                ].filter(Boolean).join(' ')}
                onMouseEnter={() => setHighlight(idx)}
                onMouseDown={event => event.preventDefault()}
                onClick={() => commitValue(option)}
              >
                {option}
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  )
}
