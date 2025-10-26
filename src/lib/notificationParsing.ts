const MONTH_LOOKUP = new Map<string, number>([
  ['january', 1],
  ['jan', 1],
  ['february', 2],
  ['feb', 2],
  ['march', 3],
  ['mar', 3],
  ['april', 4],
  ['apr', 4],
  ['may', 5],
  ['june', 6],
  ['jun', 6],
  ['july', 7],
  ['jul', 7],
  ['august', 8],
  ['aug', 8],
  ['september', 9],
  ['sep', 9],
  ['sept', 9],
  ['october', 10],
  ['oct', 10],
  ['november', 11],
  ['nov', 11],
  ['december', 12],
  ['dec', 12],
])

export function normalizeDash(text: string) {
  return text.replace(/\u2013|\u2014/g, '-')
}

export function cleanWhitespace(text: string) {
  return text.replace(/\s+/g, ' ').trim()
}

export function titleCase(input: string) {
  return input
    .split(' ')
    .map((word) => {
      if (!word) return word
      const lower = word.toLowerCase()
      return lower.charAt(0).toUpperCase() + lower.slice(1)
    })
    .join(' ')
}

function toIsoDate(year: number, month: number, day: number): string {
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return ''
  }
  if (year < 1900 || year > 2100) return ''
  if (month < 1 || month > 12) return ''
  if (day < 1 || day > 31) return ''
  const candidate = new Date(Date.UTC(year, month - 1, day))
  if (
    candidate.getUTCFullYear() !== year ||
    candidate.getUTCMonth() + 1 !== month ||
    candidate.getUTCDate() !== day
  ) {
    return ''
  }
  return [
    year.toString().padStart(4, '0'),
    month.toString().padStart(2, '0'),
    day.toString().padStart(2, '0'),
  ].join('-')
}

function normalizeYear(part: string | undefined, fallback: number): number {
  if (!part) return fallback
  const cleaned = part.replace(/[^\d]/g, '')
  if (!cleaned) return fallback
  let year = Number.parseInt(cleaned, 10)
  if (cleaned.length === 2) {
    year += year >= 70 ? 1900 : 2000
  }
  if (year < 1900 || year > 2100) return fallback
  return year
}

function monthFromName(name: string | undefined): number {
  if (!name) return NaN
  const lower = name.toLowerCase()
  return MONTH_LOOKUP.get(lower) ?? NaN
}

