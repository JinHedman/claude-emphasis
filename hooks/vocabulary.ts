export type Tone =
  | 'error'
  | 'warning'
  | 'success'
  | 'danger'
  | 'mode'
  | 'owner'
  | 'neutral'

type KnownTone = Exclude<Tone, 'neutral'>

export const VOCABULARY: Record<
  KnownTone,
  { core: readonly string[]; also: readonly string[] }
> = {
  error: {
    core: ['Failed', 'Blocked', 'Broken', 'Unsafe'],
    also: ['fail', 'failing', 'error', 'rejected', 'down'],
  },
  warning: {
    core: [
      'Needs you',
      'Decision',
      'Unverified',
      'Partial',
      'Skipped',
      'In progress',
      'Pending',
      'At risk',
    ],
    also: ['needs review', 'waiting', 'review', 'todo', 'stale', 'draft'],
  },
  success: {
    core: ['Done', 'Passed', 'Observed', 'Fixed', 'Live', 'Recommended', 'Keep'],
    also: [
      'pass',
      'ready',
      'merged',
      'safe',
      'verified',
      'shipped',
      'ok',
      'approved',
      'complete',
      'completed',
      'finished',
      'healthy',
    ],
  },
  danger: { core: ['Costs money', 'Destructive', 'Irreversible'], also: [] },
  mode: {
    core: ['Brainstorm', 'Investigate', 'Preview', 'Implement', 'Qualify'],
    also: [],
  },
  owner: { core: ['Owned', 'Shared', 'Foreign'], also: [] },
}

export const CONTEXT_WORDS = ['Inferred', 'New', 'Changed', 'Optional']

const TONE_ORDER: readonly KnownTone[] = [
  'danger',
  'error',
  'warning',
  'success',
  'mode',
  'owner',
]

const TONE_OF_WORD = new Map<string, KnownTone>(
  TONE_ORDER.flatMap(tone =>
    [...VOCABULARY[tone].core, ...VOCABULARY[tone].also].map(
      word => [word.toLowerCase(), tone] as const,
    ),
  ),
)

const CHECK = ''
const CROSS = ''
const CLOCK = ''

const PILL_ICONS: Record<string, string> = {
  done: CHECK,
  passed: CHECK,
  pass: CHECK,
  complete: CHECK,
  completed: CHECK,
  ok: CHECK,
  verified: CHECK,
  ready: CHECK,
  observed: '',
  recommended: '',
  fixed: '',
  live: '',
  shipped: '',
  approved: '',
  keep: '',
  merged: '',
  healthy: '',
  safe: '',
  failed: CROSS,
  fail: CROSS,
  failing: CROSS,
  error: CROSS,
  rejected: CROSS,
  blocked: '',
  broken: '',
  unsafe: '',
  down: '',
  'needs you': '',
  decision: '',
  unverified: '',
  'at risk': '',
  'in progress': '',
  pending: CLOCK,
  waiting: CLOCK,
  partial: '',
  skipped: '',
  review: '',
  todo: '',
  stale: '',
  draft: '',
  inferred: '',
  new: '',
  changed: '',
  optional: '',
  'costs money': '',
  destructive: '',
  irreversible: '',
  brainstorm: '',
  investigate: '',
  preview: '',
  implement: '',
  qualify: '',
  owned: '',
  shared: '',
  foreign: '',
}

const SYNONYMS: Record<string, string> = {
  complete: 'Done',
  completed: 'Done',
  ok: 'Done',
  finished: 'Done',
  pass: 'Passed',
  fail: 'Failed',
  failing: 'Failed',
  error: 'Failed',
  waiting: 'Pending',
  'needs review': 'Review',
}

export const LABEL_ICONS: Record<string, string> = {
  finding: '',
  result: '',
  status: '',
  evidence: '',
  cause: '',
  effect: '',
  fix: '',
  risk: '',
  limits: '',
  cost: '',
  decision: '',
  options: '',
  plan: '',
  next: '',
  why: '',
  how: '',
  rule: '',
  example: '',
  checked: '',
  verdict: '',
  rollback: '',
  undo: '',
  review: '',
  scoreboard: '',
  terminal: '',
  folder: '',
  file: '',
  branch: '',
  ideas: '',
}

export const ACTION_ICONS: Record<string, string> = {
  check: '',
  do: '',
  next: '',
  unblock: '',
  left: '',
  run: '',
  guard: '',
  undo: '',
  see: '',
}

const OWN_ICON = /^\s*([-]|[\u{f0000}-\u{ffffd}])\s*/u

const KNOWN_WORDS = [
  ...new Set([
    ...TONE_OF_WORD.keys(),
    ...Object.keys(PILL_ICONS),
    ...Object.keys(SYNONYMS),
  ]),
].sort((a, b) => b.length - a.length)

export type Pill = { tone: Tone; text: string; icon: string | undefined }

export function readPill(label: string): Pill {
  const own = label.match(OWN_ICON)
  const written = (own ? label.slice(own[0].length) : label)
    .replace(/\s+/g, ' ')
    .trim()
  const lower = written.toLowerCase()
  const known = KNOWN_WORDS.find(
    word =>
      lower === word ||
      (lower.startsWith(word) && /[ :]/.test(lower.charAt(word.length))),
  )
  const canonical = known === undefined ? undefined : SYNONYMS[known]
  const key = (canonical ?? known ?? lower).toLowerCase()
  const text =
    canonical !== undefined && known !== undefined
      ? canonical + written.slice(known.length)
      : written

  return {
    tone: TONE_OF_WORD.get(key) ?? 'neutral',
    text,
    icon: own?.[1] ?? PILL_ICONS[key],
  }
}

export function labelIcon(label: string, isLead: boolean): string | undefined {
  if (OWN_ICON.test(label)) {
    return undefined
  }
  const trimmed = label.trim()
  const hasColon = trimmed.endsWith(':')
  const word = trimmed.replace(/[:\s]+$/, '').toLowerCase()
  const action = hasColon ? ACTION_ICONS[word] : undefined

  return isLead ? (LABEL_ICONS[word] ?? action) : action
}
