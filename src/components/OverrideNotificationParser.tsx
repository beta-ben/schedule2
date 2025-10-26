import React from 'react'
import ComboBox from './ComboBox'
import { agentIdByName } from '../lib/utils'
import {
  cleanWhitespace,
  convertTimeTo24Hour,
  extractDates,
  extractTimeRange,
  normalizeDash,
  titleCase,
} from '../lib/notificationParsing'

type ParserStatus =
  | { state: 'idle'; message?: string }
  | { state: 'processing'; progress: number; message?: string }
  | { state: 'error'; message: string }

type OverrideSuggestion = {
  id: string
  include: boolean
  person: string
  counterpart?: string
  startDate: string
  endDate: string
  startTime: string
  endTime: string
  kind: string
  notes: string
  confidence: number
  role: 'covering' | 'covered' | 'swap' | 'single'
}

type OverrideApplyPayload = {
  person: string
  agentId?: string
  startDate: string
  endDate: string
  startTime?: string
  endTime?: string
  kind?: string
  notes?: string
  counterpart?: string
  rawText: string
  confidence: number
  role: 'covering' | 'covered' | 'swap' | 'single'
}

type OverrideNotificationParserProps = {
  dark: boolean
  agents: Array<{ id?: string; firstName?: string; lastName?: string }>
  onApply?: (suggestions: OverrideApplyPayload[]) => void
}

function recognizeImage(
  file: File,
  onProgress: (progress: number, message?: string) => void,
): Promise<string> {
  return import('tesseract.js').then((tesseract) => {
    const recognize =
      (tesseract as any).recognize ?? (tesseract as any).default?.recognize
    if (!recognize) {
      throw new Error('Tesseract recognize() not available')
    }
    return recognize(file, 'eng', {
      logger: (m: { status: string; progress: number }) => {
        if (typeof m.progress === 'number') onProgress(m.progress, m.status)
      },
    }).then((result: { data: { text: string } }) => result.data.text)
  })
}

function computeConfidence(flags: Array<boolean>): number {
  if (flags.length === 0) return 0
  const positives = flags.filter(Boolean).length
  return Math.round((positives / flags.length) * 100)
}

function createSuggestion(partial: Omit<OverrideSuggestion, 'id' | 'include'>): OverrideSuggestion {
  const id =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `override-suggestion-${Math.random().toString(36).slice(2)}`
  return {
    id,
    include: true,
    ...partial,
  }
}

