import type { Register, RenderElement } from 'claude-code'

import { drawBeneath, drawReply, isWorthDrawing } from './draw'
import type { Style } from './draw'
import { parse } from './parse'
import { arrange, piecesOf } from './passage'

const FALLBACK_COLUMNS = 80

export const register: Register = (on, options) => {
  const style: Style = {
    icons: options.icons !== false,
    roundCaps: options.roundCaps !== false,
    boldColor:
      typeof options.boldColor === 'string' && options.boldColor !== ''
        ? options.boldColor
        : 'claude',
  }

  on(
    'ui.render',
    { component: 'AssistantMessage', surface: 'terminal' },
    async ($, e, next) => {
      if (e.props.isSummary) {
        return next(e)
      }
      const parts = arrange(parse(e.props.text))

      if (!isWorthDrawing(parts)) {
        return next(e)
      }
      const kit = $.ui.resolve(e)
      const columns = e.viewport?.columns ?? FALLBACK_COLUMNS
      const drawn: RenderElement[] = []

      for (const [index, piece] of piecesOf(parts).entries()) {
        const isFirstOfReply = e.props.isFirstOfReply && index === 0

        drawn.push(
          piece.kind === 'fence'
            ? drawBeneath(
                kit,
                await next({ ...e, props: { ...e.props, text: piece.text, isFirstOfReply } }),
                isFirstOfReply,
              )
            : drawReply(kit, piece.parts, { isFirstOfReply, columns }, style),
        )
      }
      const [only] = drawn
      const { Box } = kit

      return drawn.length === 1 && only !== undefined ? (
        only
      ) : (
        <Box flexDirection="column">{drawn}</Box>
      )
    },
  )
}
