import type { Register } from 'claude-code'

import { drawReply, isWorthDrawing } from './draw'
import type { Style } from './draw'
import { parse } from './parse'
import { arrange } from './passage'

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
    ($, e, next) => {
      if (e.props.isSummary) {
        return next(e)
      }
      const parts = arrange(parse(e.props.text))

      if (!isWorthDrawing(parts)) {
        return next(e)
      }

      return drawReply(
        $.ui.resolve(e),
        parts,
        {
          isFirstOfReply: e.props.isFirstOfReply,
          columns: e.viewport?.columns ?? FALLBACK_COLUMNS,
        },
        style,
      )
    },
  )
}
