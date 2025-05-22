import type { Ctx } from '@milkdown/kit/ctx'
import { Icon } from '@milkdown/kit/component'
import { commandsCtx } from '@milkdown/kit/core'

import {
  createCodeBlockCommand,
  turnIntoTextCommand,
  wrapInHeadingCommand,
  wrapInBlockquoteCommand,
  wrapInBulletListCommand,
  wrapInOrderedListCommand,
  wrapInTaskListCommand,
} from '@milkdown/kit/preset/commonmark'

import {
  defineComponent,
  ref,
  type Ref,
  h,
} from 'vue'

import type { BlockEditFeatureConfig } from '..'

import {
  bulletListIcon,
  codeIcon,
  h1Icon,
  h2Icon,
  h3Icon,
  h4Icon,
  h5Icon,
  h6Icon,
  orderedListIcon,
  quoteIcon,
  textIcon,
  todoListIcon,
} from '../../../icons'

// yswang 添加handle点击菜单

h

type HandleMenuProps = {
  ctx: Ctx
  show: Ref<boolean>
  hide: () => void
  config?: BlockEditFeatureConfig
}

type HandleMenuItemsType = {
    action: string
    title: string
    icon: any
}[][];

export const HandleMenuComponent = defineComponent<HandleMenuProps>({
  props: {
    ctx: {
      type: Object,
      required: true,
    },
    show: {
      type: Object,
      required: true,
    },
    hide: {
      type: Function,
      required: true,
    },
    config: {
      type: Object,
      required: false,
    },
  },
  setup(props) {
    const { ctx, hide, config } = props
    const host = ref<HTMLElement>()

    const menuItems: HandleMenuItemsType = [
      [
        { "action": "h1", "title": config?.slashMenuH1Label ?? "一级标题", "icon": config?.slashMenuH1Icon ?? h1Icon },
        { "action": "h2", "title": config?.slashMenuH2Label ?? "二级标题", "icon": config?.slashMenuH2Icon ?? h2Icon },
        { "action": "h3", "title": config?.slashMenuH3Label ?? "三级标题", "icon": config?.slashMenuH3Icon ?? h3Icon },
        { "action": "h4", "title": config?.slashMenuH4Label ?? "四级标题", "icon": config?.slashMenuH4Icon ?? h4Icon },
        { "action": "h5", "title": config?.slashMenuH5Label ?? "五级标题", "icon": config?.slashMenuH5Icon ?? h5Icon },
        { "action": "h6", "title": config?.slashMenuH6Label ?? "六级标题", "icon": config?.slashMenuH6Icon ?? h6Icon }
      ],
      [
        { "action": "text", "title": config?.slashMenuTextLabel ?? "正文", "icon": config?.slashMenuTextIcon ?? textIcon },
        { "action": "bullet_list", "title": config?.slashMenuBulletListLabel ?? "无序列表", "icon": config?.slashMenuBulletListIcon ?? bulletListIcon },
        { "action": "ordered_list", "title": config?.slashMenuOrderedListLabel ?? "有序列表", "icon": config?.slashMenuOrderedListIcon ?? orderedListIcon },
        { "action": "todo_list", "title": config?.slashMenuTaskListLabel ?? "任务列表", "icon": config?.slashMenuTaskListIcon ?? todoListIcon },
        { "action": "quote", "title": config?.slashMenuQuoteLabel ?? "引用", "icon": config?.slashMenuQuoteIcon ?? quoteIcon },
        { "action": "code", "title": config?.slashMenuCodeBlockLabel ?? "代码块", "icon": config?.slashMenuCodeBlockIcon ?? codeIcon }
      ]
    ];

    /*watch([show], () => {
      const isShown = show.value;
    })*/

    const onClick = (fn: (ctx: Ctx) => void) => (e: MouseEvent) => {
      e.preventDefault()
      e.stopPropagation()
      ctx && fn(ctx)
    }

    const handleClick = (ctx: Ctx, action: string) => {
      switch(action) {
        case 'text':
          ctx.get(commandsCtx).call(turnIntoTextCommand.key)
          break;
        case 'h1':
        case 'h2':
        case 'h3':
        case 'h4':
        case 'h5':
        case 'h6':
          let levelMatched = action.match(/h(\d+)/);
          if (levelMatched !== null && levelMatched.length > 1) {
            ctx.get(commandsCtx).call(wrapInHeadingCommand.key, levelMatched[1])
          }
          break;
        case 'bullet_list':
          ctx.get(commandsCtx).call(wrapInBulletListCommand.key);
          break;
        case 'ordered_list':
          ctx.get(commandsCtx).call(wrapInOrderedListCommand.key);
          break;
        case 'todo_list':
          ctx.get(commandsCtx).call(wrapInTaskListCommand.key);
          break;
        case 'quote':
          ctx.get(commandsCtx).call(wrapInBlockquoteCommand.key);
          break;
        case 'code':
          ctx.get(commandsCtx).call(createCodeBlockCommand.key);
          break;
      }

      hide();
    }

    return () => {
      return (
        <div ref={host} class="milkdown-handle-menu-items" onPointerdown={(e) => e.preventDefault()}>
          <div class="menu-header">转换为</div>
          {menuItems.map((items) => (
            <div class="menu-items">
              {items.map((item) => (
                <div class="menu-item">
                  <button title={item.title} onClick={onClick(ctx => handleClick(ctx, item.action))}>
                    <Icon icon={item.icon} />
                  </button>
                </div>
              ))}
            </div>
          ))}
        </div>
      )
    }
  },
})
