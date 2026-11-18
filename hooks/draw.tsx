import type { Elements, RenderElement } from 'claude-code'

import { isDecorated, plain } from './parse'
import type { Line, Mark, Span } from './parse'
import { isCallout } from './passage'
import type { Drawable, Part, Passage } from './passage'
import { isAction, isKnownLabel, labelIcon, readPill } from './vocabulary'
import type { Role, Tone } from './vocabulary'

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
const GUTTER = 2
const HEADING_RULES: Record<number, string> = { 1: '━', 2: '─' }
const RULE_MARGIN = 2
const SHORTEST_RULE = 4

type Tint = { dim: boolean; italic: boolean }

const PLAIN: Tint = { dim: false, italic: false }

const TINTS: Record<Role, Tint> = {
  ask: PLAIN,
  problem: PLAIN,
  statement: PLAIN,
  evidence: { dim: true, italic: false },
  speculation: { dim: false, italic: true },
  thinking: { dim: true, italic: true },
}

function trimStart(spans: readonly Span[]): Span[] {
  const [first, ...rest] = spans

  if (first?.kind !== 'text') {
    return [...spans]
  }
  const text = first.text.trimStart()

  return text === '' ? rest : [{ kind: 'text', text }, ...rest]
}

function trimEnd(spans: readonly Span[]): Span[] {
  const last = spans.at(-1)
  const rest = spans.slice(0, -1)

  if (last?.kind !== 'text') {
    return [...spans]
  }
  const text = last.text.trimEnd()

  return text === '' ? rest : [...rest, { kind: 'text', text }]
}

function splitAtAction(spans: readonly Span[]): Span[][] {
  const at = spans.findIndex(
    (span, index) =>
      index > 0 && span.kind === 'bold' && isAction(plain(span.spans)),
  )
  const action = spans[at]

  if (action?.kind !== 'bold') {
    return [[...spans]]
  }

  return [
    trimEnd(spans.slice(0, at)),
    [{ ...action, isLead: true }, ...spans.slice(at + 1)],
  ]
}

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

export function drawBeneath(
  { Box }: Pick<Kit, 'Box'>,
  beneath: RenderElement,
  isFirstOfReply: boolean,
): RenderElement {
  // Claude: core draws a block that does not open its reply without the reply's gutter.
  if (isFirstOfReply || beneath.type !== 'engine') {
    return beneath
  }

  return (
    <Box flexDirection="row">
      <Box flexShrink={0} minWidth={GUTTER} />
      <Box flexDirection="column" flexGrow={1} flexShrink={1}>
        {beneath}
      </Box>
    </Box>
  )
}

export function isWorthDrawing(parts: readonly Part[]): boolean {
  return parts.some(part => {
    switch (part.kind) {
      case 'passage':
        return part.lines.some(line => isDecorated(line.spans))
      case 'heading':
      case 'table':
        return true
      default:
        return false
    }
  })
}