function parseOverrideSuggestions(
  text: string,
  findBestAgentName: (rawName: string) => string,
): OverrideSuggestion[] {
  const normalized = normalizeDash(text)
  const singleLine = cleanWhitespace(normalized)
  const { startDate, endDate } = extractDates(normalized)
  const { startTime: rawStartTime, endTime: rawEndTime } = extractTimeRange(singleLine)
  const startTime = convertTimeTo24Hour(rawStartTime)
  const endTime = convertTimeTo24Hour(rawEndTime)
  const lower = normalized.toLowerCase()

  let defaultKind = 'Override'
  if (/\bswap\b|\bswitch\b|\btrade\b/.test(lower)) {
    defaultKind = 'Swap'
  } else if (/\bin\s+for\b|\bcover\b|\bcovering\b|\bfilling\s+in\b/.test(lower)) {
    defaultKind = 'Coverage'
  }

  type PairRelation = 'coverage' | 'swap'
  const pairPatterns: Array<{ regex: RegExp; relation: PairRelation }> = [
    {
      regex:
        /([A-Z][\w'.-]+(?:\s+[A-Z][\w'.-]+)*)\s+(?:is\s+)?filling\s+in\s+for\s+([A-Z][\w'.-]+(?:\s+[A-Z][\w'.-]+)*)/gi,
      relation: 'coverage',
    },
    {
      regex:
        /([A-Z][\w'.-]+(?:\s+[A-Z][\w'.-]+)*)\s+(?:is\s+)?in\s+for\s+([A-Z][\w'.-]+(?:\s+[A-Z][\w'.-]+)*)/gi,
      relation: 'coverage',
    },
    {
      regex:
        /([A-Z][\w'.-]+(?:\s+[A-Z][\w'.-]+)*)\s+(?:is\s+)?cover(?:ing)?(?:\s+\w+){0,3}?\s+for\s+([A-Z][\w'.-]+(?:\s+[A-Z][\w'.-]+)*)/gi,
      relation: 'coverage',
    },
    {
      regex:
        /([A-Z][\w'.-]+(?:\s+[A-Z][\w'.-]+)*)\s+(?:is\s+)?(?:swap(?:ping)?|switch(?:ing)?|trade(?:ing)?|trading)\s+with\s+([A-Z][\w'.-]+(?:\s+[A-Z][\w'.-]+)*)/gi,
      relation: 'swap',
    },
  ]

  const suggestionKeys = new Set<string>()
  const suggestions: OverrideSuggestion[] = []

  const addSuggestion = (partial: Omit<OverrideSuggestion, 'id' | 'include'>) => {
    const key = [partial.role, partial.person.toLowerCase(), partial.counterpart?.toLowerCase() ?? ''].join('|')
    if (suggestionKeys.has(key)) return
    suggestionKeys.add(key)
    suggestions.push(createSuggestion(partial))
  }

  const pairs: Array<{
    covering: string
    covered: string
    relation: PairRelation
    index: number
  }> = []
  const pairSeen = new Set<string>()

  for (const { regex, relation } of pairPatterns) {
    for (const match of normalized.matchAll(regex)) {
      const coveringRaw = match[1]?.trim() ?? ''
      const coveredRaw = match[2]?.trim() ?? ''
      if (!coveringRaw || !coveredRaw) continue
      const key = `${coveringRaw.toLowerCase()}|${coveredRaw.toLowerCase()}|${relation}`
      if (pairSeen.has(key)) continue
      pairSeen.add(key)
      pairs.push({
        covering: coveringRaw,
        covered: coveredRaw,
        relation,
        index: match.index ?? normalized.indexOf(coveringRaw),
      })
    }
  }

  pairs.sort((a, b) => a.index - b.index)

  for (const pair of pairs) {
    const coveringBest = findBestAgentName(pair.covering)
    const coveredBest = findBestAgentName(pair.covered)
    const covering = coveringBest || titleCase(pair.covering)
    const covered = coveredBest || titleCase(pair.covered)
    if (!covering && !covered) continue

    if (pair.relation === 'coverage') {
      const coverageKind = defaultKind === 'Swap' ? 'Coverage' : defaultKind
      addSuggestion({
        person: covering,
        counterpart: covered,
        startDate,
        endDate: endDate || startDate,
        startTime,
        endTime,
        kind: coverageKind,
        notes: covered ? `Covering for ${covered}` : '',
        confidence: computeConfidence([
          Boolean(covering),
          Boolean(startDate),
          Boolean(endDate || startDate),
          Boolean(covered),
          Boolean(startTime || endTime),
        ]),
        role: 'covering',
      })
      addSuggestion({
        person: covered,
        counterpart: covering,
        startDate,
        endDate: endDate || startDate,
        startTime,
        endTime,
        kind: coverageKind,
        notes: covering ? `Coverage by ${covering}` : '',
        confidence: computeConfidence([
          Boolean(covered),
          Boolean(startDate),
          Boolean(endDate || startDate),
          Boolean(covering),
          Boolean(startTime || endTime),
        ]),
        role: 'covered',
      })
    } else if (pair.relation === 'swap') {
      addSuggestion({
        person: covering,
        counterpart: covered,
        startDate,
        endDate: endDate || startDate,
        startTime,
        endTime,
        kind: 'Swap',
        notes: covered ? `Swap with ${covered}` : '',
        confidence: computeConfidence([
          Boolean(covering),
          Boolean(startDate),
          Boolean(endDate || startDate),
          Boolean(covered),
        ]),
        role: 'swap',
      })
      addSuggestion({
        person: covered,
        counterpart: covering,
        startDate,
        endDate: endDate || startDate,
        startTime,
        endTime,
        kind: 'Swap',
        notes: covering ? `Swap with ${covering}` : '',
        confidence: computeConfidence([
          Boolean(covered),
          Boolean(startDate),
          Boolean(endDate || startDate),
          Boolean(covering),
        ]),
        role: 'swap',
      })
    }
  }

  if (suggestions.length === 0) {
    const nameRegex = /([A-Z][\w'.-]+(?:\s+[A-Z][\w'.-]+)*)/g
    const fallbackSeen = new Set<string>()
    for (const match of normalized.matchAll(nameRegex)) {
      const raw = match[1]?.trim() ?? ''
      if (!raw) continue
      if (!/[a-z]/.test(raw)) continue
      const best = findBestAgentName(raw)
      if (!best) continue
      const person = best
      const key = person.toLowerCase()
      if (fallbackSeen.has(key)) continue
      fallbackSeen.add(key)
      addSuggestion({
        person,
        counterpart: undefined,
        startDate,
        endDate: endDate || startDate,
        startTime,
        endTime,
        kind: defaultKind,
        notes: '',
        confidence: computeConfidence([
          Boolean(person),
          Boolean(startDate),
          Boolean(endDate || startDate),
          Boolean(startTime || endTime),
        ]),
        role: 'single',
      })
      if (fallbackSeen.size >= 3) break
    }
  }

  return suggestions
}

