import type { Elements, RenderElement } from 'claude-code'

import { isDecorated, plain } from './parse'
import type { Line, Mark, Span } from './parse'
import type { Part } from './passage'
import { labelIcon, readPill } from './vocabulary'
import type { Tone } from './vocabulary'

export type Style = {
  icons: boolean
  roundCaps: boolean
  boldColor: string
}

export type Frame = { isFirstOfReply: boolean; columns: number }

type Kit = Pick<Elements['terminal'], 'Box' | 'Text' | 'Link' | 'Markdown'>
type Node = RenderElement | string

const TONE_COLORS: Record<Tone, string> = {
  error: 'error',
  warning: 'warning',
  success: 'success',
  danger: 'claude',
  mode: 'planMode',
  owner: 'ide',
  neutral: 'suggestion',
}

const MARK_COLORS: Record<Exclude<Mark, 'tree'>, string> = {
  passed: 'success',
  failed: 'error',
  arrow: 'claude',
}

const NO_BREAK_SPACE = ' '
const LEFT_CAP = ''
const RIGHT_CAP = ''
const REPLY_BULLET = '⏺'
const COLUMN_GAP = 2
const NARROWEST_COLUMN = 8

function isWide(code: number): boolean {
  return (
    (code >= 0x1100 && code <= 0x115f) ||
    (code >= 0x2e80 && code <= 0xa4cf) ||
    (code >= 0xac00 && code <= 0xd7a3) ||
    (code >= 0xf900 && code <= 0xfaff) ||
    (code >= 0xfe30 && code <= 0xfe6f) ||
    (code >= 0xff00 && code <= 0xff60) ||
    (code >= 0xffe0 && code <= 0xffe6) ||
    (code >= 0x1f300 && code <= 0x1faff) ||
    (code >= 0x20000 && code <= 0x3fffd)
  )
}

function isZeroWidth(code: number): boolean {
  return (
    code === 0x200d ||
    (code >= 0x300 && code <= 0x36f) ||
    (code >= 0xfe00 && code <= 0xfe0f)
  )
}

export function cellsOf(text: string): number {
  let cells = 0

  for (const char of text) {
    const code = char.codePointAt(0) ?? 0
    cells += isZeroWidth(code) ? 0 : isWide(code) ? 2 : 1
  }

  return cells
}

export function isWorthDrawing(parts: readonly Part[], style: Style): boolean {
  return parts.some(part => {
    switch (part.kind) {
      case 'passage':
        return part.lines.some(line => isDecorated(line.spans))
      case 'heading':
        return (
          isDecorated(part.spans) ||
          (style.icons && labelIcon(plain(part.spans), true) !== undefined)
        )
      case 'table':
        return true
      default:
        return false
    }
  })
}