export function drawReply(
  { Box, Text, Link, Markdown }: Kit,
  parts: readonly Drawable[],
  frame: Frame,
  style: Style,
): RenderElement {
  const pillText = (label: string) => {
    const { tone, text, icon, isGrade } = readPill(label)
    const shown = style.icons && icon !== undefined ? `${icon} ${text}` : text

    return { tone, isGrade, text: shown.replaceAll(' ', NO_BREAK_SPACE) }
  }

  const iconOf = (spans: readonly Span[], isLead: boolean) =>
    style.icons ? labelIcon(plain(spans), isLead) : undefined

  const spanCells = (span: Span): number => {
    switch (span.kind) {
      case 'text':
      case 'code':
      case 'mark':
        return cellsOf(span.text)
      case 'pill': {
        const { text, isGrade } = pillText(span.label)

        return cellsOf(text) + (isGrade ? 0 : 2)
      }
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

  const drawSpan = (span: Span, tint: Tint = PLAIN): Node => {
    const drawInner = (inner: Span) => drawSpan(inner, tint)

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
        const { tone, text, isGrade } = pillText(span.label)
        const fill = TONE_COLORS[tone]

        if (isGrade) {
          return <Text color={fill}>{text}</Text>
        }

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
        const inner = span.spans.map(drawInner)
        const shown = icon === undefined ? inner : [`${icon} `, ...inner]

        return tint.dim ? (
          <Text bold dimColor>
            {shown}
          </Text>
        ) : (
          <Text bold color={style.boldColor}>
            {shown}
          </Text>
        )
      }
      case 'italic':
        return <Text italic>{span.spans.map(drawInner)}</Text>
      case 'strike':
        return <Text strikethrough>{span.spans.map(drawInner)}</Text>
      case 'link':
        return <Link href={span.href}>{span.spans.map(drawInner)}</Link>
    }
  }

  const drawTable = (rows: readonly Span[][][]): RenderElement => {
    const columnCount = Math.max(...rows.map(row => row.length))
    const widths = Array.from({ length: columnCount }, (_, column) =>
      Math.max(1, ...rows.map(row => spansCells(row[column] ?? []))),
    )
    const room = frame.columns - GUTTER - COLUMN_GAP * (columnCount - 1)
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
            <Text bold>{(header[column] ?? []).map(span => drawSpan(span))}</Text>
          )),
        )}
        {drawRow(
          widths.map(width => <Text dimColor>{'─'.repeat(width)}</Text>),
        )}
        {body.map(row =>
          drawRow(
            widths.map((_, column) => (
              <Text>{(row[column] ?? []).map(span => drawSpan(span))}</Text>
            )),
          ),
        )}
      </Box>
    )
  }

  const drawRow = (
    spans: readonly Span[],
    tint: Tint,
    indent: number,
    marker: string | undefined,
  ): RenderElement => {
    const [lead, ...rest] = spans
    const label =
      lead?.kind === 'bold' && isKnownLabel(plain(lead.spans)) ? lead : undefined
    const body = label === undefined ? spans : trimStart(rest)

    return (
      <Box flexDirection="row" paddingLeft={indent}>
        {marker === undefined ? null : (
          <Box flexShrink={0}>
            <Text dimColor={tint.dim}>{`${marker} `}</Text>
          </Box>
        )}
        {label === undefined ? null : (
          <Box flexShrink={0} marginRight={body.length === 0 ? 0 : 1}>
            <Text dimColor={tint.dim} italic={tint.italic}>
              {drawSpan(label, tint)}
            </Text>
          </Box>
        )}
        {label !== undefined && body.length === 0 ? null : (
          <Text dimColor={tint.dim} italic={tint.italic}>
            {body.map(span => drawSpan(span, tint))}
          </Text>
        )}
      </Box>
    )
  }

  const drawLine = (line: Line, tint: Tint): RenderElement =>
    drawRow(line.spans, tint, line.indent, line.marker)

  const drawCallout = (passage: Passage): RenderElement => {
    const [opener, ...rest] = passage.lines

    if (opener === undefined) {
      return <Box />
    }
    const textStart =
      opener.indent +
      (opener.marker === undefined ? 0 : opener.marker.length + 1)

    return (
      <Box flexDirection="row" paddingLeft={opener.indent}>
        <Box
          flexShrink={0}
          width={1}
          backgroundColor={TONE_COLORS[passage.tone]}
        />
        <Box flexDirection="column" flexGrow={1} flexShrink={1} paddingLeft={1}>
          {splitAtAction(opener.spans).map(spans =>
            drawRow(spans, PLAIN, 0, undefined),
          )}
          {rest.map(line =>
            drawRow(
              line.spans,
              PLAIN,
              Math.max(0, line.indent - textStart),
              line.marker,
            ),
          )}
        </Box>
      </Box>
    )
  }

  const drawPassage = (passage: Passage): RenderElement =>
    isCallout(passage) ? (
      drawCallout(passage)
    ) : (
      <Box flexDirection="column">
        {passage.lines.map(line => drawLine(line, TINTS[passage.role]))}
      </Box>
    )

  const drawPart = (part: Drawable): RenderElement => {
    switch (part.kind) {
      case 'blank':
        return <Box height={1} />
      case 'markdown':
        return <Markdown text={part.text} />
      case 'table':
        return drawTable(part.rows)
      case 'passage':
        return drawPassage(part)
      case 'heading': {
        const icon = iconOf(part.spans, true)
        const title = part.spans.map(span => drawSpan(span))
        const shown = icon === undefined ? title : [`${icon} `, ...title]
        const rule = HEADING_RULES[part.level]
        const room =
          frame.columns -
          GUTTER -
          spansCells(part.spans) -
          (icon === undefined ? 0 : 2) -
          1 -
          RULE_MARGIN

        if (rule === undefined || room < SHORTEST_RULE) {
          return (
            <Text bold={part.level <= 3} italic={part.level > 3}>
              {shown}
            </Text>
          )
        }

        return (
          <Box flexDirection="row" columnGap={1}>
            <Box flexShrink={0}>
              <Text bold>{shown}</Text>
            </Box>
            <Text dimColor wrap="truncate-end">
              {rule.repeat(room)}
            </Text>
          </Box>
        )
      }
    }
  }

  return (
    <Box flexDirection="row" marginTop={1}>
      <Box flexShrink={0} minWidth={GUTTER}>
        <Text>{frame.isFirstOfReply ? REPLY_BULLET : ' '}</Text>
      </Box>
      <Box flexDirection="column" flexGrow={1} flexShrink={1}>
        {parts.map(drawPart)}
      </Box>
    </Box>
  )
}
