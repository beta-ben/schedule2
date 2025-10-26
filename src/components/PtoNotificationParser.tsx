import React from 'react'
import ComboBox from './ComboBox'
import { agentIdByName } from '../lib/utils'
import {
  cleanWhitespace,
  extractDates,
  extractTimeRange,
  normalizeDash,
  titleCase,
} from '../lib/notificationParsing'

type ParsedSuggestion = {
  person: string
  startDate: string
  endDate: string
  startTime: string
  endTime: string
  calendar: string
  confidence: number
}

type ParserStatus =
  | { state: 'idle'; message?: string }
  | { state: 'processing'; progress: number; message?: string }
  | { state: 'error'; message: string }

function parseNotification(text: string): ParsedSuggestion {
  const normalized = normalizeDash(text)
  const singleLine = cleanWhitespace(normalized)
  const { startTime, endTime } = extractTimeRange(singleLine)
  const { startDate, endDate } = extractDates(normalized)

  // Calendar extraction
  let calendar = ''
  const calendarMatch = normalized.match(
    /(?:on|to)\s+([A-Za-z0-9/&\-\s]+?(?:Calendar|calendar|PTO|Time Off|Schedule))/,
  )
  if (calendarMatch) {
    calendar = cleanWhitespace(calendarMatch[1]?.replace(/calendar$/i, '') ?? '')
  } else {
    const calendarLine = normalized
      .split('\n')
      .map((line) => line.trim())
      .find((line) => /calendar/i.test(line))
    if (calendarLine) {
      calendar = cleanWhitespace(calendarLine.replace(/.*?(Calendar)/i, '$1'))
    }
  }

  // Person extraction - take text before first time occurrence
  let person = ''
  const timeIndex =
    singleLine.search(/\d{1,2}(?::\d{2})?\s*(?:am|pm)?/i) ?? normalized.length
  if (timeIndex > 0) {
    const beforeTime = singleLine.slice(0, timeIndex).replace(/(was|were|has|have|is)$/i, '').trim()
    if (beforeTime) {
      const trimmed = beforeTime.replace(/created|scheduled|booked/i, '').trim()
      person = titleCase(trimmed.split(/(?:for|from|at|request)/i)[0]?.trim() ?? '')
    }
  }

  // Fallback: use first capitalized token from first line
  if (!person) {
    const firstLine = normalized.split('\n')[0] ?? ''
    const nameMatch = firstLine.match(/([A-Z][\w'.-]+(?:\s+[A-Z][\w'.-]+)*)/)
    if (nameMatch) {
      person = titleCase(nameMatch[1])
    }
  }

  const foundCount = [person, startDate, endDate, calendar].filter((field) => field).length
  const confidence = Math.round((foundCount / 4) * 100)

  return {
    person,
    startDate,
    endDate,
    startTime,
    endTime,
    calendar,
    confidence,
  }
}

async function recognizeImage(
  file: File,
  onProgress: (progress: number, message?: string) => void,
): Promise<string> {
  const tesseract = await import('tesseract.js')
  const recognize =
    (tesseract as any).recognize ?? (tesseract as any).default?.recognize
  if (!recognize) {
    throw new Error('Tesseract recognize() not available')
  }
  const { data } = await recognize(file, 'eng', {
    logger: (m: { status: string; progress: number }) => {
      if (typeof m.progress === 'number') onProgress(m.progress, m.status)
    },
  })
  return data.text
}

type ParserFields = {
  person: string
  startDate: string
  endDate: string
  startTime: string
  endTime: string
  calendar: string
}

type PtoNotificationParserProps = {
  dark: boolean
  agents: Array<{ id?: string; firstName?: string; lastName?: string }>
  onApply?: (suggestion: {
    person: string
    agentId?: string
    startDate: string
    endDate: string
    startTime: string
    endTime: string
    calendar: string
    rawText: string
    confidence: number
  }) => void
  collapsible?: boolean
  defaultCollapsed?: boolean
}

