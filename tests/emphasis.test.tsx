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
  expect(readPill('Done')).toEqual({
    tone: 'success',
    text: 'Done',
    icon: CHECK,
    isGrade: false,
    opens: undefined,
  })
  expect(readPill('completed')).toMatchObject({ tone: 'success', text: 'Done' })
  expect(readPill('Failed: 3 tests')).toMatchObject({
    tone: 'error',
    text: 'Failed: 3 tests',
  })
  expect(readPill('Needs you').tone).toBe('warning')
  expect(readPill('Costs money').tone).toBe('danger')
  expect(readPill('Implement').tone).toBe('mode')
  expect(readPill('Shared').tone).toBe('owner')
  expect(readPill('Anything else')).toMatchObject({
    tone: 'neutral',
    text: 'Anything else',
    icon: undefined,
  })
  expect(readPill('Doneish').tone).toBe('neutral')
})

test('a pill word says whether it opens a callout or grades evidence', () => {
  expect(readPill('Needs you').opens).toBe('ask')
  expect(readPill('Decision').opens).toBe('ask')
  expect(readPill('Destructive').opens).toBe('ask')
  expect(readPill('Failed: 3 tests').opens).toBe('problem')
  expect(readPill('Pending').opens).toBeUndefined()
  expect(readPill('Unverified')).toMatchObject({ isGrade: true, opens: undefined })
  expect(readPill('verified')).toMatchObject({ isGrade: true, text: 'Observed' })
  expect(readPill('Done').isGrade).toBe(false)
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

test('fences stand apart, quotes and tables without pills are kept as markdown', () => {
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
    'fence',
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
    kind: 'fence',
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

test('what opens a line sets the role of its passage', () => {
  const parts = arrange(
    parse(
      [
        '[[Needs you]] the staging login.',
        '**Do:** sign in.',
        '- [[Failed]] the upload test',
        '  └── retries time out',
        '- the build [[Failed]]',
        '[[Failed 1]] [[Done 6]]',
        '**Evidence:**',
        '- ran the suite',
        '- read the log',
        '',
        '**Guess:** a race in the retry',
        '**Thinking:** two ways to fix it',
        '**Evidence:** the log',
        'a claim',
      ].join('\n'),
    ),
  )

  expect(
    parts.map(part =>
      part.kind === 'passage'
        ? [part.role, part.tone, part.lines.length]
        : part.kind,
    ),
  ).toEqual([
    ['ask', 'warning', 2],
    ['problem', 'error', 2],
    ['statement', 'neutral', 1],
    ['statement', 'neutral', 1],
    ['evidence', 'neutral', 3],
    'blank',
    ['speculation', 'neutral', 1],
    ['thinking', 'neutral', 1],
    ['evidence', 'neutral', 1],
    ['statement', 'neutral', 1],
  ])
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

test('an ask is drawn as a barred block with its action on its own row', async $ => {
  const drawn = JSON.parse(
    await draw($, '[[Needs you]] the staging login. **Do:** sign in.'),
  )
  const reply = drawn.children[1].children[0]
  const [bar, body] = reply.children

  expect(bar.props).toMatchObject({ width: 1, backgroundColor: 'warning' })
  expect(body.children).toHaveLength(2)
  expect(JSON.stringify(body.children[0])).toContain('the staging login.')
  expect(JSON.stringify(body.children[0])).not.toContain('sign in')
  expect(JSON.stringify(body.children[1])).toContain('sign in.')
})

test('evidence is dim, a guess italic, and a grade a tag with no fill', async $ => {
  const evidence = await draw($, '**Evidence:** the log [[Observed]]')

  expect(evidence).toContain('"dimColor":true')
  expect(evidence).toContain('"color":"success"')
  expect(evidence).not.toContain('backgroundColor')

  const guess = await draw($, '**Guess:** a race in the retry')

  expect(guess).toContain('"italic":true')
  expect(guess).not.toContain('"dimColor":true')

  const thinking = await draw($, '**Thinking:** two ways to fix it')

  expect(thinking).toContain('"italic":true')
  expect(thinking).toContain('"dimColor":true')
})

test('a known label hangs the lines that wrap after it', async $ => {
  const drawn = JSON.parse(await draw($, '- **Cause:** the mock is slow'))
  const row = drawn.children[1].children[0].children[0]

  expect(row.children).toHaveLength(3)
  expect(JSON.stringify(row.children[1])).toContain('Cause:')
  expect(JSON.stringify(row.children[2])).not.toContain('Cause:')
  expect(JSON.stringify(row.children[2])).toContain('"the mock is slow"')
})

test('the first two heading levels carry a rule', async $ => {
  expect(await draw($, '# Title')).toContain('━━━━')
  expect(await draw($, '## Section')).toContain('────')
  expect(await draw($, '### Detail')).not.toContain('──')
})

test('a fence is handed down the chain between the drawn parts around it', async ($, on) => {
  const beneath: { text: string; isFirstOfReply: boolean }[] = []

  on('ui.render', { component: 'AssistantMessage' }, async ($, e) => {
    beneath.push({ text: e.props.text, isFirstOfReply: e.props.isFirstOfReply })
    const { Text } = $.ui.resolve(e)

    return <Text>beneath</Text>
  })
  const fence = '```chart bar\na | 1\n```'
  const drawn = await draw($, ['```sh', 'ls', '```', '', '[[Done]] built', '', fence, '', 'after'].join('\n'))

  expect(beneath).toEqual([
    { text: '```sh\nls\n```', isFirstOfReply: true },
    { text: fence, isFirstOfReply: false },
  ])
  expect(drawn).toContain('beneath')
  expect(drawn).toContain('built')
})