export default function OverrideNotificationParser({
  dark,
  agents,
  onApply,
}: OverrideNotificationParserProps) {
  const [rawText, setRawText] = React.useState('')
  const [suggestions, setSuggestions] = React.useState<OverrideSuggestion[]>([])
  const [status, setStatus] = React.useState<ParserStatus>({ state: 'idle' })
  const fileInputRef = React.useRef<HTMLInputElement | null>(null)

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

  const updateFromText = React.useCallback(
    (input: string) => {
      const normalized = input.replace(/\r\n/g, '\n')
      setRawText(normalized)
      if (!normalized.trim()) {
        setSuggestions([])
        setStatus({ state: 'idle' })
        return
      }
      const parsed = parseOverrideSuggestions(normalized, findBestAgentName)
      setSuggestions(parsed)
      setStatus({ state: 'idle' })
    },
    [findBestAgentName],
  )

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

  const borderClasses = dark
    ? 'border-neutral-800 bg-neutral-950 text-neutral-100'
    : 'border-neutral-200 bg-white text-neutral-800'

  const dropZoneClasses = dark
    ? 'border-neutral-700 bg-neutral-900/60 text-neutral-200 hover:border-blue-500'
    : 'border-neutral-300 bg-neutral-50 text-neutral-700 hover:border-blue-500'

  const inputClasses = dark
    ? 'w-full rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1 text-sm text-neutral-100 focus:border-blue-500 focus:outline-none'
    : 'w-full rounded-md border border-neutral-300 bg-white px-2 py-1 text-sm text-neutral-900 focus:border-blue-500 focus:outline-none'

  const timeInputClasses = `${inputClasses} text-left`

  const selectedReady = suggestions.filter(
    (s) => s.include && s.person.trim() && s.startDate && (s.endDate || s.startDate),
  )

  const handleSuggestionChange = <K extends keyof OverrideSuggestion>(
    id: string,
    key: K,
    value: OverrideSuggestion[K],
  ) => {
    setSuggestions((prev) =>
      prev.map((item) => (item.id === id ? { ...item, [key]: value } : item)),
    )
  }

  const handleApplySelected = () => {
    if (!onApply) return
    const ready = selectedReady
    if (ready.length === 0) {
      setStatus({
        state: 'error',
        message: 'Select at least one suggestion and supply agent + dates before applying.',
      })
      return
    }
    setStatus({ state: 'idle' })
    onApply(
      ready.map((suggestion) => ({
        person: suggestion.person.trim(),
        agentId: findAgentId(suggestion.person.trim()),
        startDate: suggestion.startDate,
        endDate: suggestion.endDate || suggestion.startDate,
        startTime: suggestion.startTime || undefined,
        endTime: suggestion.endTime || undefined,
        kind: suggestion.kind.trim() ? suggestion.kind.trim() : undefined,
        notes: suggestion.notes.trim() ? suggestion.notes.trim() : undefined,
        counterpart: suggestion.counterpart?.trim() ? suggestion.counterpart.trim() : undefined,
        rawText,
        confidence: suggestion.confidence,
        role: suggestion.role,
      })),
    )
    setSuggestions((prev) => prev.map((item) => ({ ...item, include: false })))
  }

  return (
    <section className={`rounded-lg border ${borderClasses}`}>
      <div
        className={`flex items-center justify-between border-b px-3 py-2 ${
          dark
            ? 'border-neutral-800 bg-neutral-900 text-neutral-100'
            : 'border-neutral-200 bg-neutral-50 text-neutral-800'
        }`}
      >
        <span className="text-sm font-semibold">Override notification parser</span>
        {selectedReady.length ? (
          <span className="text-xs opacity-70">{selectedReady.length} selected</span>
        ) : null}
      </div>
      <div className="space-y-4 px-3 py-3 text-sm">
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
          <span className="text-sm font-medium">Paste, drop, or select a coverage notification</span>
          <span className="text-xs opacity-70">Images use in-browser OCR · Plain text parsed instantly</span>
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
            placeholder="Paste or drop a notification to see override suggestions."
            onChange={(event) => updateFromText(event.target.value)}
            className={`min-h-[96px] w-full rounded-md border px-3 py-2 text-sm shadow-sm ${
              dark
                ? 'border-neutral-800 bg-neutral-900 text-neutral-100 placeholder:text-neutral-500'
                : 'border-neutral-200 bg-neutral-50 text-neutral-800 placeholder:text-neutral-500'
            }`}
          />
        </div>
        <div className="space-y-3">
          {suggestions.length === 0 ? (
            <div
              className={`rounded-md border px-3 py-3 text-xs ${
                dark
                  ? 'border-neutral-800 bg-neutral-900 text-neutral-300'
                  : 'border-neutral-200 bg-neutral-50 text-neutral-600'
              }`}
            >
              Parsed overrides will appear here. Include entries to push them into the override list.
            </div>
          ) : (
            suggestions.map((suggestion, index) => {
              const personTrimmed = suggestion.person.trim()
              const hasExactAgent =
                personTrimmed && agentOptions.some((option) => option.toLowerCase() === personTrimmed.toLowerCase())
              return (
                <div
                  key={suggestion.id}
                  className={`rounded-md border px-3 py-3 ${
                    dark
                      ? 'border-neutral-800 bg-neutral-900 text-neutral-100'
                      : 'border-neutral-200 bg-neutral-50 text-neutral-800'
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <label className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide">
                      <input
                        type="checkbox"
                        checked={suggestion.include}
                        onChange={(event) =>
                          handleSuggestionChange(suggestion.id, 'include', event.target.checked)
                        }
                      />
                      <span className="opacity-70">Include suggestion {index + 1}</span>
                    </label>
                    <div className="flex items-center gap-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                          suggestion.role === 'covering'
                            ? dark
                              ? 'bg-green-900/50 text-green-200'
                              : 'bg-green-100 text-green-700'
                            : suggestion.role === 'covered'
                              ? dark
                                ? 'bg-amber-900/50 text-amber-200'
                                : 'bg-amber-100 text-amber-700'
                              : suggestion.role === 'swap'
                                ? dark
                                  ? 'bg-blue-900/50 text-blue-200'
                                  : 'bg-blue-100 text-blue-700'
                                : dark
                                  ? 'bg-neutral-800 text-neutral-200'
                                  : 'bg-neutral-200 text-neutral-700'
                        }`}
                      >
                        {suggestion.role}
                      </span>
                      <span className="text-xs opacity-70">Confidence {suggestion.confidence}%</span>
                    </div>
                  </div>
                  <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
                    <label className="flex flex-col gap-1">
                      <span className="text-xs font-medium uppercase tracking-wide opacity-70">Agent</span>
                      <ComboBox
                        value={suggestion.person}
                        onChange={(next) =>
                          handleSuggestionChange(suggestion.id, 'person', next.replace(/\s+/g, ' ').trim())
                        }
                        options={agentOptions}
                        placeholder="Select an agent"
                        dark={dark}
                      />
                      {suggestion.person && !hasExactAgent ? (
                        <span className="text-[11px] text-amber-500">
                          Choose an existing agent before applying.
                        </span>
                      ) : null}
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="text-xs font-medium uppercase tracking-wide opacity-70">Start date</span>
                      <input
                        type="date"
                        className={inputClasses}
                        value={suggestion.startDate}
                        onChange={(event) =>
                          handleSuggestionChange(suggestion.id, 'startDate', event.target.value)
                        }
                      />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="text-xs font-medium uppercase tracking-wide opacity-70">End date</span>
                      <input
                        type="date"
                        className={inputClasses}
                        value={suggestion.endDate}
                        min={suggestion.startDate || undefined}
                        onChange={(event) =>
                          handleSuggestionChange(suggestion.id, 'endDate', event.target.value)
                        }
                      />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="text-xs font-medium uppercase tracking-wide opacity-70">Start time (optional)</span>
                      <input
                        type="time"
                        className={timeInputClasses}
                        value={suggestion.startTime}
                        onChange={(event) =>
                          handleSuggestionChange(suggestion.id, 'startTime', event.target.value)
                        }
                      />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="text-xs font-medium uppercase tracking-wide opacity-70">End time (optional)</span>
                      <input
                        type="time"
                        className={timeInputClasses}
                        value={suggestion.endTime}
                        onChange={(event) =>
                          handleSuggestionChange(suggestion.id, 'endTime', event.target.value)
                        }
                      />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="text-xs font-medium uppercase tracking-wide opacity-70">Kind</span>
                      <input
                        className={inputClasses}
                        value={suggestion.kind}
                        placeholder="e.g. Coverage, Swap"
                        onChange={(event) =>
                          handleSuggestionChange(suggestion.id, 'kind', event.target.value)
                        }
                      />
                    </label>
                    <label className="flex flex-col gap-1 lg:col-span-3">
                      <span className="text-xs font-medium uppercase tracking-wide opacity-70">
                        Notes {suggestion.counterpart ? `(auto: ${suggestion.counterpart})` : ''}
                      </span>
                      <input
                        className={inputClasses}
                        value={suggestion.notes}
                        placeholder={suggestion.counterpart ? `e.g. Covering for ${suggestion.counterpart}` : 'Add helpful context'}
                        onChange={(event) =>
                          handleSuggestionChange(suggestion.id, 'notes', event.target.value)
                        }
                      />
                    </label>
                  </div>
                </div>
              )
            })
          )}
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <button
            type="button"
            className="text-xs font-medium text-blue-500 hover:underline"
            onClick={() => {
              if (!suggestions.length) return
              if (suggestions.every((item) => !item.include)) {
                setSuggestions((prev) => prev.map((item) => ({ ...item, include: true })))
              } else {
                setSuggestions((prev) => prev.map((item) => ({ ...item, include: false })))
              }
            }}
          >
            {suggestions.every((item) => !item.include) ? 'Select all' : 'Clear selection'}
          </button>
          <button
            type="button"
            disabled={!onApply || selectedReady.length === 0}
            onClick={handleApplySelected}
            className={[
              'inline-flex items-center justify-center rounded-md px-3 py-2 text-sm font-medium transition-colors border',
              !onApply || selectedReady.length === 0
                ? dark
                  ? 'border-neutral-800 bg-neutral-900 text-neutral-500 cursor-not-allowed'
                  : 'border-neutral-200 bg-neutral-100 text-neutral-400 cursor-not-allowed'
                : dark
                  ? 'border-blue-500 bg-blue-600/20 text-blue-200 hover:bg-blue-600/30'
                  : 'border-blue-500 bg-blue-500 text-white hover:bg-blue-600',
            ].join(' ')}
          >
            Add selected overrides
          </button>
        </div>
      </div>
    </section>
  )
}