export function extractDates(text: string): { startDate: string; endDate: string } {
  const normalized = normalizeDash(text)
  const matches: Array<{ iso: string; index: number }> = []
  const unique: string[] = []
  const explicitYearMatch = normalized.match(/\b(20\d{2}|19\d{2})\b/)
  const currentYear = new Date().getFullYear()
  const fallbackYear = explicitYearMatch ? Number.parseInt(explicitYearMatch[1], 10) : currentYear
  let lastYear = fallbackYear

  const record = (iso: string, index: number) => {
    if (!iso) return
    matches.push({ iso, index })
  }

  const monthPattern = '(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)'

  const monthRangeRegex = new RegExp(
    `\\b(${monthPattern})\\s+(\\d{1,2})(?:st|nd|rd|th)?\\s*(?:-|to|through)\\s*(?:(${monthPattern})\\s+)?(\\d{1,2})(?:st|nd|rd|th)?(?:\\s*,?\\s*((?:20|19)?\\d{2}))?`,
    'gi',
  )
  for (const match of normalized.matchAll(monthRangeRegex)) {
    const month1 = monthFromName(match[1])
    const day1 = Number.parseInt(match[2], 10)
    const month2 = monthFromName(match[3] ?? match[1])
    const day2 = Number.parseInt(match[4], 10)
    if (Number.isNaN(month1) || Number.isNaN(month2) || Number.isNaN(day1) || Number.isNaN(day2)) {
      continue
    }
    const resolvedYear = normalizeYear(match[5], lastYear)
    lastYear = resolvedYear
    let secondYear = resolvedYear
    if (match[3] && month2 < month1) {
      secondYear += 1
    }
    const iso1 = toIsoDate(resolvedYear, month1, day1)
    const iso2 = toIsoDate(secondYear, month2, day2)
    record(iso1, match.index ?? 0)
    record(iso2, (match.index ?? 0) + 1)
  }

  const numericRangeRegex =
    /\b(\d{1,2})[/-](\d{1,2})(?:[/-]((?:20|19)?\d{2}))?\s*(?:-|to|through)\s*(\d{1,2})[/-](\d{1,2})(?:[/-]((?:20|19)?\d{2}))?\b/g
  for (const match of normalized.matchAll(numericRangeRegex)) {
    const month1 = Number.parseInt(match[1], 10)
    const day1 = Number.parseInt(match[2], 10)
    const year1 = normalizeYear(match[3], lastYear)
    lastYear = year1
    const month2 = Number.parseInt(match[4], 10)
    const day2 = Number.parseInt(match[5], 10)
    const year2 = normalizeYear(match[6], year1)
    const iso1 = toIsoDate(year1, month1, day1)
    const iso2 = toIsoDate(year2, month2, day2)
    record(iso1, match.index ?? 0)
    record(iso2, (match.index ?? 0) + 1)
  }

  const isoRegex = /\b(20\d{2}|19\d{2})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])\b/g
  for (const match of normalized.matchAll(isoRegex)) {
    const year = Number.parseInt(match[1], 10)
    const month = Number.parseInt(match[2], 10)
    const day = Number.parseInt(match[3], 10)
    const iso = toIsoDate(year, month, day)
    lastYear = year
    record(iso, match.index ?? 0)
  }

  const numericSingleRegex =
    /\b(0?[1-9]|1[0-2])[/-](0?[1-9]|[12]\d|3[01])(?:[/-]((?:20|19)?\d{2}))?\b/g
  for (const match of normalized.matchAll(numericSingleRegex)) {
    const month = Number.parseInt(match[1], 10)
    const day = Number.parseInt(match[2], 10)
    const year = normalizeYear(match[3], lastYear)
    lastYear = year
    const iso = toIsoDate(year, month, day)
    record(iso, match.index ?? 0)
  }

  const monthSingleRegex = new RegExp(
    `\\b(${monthPattern})\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:\\s*,?\\s*((?:20|19)?\\d{2}))?`,
    'gi',
  )
  for (const match of normalized.matchAll(monthSingleRegex)) {
    const month = monthFromName(match[1])
    const day = Number.parseInt(match[2], 10)
    const year = normalizeYear(match[3], lastYear)
    lastYear = year
    const iso = toIsoDate(year, month, day)
    record(iso, match.index ?? 0)
  }

  const dayFirstRegex = new RegExp(
    `\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(${monthPattern})(?:\\s*,?\\s*((?:20|19)?\\d{2}))?`,
    'gi',
  )
  for (const match of normalized.matchAll(dayFirstRegex)) {
    const day = Number.parseInt(match[1], 10)
    const month = monthFromName(match[2])
    const year = normalizeYear(match[3], lastYear)
    lastYear = year
    const iso = toIsoDate(year, month, day)
    record(iso, match.index ?? 0)
  }

  matches
    .sort((a, b) => a.index - b.index)
    .forEach((entry) => {
      if (!unique.includes(entry.iso)) {
        unique.push(entry.iso)
      }
    })

  if (unique.length === 0) {
    return { startDate: '', endDate: '' }
  }
  const startDate = unique[0]
  const endDate = unique[1] ?? unique[0]
  if (endDate < startDate) {
    return { startDate: endDate, endDate: startDate }
  }
  return { startDate, endDate }
}

export function extractTimeRange(text: string): { startTime: string; endTime: string } {
  const normalized = normalizeDash(text)
  const singleLine = cleanWhitespace(normalized)
  const rangeMatch = singleLine.match(
    /(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\s*(?:-|to|through)\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/i,
  )

  let startTime = ''
  let endTime = ''
  if (rangeMatch) {
    startTime = rangeMatch[1]?.trim() ?? ''
    endTime = rangeMatch[2]?.trim() ?? ''
  } else {
    const timeRegex = /\b(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\b/gi
    const timeMatches = Array.from(singleLine.matchAll(timeRegex)).map((m) => m[1]?.trim() ?? '')
    if (timeMatches.length >= 2) {
      startTime = timeMatches[0] ?? ''
      endTime = timeMatches[1] ?? ''
    } else if (timeMatches.length === 1) {
      startTime = timeMatches[0] ?? ''
    }
  }
  return { startTime, endTime }
}

export function convertTimeTo24Hour(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed) return ''

  const basicMatch = trimmed.match(
    /^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i,
  )
  if (basicMatch) {
    let hour = Number.parseInt(basicMatch[1], 10)
    const minute = basicMatch[2] ? Number.parseInt(basicMatch[2], 10) : 0
    const meridiem = basicMatch[3]?.toLowerCase()
    if (Number.isNaN(hour) || Number.isNaN(minute) || minute > 59) return ''
    if (meridiem) {
      if (hour === 12) {
        hour = 0
      }
      if (meridiem.startsWith('p')) {
        hour += 12
      }
      hour %= 24
      return `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`
    }
    if (basicMatch[2] || hour >= 0 && hour <= 23) {
      if (!basicMatch[2] && hour <= 12) {
        // Ambiguous plain "8" -> treat as unavailable
        if (hour === 0) return '00:00'
        return ''
      }
      if (hour > 23) return ''
      return `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`
    }
  }

  const explicit24 = trimmed.match(/^([01]?\d|2[0-3]):([0-5]\d)$/)
  if (explicit24) {
    const hour = Number.parseInt(explicit24[1], 10)
    const minute = Number.parseInt(explicit24[2], 10)
    return `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`
  }

  return ''
}
