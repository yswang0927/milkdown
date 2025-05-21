import { commandsCtx } from '@milkdown/core'
import { $command, $useKeymap } from '@milkdown/utils'
import { wrapIn } from '@milkdown/prose/commands'
import { withMeta } from '../__internal__'

import { listItemSchema } from './list-item'

// yswang 添加 TaskList的command和快捷键注册
// Command for creating task list node.
export const wrapInTaskListCommand = $command(
  'WrapInTaskList',
  (ctx) => () => wrapIn(listItemSchema.type(ctx), { checked: false })
)

withMeta(wrapInTaskListCommand, {
  displayName: 'Command<wrapInTaskListCommand>',
  group: 'TaskList',
})

export const taskListKeymap = $useKeymap('taskListKeymap', {
  WrapInTaskList: {
    shortcuts: 'Mod-Alt-9',
    command: (ctx) => {
      const commands = ctx.get(commandsCtx)
      return () => commands.call(wrapInTaskListCommand.key)
    },
  },
})

withMeta(taskListKeymap.ctx, {
  displayName: 'KeymapCtx<taskListKeymap>',
  group: 'TaskList',
})

withMeta(taskListKeymap.shortcuts, {
  displayName: 'Keymap<taskListKeymap>',
  group: 'TaskList',
})
