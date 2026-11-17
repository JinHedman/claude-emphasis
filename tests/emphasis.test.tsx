import { expect, test } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'

import { inline, parse, plain } from '../hooks/parse'
import { arrange } from '../hooks/passage'
import { labelIcon, readPill } from '../hooks/vocabulary'

const REPLY = {
  plugin: 'emphasis',
  surface: 'terminal',
  component: 'AssistantMessage',
  requestId: 'message-1',
} as const

const CHECK = ''
const NO_BREAK_SPACE = ' '

const draw = async ($: Parameters<TestBody>[0], text: string) => {
  const ui = await $.ui.mount({
    ...REPLY,
    props: { text, isFirstOfReply: true },
  })
  const drawn = JSON.stringify(await ui.drawn())
  await ui.unmount()

  return drawn
}

test('a pill word decides its color, icon and canonical text', () => {
  expect(readPill('Done')).toEqual({ tone: 'success', text: 'Done', icon: CHECK })
  expect(readPill('completed')).toMatchObject({ tone: 'success', text: 'Done' })
  expect(readPill('Failed: 3 tests')).toMatchObject({
    tone: 'error',
    text: 'Failed: 3 tests',
  })
  expect(readPill('Needs you').tone).toBe('warning')
  expect(readPill('Costs money').tone).toBe('danger')
  expect(readPill('Implement').tone).toBe('mode')
  expect(readPill('Shared').tone).toBe('owner')
  expect(readPill('Anything else')).toEqual({
    tone: 'neutral',
    text: 'Anything else',
    icon: undefined,
  })
  expect(readPill('Doneish').tone).toBe('neutral')
})

test('a label takes an icon as a lead, an action only with its colon', () => {
  expect(labelIcon('Cause:', true)).toBeDefined()
  expect(labelIcon('Cause', false)).toBeUndefined()
  expect(labelIcon('Check:', false)).toBeDefined()
  expect(labelIcon('Check', false)).toBeUndefined()
  expect(labelIcon('Something', true)).toBeUndefined()
})

test('inline code, escapes and unclosed markers stay as typed', () => {
  expect(inline('`[[Done]]` and \\*\\*no\\*\\*')).toEqual([
    { kind: 'code', text: '[[Done]]' },
    { kind: 'text', text: ' and **no**' },
  ])
  expect(inline('still **typing')).toEqual([
    { kind: 'text', text: 'still **typing' },
  ])
  expect(inline('snake_case_name and 2 * 3 * 4')).toEqual([
    { kind: 'text', text: 'snake_case_name and 2 * 3 * 4' },
  ])
  expect(inline(`[[${'x'.repeat(33)}]]`)).toEqual([
    { kind: 'text', text: `[[${'x'.repeat(33)}]]` },
  ])
})

test('bold, italic, links, marks and pills become spans', () => {
  expect(inline('**a `b`** *c* [d](https://e.test) ✓ → [[Done]]')).toEqual([
    {
      kind: 'bold',
      isLead: false,
      spans: [
        { kind: 'text', text: 'a ' },
        { kind: 'code', text: 'b' },
      ],
    },
    { kind: 'text', text: ' ' },
    { kind: 'italic', spans: [{ kind: 'text', text: 'c' }] },
    { kind: 'text', text: ' ' },
    {
      kind: 'link',
      href: 'https://e.test',
      spans: [{ kind: 'text', text: 'd' }],
    },
    { kind: 'text', text: ' ' },
    { kind: 'mark', text: '✓', mark: 'passed' },
    { kind: 'text', text: ' ' },
    { kind: 'mark', text: '→', mark: 'arrow' },
    { kind: 'text', text: ' ' },
    { kind: 'pill', label: 'Done' },
  ])
  expect(plain(inline('see https://e.test/a_(b). ok'))).toBe(
    'see https://e.test/a_(b). ok',
  )
})

test('fences, quotes and tables without pills are kept as markdown', () => {
  const blocks = parse(
    [
      '## Result',
      '',
      '- **Cause:** a [[Failed]] deploy',
      '  ├── api',
      '',
      '```sh',
      'echo "[[Done]]"',
      '',
      '```',
      '> an aside',
      '',
      '| a | b |',
      '|---|---|',
      '| 1 | 2 |',
      '',
      '| a | b |',
      '|---|---|',
      '| 1 | [[Done]] |',
    ].join('\n'),
  )

  expect(blocks.map(block => block.kind)).toEqual([
    'heading',
    'blank',
    'line',
    'line',
    'blank',
    'markdown',
    'markdown',
    'blank',
    'markdown',
    'blank',
    'table',
  ])
  expect(blocks[2]).toMatchObject({
    marker: '-',
    spans: [{ kind: 'bold', isLead: true }, {}, { kind: 'pill' }, {}],
  })
  expect(blocks[3]).toMatchObject({ indent: 2, spans: [{ mark: 'tree' }, {}] })
  expect(blocks[5]).toEqual({
    kind: 'markdown',
    text: '```sh\necho "[[Done]]"\n\n```',
  })
})

test('a line takes its deeper lines and tree rows into one passage', () => {
  const parts = arrange(
    parse(
      [
        'release',
        '├── artifacts',
        '- first',
        '  - nested',
        '  more of first',
        '- second',
        '',
        'apart',
      ].join('\n'),
    ),
  )

  expect(
    parts.map(part => (part.kind === 'passage' ? part.lines.length : part.kind)),
  ).toEqual([2, 3, 1, 'blank', 1])
})

test('a reply with a pill is drawn as a colored pill with its icon', async $ => {
  const drawn = await draw($, 'Deploy [[Done]] and [[Needs you]]')

  expect(drawn).toContain(`${CHECK}${NO_BREAK_SPACE}Done`)
  expect(drawn).toContain('"backgroundColor":"success"')
  expect(drawn).toContain(`Needs${NO_BREAK_SPACE}you`)
  expect(drawn).toContain('"backgroundColor":"warning"')
  expect(drawn).not.toContain('[[')
})

test(
  'icons and rounded ends can be turned off',
  { options: { icons: false, roundCaps: false } },
  async $ => {
    const drawn = await draw($, '**Cause:** deploy [[Done]]')

    expect(drawn).toContain(`${NO_BREAK_SPACE}Done${NO_BREAK_SPACE}`)
    expect(drawn).not.toContain(CHECK)
    expect(drawn).not.toContain('')
    expect(drawn).not.toContain('')
  },
)

test(
  'bold takes the configured color',
  { options: { boldColor: 'suggestion' } },
  async $ => {
    expect(await draw($, 'a **term** here')).toContain('"color":"suggestion"')
  },
)

test('a reply with nothing to decorate is left to the engine', async ($, on) => {
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>engine</Text>
  })

  expect(await draw($, 'Plain text with `[[Done]]` in code.')).toContain(
    'engine',
  )
})
