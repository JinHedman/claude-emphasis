export type Mark = 'passed' | 'failed' | 'arrow' | 'tree'

export type Span =
  | { kind: 'text'; text: string }
  | { kind: 'code'; text: string }
  | { kind: 'pill'; label: string }
  | { kind: 'mark'; text: string; mark: Mark }
  | { kind: 'bold'; spans: Span[]; isLead: boolean }
  | { kind: 'italic'; spans: Span[] }
  | { kind: 'strike'; spans: Span[] }
  | { kind: 'link'; href: string; spans: Span[] }

export type Line = {
  kind: 'line'
  indent: number
  marker: string | undefined
  spans: Span[]
}

export type Block =
  | { kind: 'blank' }
  | { kind: 'heading'; level: number; spans: Span[] }
  | Line
  | { kind: 'table'; rows: Span[][][] }
  | { kind: 'markdown'; text: string }

const PILL = /\[\[([^[\]\n]{1,32})\]\]/y
const LINK =
  /\[((?:\\.|[^[\]\\])+)\]\(\s*<?([^\s<>()]+(?:\([^\s<>()]*\)[^\s<>()]*)*)>?(?:\s+"[^"]*")?\s*\)/y
const AUTOLINK = /<(https?:\/\/[^\s<>]+)>/y
const BARE_URL = /https?:\/\/[^\s<>`]+/y
const TREE = /[├└]──|│/y
const ESCAPABLE = /[\\`*_{}[\]()#+\-.!|~<>]/
const WORD = /[\p{L}\p{N}]/u

const MARKS: Record<string, Mark> = {
  '✓': 'passed',
  '✔': 'passed',
  '✗': 'failed',
  '✘': 'failed',
  '→': 'arrow',
}

function matchAt(pattern: RegExp, source: string, at: number) {
  pattern.lastIndex = at

  return pattern.exec(source)
}

function runLength(source: string, at: number): number {
  const char = source.charAt(at)
  let end = at

  while (source.charAt(end) === char) {
    end += 1
  }

  return end - at
}

function codeSpanEnd(source: string, at: number): number | undefined {
  const ticks = runLength(source, at)
  let scan = at + ticks

  while (scan < source.length) {
    const next = source.indexOf('`', scan)

    if (next === -1) {
      return undefined
    }
    const closing = runLength(source, next)

    if (closing === ticks) {
      return next + ticks
    }
    scan = next + closing
  }

  return undefined
}

function findClose(source: string, from: number, delimiter: string): number {
  const isSingle = delimiter.length === 1
  let at = from

  while (at < source.length) {
    const char = source.charAt(at)

    if (char === '\\') {
      at += 2
    } else if (char === '`') {
      at = codeSpanEnd(source, at) ?? at + runLength(source, at)
    } else if (source.startsWith(delimiter, at)) {
      if (isSingle && source.charAt(at + 1) === delimiter) {
        at += runLength(source, at)
      } else {
        return at
      }
    } else {
      at += 1
    }
  }

  return -1
}

const isWord = (char: string) => char !== '' && WORD.test(char)
const isSpace = (char: string) => char === '' || /\s/.test(char)

function emphasisEnd(
  source: string,
  at: number,
  delimiter: string,
): number | undefined {
  const size = delimiter.length
  const isUnderscore = delimiter.startsWith('_')

  if (isSpace(source.charAt(at + size))) {
    return undefined
  }
  if (isUnderscore && isWord(source.charAt(at - 1))) {
    return undefined
  }
  let close = findClose(source, at + size, delimiter)

  while (close !== -1) {
    while (size === 2 && source.charAt(close + size) === delimiter.charAt(0)) {
      close += 1
    }
    const isClosed =
      close > at + size &&
      !isSpace(source.charAt(close - 1)) &&
      !(isUnderscore && isWord(source.charAt(close + size)))

    if (isClosed) {
      return close
    }
    close = findClose(source, close + size, delimiter)
  }

  return undefined
}

function trimUrl(url: string): string {
  let trimmed = url.replace(/[.,;:!?'"*_~]+$/, '')

  while (
    trimmed.endsWith(')') &&
    trimmed.split(')').length > trimmed.split('(').length
  ) {
    trimmed = trimmed.slice(0, -1)
  }

  return trimmed
}

export function inline(source: string): Span[] {
  const spans: Span[] = []
  let text = ''
  let at = 0

  const push = (span: Span, next: number) => {
    if (text !== '') {
      spans.push({ kind: 'text', text })
      text = ''
    }
    spans.push(span)
    at = next
  }

  while (at < source.length) {
    const char = source.charAt(at)
    const next = source.charAt(at + 1)

    if (char === '\\' && ESCAPABLE.test(next)) {
      text += next
      at += 2
      continue
    }

    if (char === '`') {
      const end = codeSpanEnd(source, at)

      if (end !== undefined) {
        const ticks = runLength(source, at)
        const inner = source.slice(at + ticks, end - ticks)
        const isPadded =
          inner.startsWith(' ') && inner.endsWith(' ') && inner.trim() !== ''
        push({ kind: 'code', text: isPadded ? inner.slice(1, -1) : inner }, end)
        continue
      }
    }

    if (char === '[') {
      const pill = matchAt(PILL, source, at)
      const label = pill?.[1]

      if (pill && label !== undefined && label.trim() !== '') {
        push({ kind: 'pill', label }, at + pill[0].length)
        continue
      }
      const link = matchAt(LINK, source, at)
      const [whole, shown, href] = link ?? []

      if (whole !== undefined && shown !== undefined && href !== undefined) {
        push({ kind: 'link', href, spans: inline(shown) }, at + whole.length)
        continue
      }
    }

    if (char === '<') {
      const link = matchAt(AUTOLINK, source, at)
      const href = link?.[1]

      if (link && href !== undefined) {
        const shown: Span = { kind: 'text', text: href }
        push({ kind: 'link', href, spans: [shown] }, at + link[0].length)
        continue
      }
    }

    if (char === 'h' && !isWord(source.charAt(at - 1))) {
      const link = matchAt(BARE_URL, source, at)

      if (link) {
        const href = trimUrl(link[0])
        const shown: Span = { kind: 'text', text: href }
        push({ kind: 'link', href, spans: [shown] }, at + href.length)
        continue
      }
    }

    if (char === '*' || char === '_' || char === '~') {
      const run = runLength(source, at)
      const strong = char + char

      if (run >= 2) {
        const close = emphasisEnd(source, at, strong)

        if (close !== undefined) {
          const inner = inline(source.slice(at + 2, close))
          push(
            char === '~'
              ? { kind: 'strike', spans: inner }
              : { kind: 'bold', spans: inner, isLead: false },
            close + 2,
          )
          continue
        }
        text += source.slice(at, at + run)
        at += run
        continue
      }

      if (char !== '~') {
        const close = emphasisEnd(source, at, char)

        if (close !== undefined) {
          const inner = inline(source.slice(at + 1, close))
          push({ kind: 'italic', spans: inner }, close + 1)
          continue
        }
      }
    }

    const mark = MARKS[char]

    if (mark !== undefined) {
      push({ kind: 'mark', text: char, mark }, at + 1)
      continue
    }

    if (char === '├' || char === '└' || char === '│') {
      const tree = matchAt(TREE, source, at)

      if (tree) {
        push({ kind: 'mark', text: tree[0], mark: 'tree' }, at + tree[0].length)
        continue
      }
    }

    text += char
    at += 1
  }

  if (text !== '') {
    spans.push({ kind: 'text', text })
  }

  return spans
}

export function plain(spans: readonly Span[]): string {
  return spans
    .map(span => {
      switch (span.kind) {
        case 'text':
        case 'code':
        case 'mark':
          return span.text
        case 'pill':
          return span.label
        default:
          return plain(span.spans)
      }
    })
    .join('')
}

function markLead(spans: Span[]): Span[] {
  const lead = spans.find(
    span =>
      !(span.kind === 'mark' && span.mark === 'tree') &&
      !(span.kind === 'text' && span.text.trim() === ''),
  )

  if (lead?.kind === 'bold') {
    lead.isLead = true
  }

  return spans
}

const FENCE = /^ {0,3}(`{3,}|~{3,})/
const HEADING = /^ {0,3}(#{1,6})\s+(.+?)(?:\s+#+)?\s*$/
const LIST = /^(\s*)([-*+]|\d{1,9}[.)])\s+(.*)$/
const QUOTE = /^ {0,3}>/
const RULE = /^ {0,3}([-*_])(?:\s*\1){2,}\s*$/
const TABLE_ROW = /^\s*\|.*\|\s*$/
const TABLE_RULE = /^\s*\|?\s*:?-+:?\s*(?:\|\s*:?-+:?\s*)*\|?\s*$/

function splitRow(line: string): Span[][] {
  const row = line.trim().replace(/^\|/, '').replace(/\|$/, '')
  const cells: string[] = []
  let start = 0
  let at = 0

  while (at < row.length) {
    const char = row.charAt(at)

    if (char === '\\') {
      at += 2
    } else if (char === '`') {
      at = codeSpanEnd(row, at) ?? at + runLength(row, at)
    } else if (char === '|') {
      cells.push(row.slice(start, at))
      at += 1
      start = at
    } else {
      at += 1
    }
  }
  cells.push(row.slice(start))

  return cells.map(cell => inline(cell.trim().replace(/\\\|/g, '|')))
}

const indentOf = (space: string) => space.replace(/\t/g, '    ').length

const hasPill = (spans: readonly Span[]): boolean =>
  spans.some(
    span =>
      span.kind === 'pill' ||
      ('spans' in span && hasPill(span.spans)),
  )

export function parse(markdown: string): Block[] {
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n')
  const blocks: Block[] = []
  let kept: string[] = []

  const flush = () => {
    if (kept.length > 0) {
      blocks.push({ kind: 'markdown', text: kept.join('\n') })
      kept = []
    }
  }

  const add = (block: Block) => {
    flush()
    if (block.kind !== 'blank' || blocks.at(-1)?.kind !== 'blank') {
      blocks.push(block)
    }
  }

  let at = 0

  while (at < lines.length) {
    const line = lines[at] ?? ''
    const fence = line.match(FENCE)?.[1]

    if (fence !== undefined) {
      const isClosing = (candidate: string) => {
        const closing = candidate.match(FENCE)?.[1]

        return (
          closing !== undefined &&
          closing.charAt(0) === fence.charAt(0) &&
          closing.length >= fence.length &&
          candidate.trim() === closing
        )
      }
      let end = at + 1

      while (end < lines.length && !isClosing(lines[end] ?? '')) {
        end += 1
      }
      flush()
      kept.push(...lines.slice(at, end + 1))
      flush()
      at = end + 1
      continue
    }

    if (TABLE_ROW.test(line) && TABLE_RULE.test(lines[at + 1] ?? '')) {
      let end = at + 2

      while (end < lines.length && TABLE_ROW.test(lines[end] ?? '')) {
        end += 1
      }
      const rows = [line, ...lines.slice(at + 2, end)].map(splitRow)

      if (rows.some(row => row.some(hasPill))) {
        add({ kind: 'table', rows })
      } else {
        flush()
        kept.push(...lines.slice(at, end))
        flush()
      }
      at = end
      continue
    }

    at += 1

    if (line.trim() === '') {
      add({ kind: 'blank' })
      continue
    }

    if (QUOTE.test(line) || RULE.test(line)) {
      kept.push(line)
      continue
    }

    const heading = line.match(HEADING)
    const [, hashes, title] = heading ?? []

    if (hashes !== undefined && title !== undefined) {
      add({ kind: 'heading', level: hashes.length, spans: inline(title) })
      continue
    }

    const item = line.match(LIST)
    const [, space, marker, rest] = item ?? []

    if (space !== undefined && marker !== undefined && rest !== undefined) {
      add({
        kind: 'line',
        indent: indentOf(space),
        marker: /^[*+]$/.test(marker) ? '-' : marker,
        spans: markLead(inline(rest)),
      })
      continue
    }

    const written = line.trimStart()
    add({
      kind: 'line',
      indent: indentOf(line.slice(0, line.length - written.length)),
      marker: undefined,
      spans: markLead(inline(written)),
    })
  }

  flush()

  while (blocks.at(-1)?.kind === 'blank') {
    blocks.pop()
  }
  while (blocks[0]?.kind === 'blank') {
    blocks.shift()
  }

  return blocks
}

export function isDecorated(spans: readonly Span[]): boolean {
  return spans.some(
    span =>
      span.kind === 'pill' ||
      span.kind === 'bold' ||
      span.kind === 'mark' ||
      ('spans' in span && isDecorated(span.spans)),
  )
}
