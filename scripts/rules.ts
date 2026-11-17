import {
  ACTION_ICONS,
  CONTEXT_WORDS,
  LABEL_ICONS,
  VOCABULARY,
} from '../hooks/vocabulary.ts'

const titled = (word: string) => word.charAt(0).toUpperCase() + word.slice(1)

const pills = (words: readonly string[]) =>
  words.map(word => `[[${word}]]`).join(', ')

const labels = Object.keys(LABEL_ICONS).map(titled).join(', ')

const leadIns = Object.keys(ACTION_ICONS)
  .map(word => `**${titled(word)}:**`)
  .join(' ')

console.log(`# Reply marks

The Claude Code terminal draws the marks below specially in replies. Use them by default in replies the user reads in the interactive terminal. They are drawn nowhere else, so write plain text in a headless run, a subagent's report, and any reply another program reads. Keep them out of files, code, commit messages, pull requests, and messages to other tools, agents or people, and leave them out when asked for plain text or an exact format. A short plain answer needs none.

- **Pills.** \`[[Word]]\` beside the thing it describes is drawn as a colored pill with an icon chosen from the word. A pill names a state or an ask, never an adjective. Use exactly these words, so the same state always reads the same:
  - Red, something is wrong: ${pills(VOCABULARY.error.core)}. Every failure and blocker carries one.
  - Yellow, look here: ${pills(VOCABULARY.warning.core)}. [[Needs you]] is an action only the user can take, and [[Decision]] is a call only the user can make. Every ask and every unchecked claim carries one.
  - Green, settled: ${pills(VOCABULARY.success.core)}.
  - Orange, consequences: ${pills(VOCABULARY.danger.core)}. Required beside any action that has one, before taking it.
  - Teal, kind of work: ${pills(VOCABULARY.mode.core)}. Optional, to open a long reply with what you understood the request to be.
  - Blue, ownership: ${pills(VOCABULARY.owner.core)}, beside anything you change or propose to change outside the task's own files.
  - Soft blue, context: ${pills(CONTEXT_WORDS)}, or any other short label.
- **Pill placement.** Mark evidence with [[Observed]] (seen in the real system), [[Inferred]] (reasoned from other signals) or [[Unverified]] (not checked). A known word may carry short detail: [[Passed 12/12]], [[Failed: 3 tests]]. Use one pill per sentence, bullet or table cell, except in a one-line scoreboard such as [[Done 6]] [[Failed 1]] [[Needs you 1]]. Keep pills out of headings, code, paths, commands and anything the user may copy, and do not invent status words.
- **An attention pill carries its action.** After a red, yellow or orange pill, give the one fact the user needs to act on it, led by a bold word ending in a colon. These lead-ins get an icon: ${leadIns}. For example: "[[Needs you]] the staging login. **Do:** sign in, then I can read the deploy log."
- **Labels.** A heading, or bold text opening a line or list item, gets an icon when it is one of: ${labels}. Write the label as a plain word and never type icon glyphs.
- **Bold** is drawn in color, so keep it for the few terms that carry the point.
- **Shapes.** Use \`→\` for a sequence, \`✓\` or \`✗\` beside a checked item, and \`├──\` and \`└──\` rows, indented under their parent with no list dash, for what belongs to what.`)
