import { plain } from './parse'
import type { Block, Line, Span } from './parse'
import { isAction, labelRole, readPill } from './vocabulary'
import type { Role, Tone } from './vocabulary'

export type Passage = { kind: 'passage'; role: Role; tone: Tone; lines: Line[] }

export type Part = Exclude<Block, Line> | Passage

export const isBlank = (span: Span) =>
  span.kind === 'text' && span.text.trim() === ''

const leadOf = (line: Line) => line.spans.find(span => !isBlank(span))

function isTreeRow(line: Line): boolean {
  const lead = leadOf(line)

  return lead?.kind === 'mark' && lead.mark === 'tree'
}

function opening(line: Line): { role: Role; tone: Tone } {
  const lead = leadOf(line)

  if (lead?.kind === 'pill') {
    const { opens, tone } = readPill(lead.label)
    const hasProse = line.spans.some(
      span => span.kind !== 'pill' && !isBlank(span),
    )

    if (opens !== undefined && hasProse) {
      return { role: opens, tone }
    }
  }
  if (lead?.kind === 'bold' && lead.isLead) {
    const role = labelRole(plain(lead.spans))

    if (role !== undefined) {
      return { role, tone: 'neutral' }
    }
  }

  return { role: 'statement', tone: 'neutral' }
}

export function isCallout(passage: Passage): boolean {
  return passage.role === 'ask' || passage.role === 'problem'
}

function opensWithAction(line: Line): boolean {
  const lead = leadOf(line)

  return (
    line.marker === undefined &&
    lead?.kind === 'bold' &&
    lead.isLead &&
    isAction(plain(lead.spans))
  )
}

function continues(passage: Passage, line: Line): boolean {
  const opener = passage.lines[0]

  if (opener === undefined) {
    return false
  }
  if (line.indent > opener.indent || isTreeRow(line)) {
    return true
  }
  if (isCallout(passage)) {
    return opensWithAction(line)
  }
  const isBareLabel = opener.spans.filter(span => !isBlank(span)).length === 1

  return passage.role !== 'statement' && isBareLabel
}

export function arrange(blocks: readonly Block[]): Part[] {
  const parts: Part[] = []
  let open: Passage | undefined

  for (const block of blocks) {
    if (block.kind !== 'line') {
      open = undefined
      parts.push(block)
      continue
    }
    if (open !== undefined && continues(open, block)) {
      open.lines.push(block)
    } else {
      open = { kind: 'passage', ...opening(block), lines: [block] }
      parts.push(open)
    }
  }

  return parts
}