export function drawReply(
  { Box, Text, Link, Markdown }: Kit,
  parts: readonly Part[],
  frame: Frame,
  style: Style,
): RenderElement {
  const pillText = (label: string) => {
    const { tone, text, icon } = readPill(label)
    const shown = style.icons && icon !== undefined ? `${icon} ${text}` : text

    return { tone, text: shown.replaceAll(' ', NO_BREAK_SPACE) }
  }

  const iconOf = (spans: readonly Span[], isLead: boolean) =>
    style.icons ? labelIcon(plain(spans), isLead) : undefined

  const spanCells = (span: Span): number => {
    switch (span.kind) {
      case 'text':
      case 'code':
      case 'mark':
        return cellsOf(span.text)
      case 'pill':
        return cellsOf(pillText(span.label).text) + 2
      case 'bold':
        return (
          spansCells(span.spans) +
          (iconOf(span.spans, span.isLead) === undefined ? 0 : 2)
        )
      default:
        return spansCells(span.spans)
    }
  }

  const spansCells = (spans: readonly Span[]): number =>
    spans.reduce((cells, span) => cells + spanCells(span), 0)

  const drawSpan = (span: Span): Node => {
    switch (span.kind) {
      case 'text':
        return span.text
      case 'code':
        return <Text color="permission">{span.text}</Text>
      case 'mark':
        return span.mark === 'tree' ? (
          <Text dimColor>{span.text}</Text>
        ) : (
          <Text color={MARK_COLORS[span.mark]}>{span.text}</Text>
        )
      case 'pill': {
        const { tone, text } = pillText(span.label)
        const fill = TONE_COLORS[tone]

        return style.roundCaps ? (
          <Text>
            <Text color={fill}>{LEFT_CAP}</Text>
            <Text backgroundColor={fill} color="inverseText" bold>
              {text}
            </Text>
            <Text color={fill}>{RIGHT_CAP}</Text>
          </Text>
        ) : (
          <Text backgroundColor={fill} color="inverseText" bold>
            {NO_BREAK_SPACE + text + NO_BREAK_SPACE}
          </Text>
        )
      }
      case 'bold': {
        const icon = iconOf(span.spans, span.isLead)
        const inner = span.spans.map(drawSpan)

        return (
          <Text bold color={style.boldColor}>
            {icon === undefined ? inner : [`${icon} `, ...inner]}
          </Text>
        )
      }
      case 'italic':
        return <Text italic>{span.spans.map(drawSpan)}</Text>
      case 'strike':
        return <Text strikethrough>{span.spans.map(drawSpan)}</Text>
      case 'link':
        return <Link href={span.href}>{span.spans.map(drawSpan)}</Link>
    }
  }

  const drawTable = (rows: readonly Span[][][]): RenderElement => {
    const columnCount = Math.max(...rows.map(row => row.length))
    const widths = Array.from({ length: columnCount }, (_, column) =>
      Math.max(1, ...rows.map(row => spansCells(row[column] ?? []))),
    )
    const room = frame.columns - 2 - COLUMN_GAP * (columnCount - 1)
    let excess = widths.reduce((total, width) => total + width, 0) - room

    while (excess > 0) {
      const widest = Math.max(...widths)

      if (widest <= NARROWEST_COLUMN) {
        break
      }
      widths[widths.indexOf(widest)] = widest - 1
      excess -= 1
    }

    const drawRow = (cells: readonly Node[]) => (
      <Box flexDirection="row" columnGap={COLUMN_GAP}>
        {cells.map((cell, column) => (
          <Box width={widths[column] ?? 1} flexShrink={0}>
            {cell}
          </Box>
        ))}
      </Box>
    )
    const [header = [], ...body] = rows

    return (
      <Box flexDirection="column">
        {drawRow(
          widths.map((_, column) => (
            <Text bold>{(header[column] ?? []).map(drawSpan)}</Text>
          )),
        )}
        {drawRow(
          widths.map(width => <Text dimColor>{'─'.repeat(width)}</Text>),
        )}
        {body.map(row =>
          drawRow(
            widths.map((_, column) => (
              <Text>{(row[column] ?? []).map(drawSpan)}</Text>
            )),
          ),
        )}
      </Box>
    )
  }

  const drawLine = (line: Line): RenderElement => (
    <Box flexDirection="row" paddingLeft={line.indent}>
      {line.marker === undefined ? null : (
        <Box flexShrink={0}>
          <Text>{`${line.marker} `}</Text>
        </Box>
      )}
      <Text>{line.spans.map(drawSpan)}</Text>
    </Box>
  )

  const drawPart = (part: Part): RenderElement => {
    switch (part.kind) {
      case 'blank':
        return <Box height={1} />
      case 'markdown':
        return <Markdown text={part.text} />
      case 'table':
        return drawTable(part.rows)
      case 'passage':
        return <Box flexDirection="column">{part.lines.map(drawLine)}</Box>
      case 'heading': {
        const icon = iconOf(part.spans, true)
        const title = part.spans.map(drawSpan)
        const isTop = part.level === 1

        return (
          <Text bold italic={isTop} underline={isTop}>
            {icon === undefined ? title : [`${icon} `, ...title]}
          </Text>
        )
      }
    }
  }

  return (
    <Box flexDirection="row" marginTop={1}>
      <Box flexShrink={0} minWidth={2}>
        <Text>{frame.isFirstOfReply ? REPLY_BULLET : ' '}</Text>
      </Box>
      <Box flexDirection="column" flexGrow={1} flexShrink={1}>
        {parts.map(drawPart)}
      </Box>
    </Box>
  )
}
