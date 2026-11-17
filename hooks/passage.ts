import type { Block, Line, Span } from './parse'

export type Passage = { kind: 'passage'; lines: Line[] }

export type Part = Exclude<Block, Line> | Passage

const isBlank = (span: Span) => span.kind === 'text' && span.text.trim() === ''

function isTreeRow(line: Line): boolean {
  const first = line.spans.find(span => !isBlank(span))

  return first?.kind === 'mark' && first.mark === 'tree'
}

const continues = (opener: Line, line: Line) =>
  line.indent > opener.indent || isTreeRow(line)

export function arrange(blocks: readonly Block[]): Part[] {
  const parts: Part[] = []
  let open: Passage | undefined

  for (const block of blocks) {
    if (block.kind !== 'line') {
      open = undefined
      parts.push(block)
      continue
    }
    const opener = open?.lines[0]

    if (open !== undefined && opener !== undefined && continues(opener, block)) {
      open.lines.push(block)
    } else {
      open = { kind: 'passage', lines: [block] }
      parts.push(open)
    }
  }

  return parts
}