export default function PtoNotificationParser({
  dark,
  agents,
  onApply,
  collapsible = false,
  defaultCollapsed = false,
}: PtoNotificationParserProps) {
  const [rawText, setRawText] = React.useState('')
  const [fields, setFields] = React.useState<ParserFields>({
    person: '',
    startDate: '',
    endDate: '',
    startTime: '',
    endTime: '',
    calendar: '',
  })
  const [confidence, setConfidence] = React.useState(0)
  const [status, setStatus] = React.useState<ParserStatus>({ state: 'idle' })
  const fileInputRef = React.useRef<HTMLInputElement | null>(null)
  const [collapsed, setCollapsed] = React.useState(defaultCollapsed)

  const agentOptions = React.useMemo(() => {
    const seen = new Set<string>()
    const names: string[] = []
    for (const agent of agents) {
      const label = `${agent.firstName || ''} ${agent.lastName || ''}`.replace(/\s+/g, ' ').trim()
      if (!label) continue
      const key = label.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      names.push(label)
    }
    return names.sort((a, b) => a.localeCompare(b))
  }, [agents])

  const findBestAgentName = React.useCallback(
    (rawName: string) => {
      const candidate = rawName.trim().toLowerCase()
      if (!candidate) return ''
      let bestScore = 0
      let best = ''
      for (const option of agentOptions) {
        const normalized = option.toLowerCase()
        if (normalized === candidate) return option
        let score = 0
        const tokens = candidate.split(/\s+/).filter(Boolean)
        for (const token of tokens) {
          if (normalized.includes(token)) score += 1
          if (normalized.startsWith(token)) score += 1
        }
        const [optFirst = '', optLast = ''] = normalized.split(/\s+/)
        const [candFirst = '', candLast = ''] = tokens
        if (candFirst && optFirst.startsWith(candFirst)) score += 1
        if (candLast && optLast.startsWith(candLast)) score += 1
        if (score > bestScore) {
          bestScore = score
          best = option
        }
      }
      return bestScore > 0 ? best : ''
    },
    [agentOptions],
  )

  const findAgentId = React.useCallback(
    (name: string) => agentIdByName(agents as any, name) ?? undefined,
    [agents],
  )

  const updateFromText = React.useCallback((input: string) => {
    const normalized = input.replace(/\r\n/g, '\n')
    const trimmed = normalized.trim()
    setRawText(normalized)
    if (!trimmed) {
      setFields({
        person: '',
        startDate: '',
        endDate: '',
        startTime: '',
        endTime: '',
        calendar: '',
      })
      setConfidence(0)
      return
    }
    const suggestion = parseNotification(trimmed)
    const bestMatch = findBestAgentName(suggestion.person)
    setFields({
      person: bestMatch || suggestion.person,
      startDate: suggestion.startDate,
      endDate: suggestion.endDate,
      startTime: suggestion.startTime,
      endTime: suggestion.endTime,
      calendar: suggestion.calendar,
    })
    setConfidence(suggestion.confidence)
  }, [findBestAgentName])

  const handleText = React.useCallback(
    (text: string) => {
      setStatus({ state: 'idle' })
      updateFromText(text)
    },
    [updateFromText],
  )

  const handleFile = React.useCallback(
    async (file: File) => {
      setStatus({ state: 'processing', progress: 0, message: 'Running OCR...' })
      try {
        const text = await recognizeImage(file, (progress, message) => {
          setStatus({ state: 'processing', progress, message })
        })
        setStatus({ state: 'idle' })
        updateFromText(text)
      } catch (err) {
        console.error(err)
        setStatus({
          state: 'error',
          message: err instanceof Error ? err.message : 'Failed to extract text',
        })
      }
    },
    [updateFromText],
  )

  const handleDrop = React.useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault()
      const file = event.dataTransfer.files?.[0]
      if (file && file.type.startsWith('image/')) {
        void handleFile(file)
      } else if (file) {
        setStatus({ state: 'error', message: 'Please drop an image file.' })
      }
    },
    [handleFile],
  )

  const handlePaste = React.useCallback(
    (event: React.ClipboardEvent<HTMLElement>) => {
      const target = event.target as HTMLElement | null
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        return
      }
      const clipboardData = event.clipboardData
      const items = clipboardData.items
      let handled = false
      for (let i = 0; i < items.length; i += 1) {
        const item = items[i]
        if (item.kind === 'file') {
          const file = item.getAsFile()
          if (file && file.type.startsWith('image/')) {
            handled = true
            event.preventDefault()
            void handleFile(file)
            break
          }
        }
      }
      if (!handled) {
        const text = clipboardData.getData('text/plain')
        if (text) {
          event.preventDefault()
          handleText(text)
        }
      }
    },
    [handleFile, handleText],
  )

  const matchedAgentName = React.useMemo(() => {
    const current = fields.person.trim().toLowerCase()
    if (!current) return ''
    const exact = agentOptions.find((option) => option.toLowerCase() === current)
    return exact ?? ''
  }, [agentOptions, fields.person])

  const matchedAgentId = React.useMemo(
    () => (matchedAgentName ? findAgentId(matchedAgentName) : undefined),
    [findAgentId, matchedAgentName],
  )

  const borderClasses = dark
    ? 'border-neutral-800 bg-neutral-950 text-neutral-100'
    : 'border-neutral-200 bg-white text-neutral-800'

  const dropZoneClasses = dark
    ? 'border-neutral-700 bg-neutral-900/60 text-neutral-200 hover:border-blue-500'
    : 'border-neutral-300 bg-neutral-50 text-neutral-700 hover:border-blue-500'

  const inputClasses = dark
    ? 'w-full rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1 text-sm text-neutral-100 focus:border-blue-500 focus:outline-none'
    : 'w-full rounded-md border border-neutral-300 bg-white px-2 py-1 text-sm text-neutral-900 focus:border-blue-500 focus:outline-none'

  return (
    <section className={`rounded-lg border ${borderClasses}`}>
      <div
        className={`flex items-center justify-between border-b px-3 py-2 ${
          dark ? 'border-neutral-800 bg-neutral-900 text-neutral-100' : 'border-neutral-200 bg-neutral-50 text-neutral-800'
        }`}
      >
        <span className="text-sm font-semibold">PTO notification parser</span>
        <div className="flex items-center gap-3">
          {confidence ? <span className="text-xs opacity-70">Confidence {confidence}%</span> : null}
          {collapsible ? (
            <button
              type="button"
              className="text-xs font-medium text-blue-500 hover:underline"
              onClick={() => setCollapsed((prev) => !prev)}
            >
              {collapsed ? 'Expand' : 'Collapse'}
            </button>
          ) : null}
        </div>
      </div>
      <div className={`space-y-4 px-3 py-3 text-sm ${collapsed ? 'hidden' : ''}`}>
        <div
          className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed px-4 py-6 text-center transition-colors ${dropZoneClasses}`}
          onDragOver={(event) => event.preventDefault()}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          onPaste={handlePaste}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (file) void handleFile(file)
            }}
          />
          <span className="text-sm font-medium">Paste, drop, or select a notification screenshot</span>
          <span className="text-xs opacity-70">Images run through in-browser OCR · Plain text parsed instantly</span>
          {status.state === 'processing' ? (
            <div className="mt-2 flex w-full max-w-xs flex-col items-center gap-1">
              <div className="h-1 w-full overflow-hidden rounded bg-neutral-500/30">
                <div
                  className="h-full rounded bg-blue-500 transition-all"
                  style={{ width: `${Math.round(status.progress * 100)}%` }}
                />
              </div>
              <span className="text-xs opacity-70">{status.message ?? 'Processing…'}</span>
            </div>
          ) : null}
          {status.state === 'error' ? (
            <span className="text-xs text-red-500">{status.message}</span>
          ) : null}
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium uppercase tracking-wide opacity-70">Agent</span>
            <ComboBox
              value={fields.person}
              onChange={(next) =>
                setFields((prev) => ({
                  ...prev,
                  person: next.replace(/\s+/g, ' ').trim(),
                }))
              }
              options={agentOptions}
              placeholder="Select an agent"
              dark={dark}
            />
            {fields.person && !matchedAgentName ? (
              <span className="text-xs text-amber-500">Select an existing agent before approving.</span>
            ) : null}
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium uppercase tracking-wide opacity-70">Calendar / type</span>
            <input
              className={inputClasses}
              value={fields.calendar}
              placeholder="Calendar name"
              onChange={(event) =>
                setFields((prev) => ({ ...prev, calendar: event.target.value }))
              }
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium uppercase tracking-wide opacity-70">Start date</span>
            <input
              type="date"
              className={inputClasses}
              value={fields.startDate}
              onChange={(event) => {
                const next = event.target.value
                setFields((prev) => ({
                  ...prev,
                  startDate: next,
                  endDate: prev.endDate && prev.endDate < next ? next : prev.endDate || next,
                }))
              }}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium uppercase tracking-wide opacity-70">End date</span>
            <input
              type="date"
              className={inputClasses}
              value={fields.endDate}
              min={fields.startDate || undefined}
              onChange={(event) =>
                setFields((prev) => ({
                  ...prev,
                  endDate: event.target.value,
                }))
              }
            />
          </label>
        </div>
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium uppercase tracking-wide opacity-70">Raw source</span>
            {rawText ? (
              <button
                type="button"
                className="text-xs font-medium text-blue-500 hover:underline"
                onClick={() => {
                  updateFromText('')
                  setRawText('')
                }}
              >
                Clear
              </button>
            ) : null}
          </div>
          <textarea
            value={rawText}
            placeholder="Paste or drop a notification to see the raw text here."
            onChange={(event) => updateFromText(event.target.value)}
            className={`min-h-[96px] w-full rounded-md border px-3 py-2 text-sm shadow-sm ${
              dark
                ? 'border-neutral-800 bg-neutral-900 text-neutral-100 placeholder:text-neutral-500'
                : 'border-neutral-200 bg-neutral-50 text-neutral-800 placeholder:text-neutral-500'
            }`}
          />
        </div>
        <div
          className={`rounded-md border px-3 py-3 text-sm ${
            dark ? 'border-neutral-800 bg-neutral-900 text-neutral-100' : 'border-neutral-200 bg-neutral-50 text-neutral-800'
          }`}
        >
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wide opacity-70">Suggested entry</span>
              {matchedAgentName ? (
                <span className="text-xs opacity-70">{matchedAgentName}</span>
              ) : (
                <span className="text-xs opacity-70">No agent selected</span>
              )}
            </div>
            <div className="text-xs opacity-80">
              {fields.startDate
                ? [fields.startDate, fields.endDate || fields.startDate]
                    .filter(Boolean)
                    .join(' – ')
                : 'Dates unavailable'}
            </div>
            {[fields.startTime, fields.endTime].filter(Boolean).length ? (
              <div className="text-xs opacity-70">
                {[fields.startTime, fields.endTime].filter(Boolean).join(' – ')}
              </div>
            ) : null}
            {fields.calendar ? <div className="text-xs opacity-80">{fields.calendar}</div> : null}
          </div>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              disabled={!onApply || !matchedAgentName || !fields.startDate}
              onClick={() => {
                if (!onApply || !matchedAgentName || !fields.startDate) return
                onApply({
                  person: matchedAgentName,
                  agentId: matchedAgentId,
                  startDate: fields.startDate,
                  endDate: fields.endDate || fields.startDate,
                  startTime: fields.startTime.trim(),
                  endTime: fields.endTime.trim(),
                  calendar: fields.calendar.trim(),
                  rawText,
                  confidence,
                })
              }}
              className={[
                'inline-flex items-center justify-center rounded-md px-3 py-2 text-sm font-medium transition-colors border',
                !onApply || !matchedAgentName || !fields.startDate
                  ? dark
                    ? 'border-neutral-800 bg-neutral-900 text-neutral-500 cursor-not-allowed'
                    : 'border-neutral-200 bg-neutral-100 text-neutral-400 cursor-not-allowed'
                  : dark
                    ? 'border-blue-500 bg-blue-600/20 text-blue-200 hover:bg-blue-600/30'
                    : 'border-blue-500 bg-blue-500 text-white hover:bg-blue-600',
              ].join(' ')}
            >
              Apply to PTO form
            </button>
          </div>
        </div>
      </div>
    </section>
  )
}
