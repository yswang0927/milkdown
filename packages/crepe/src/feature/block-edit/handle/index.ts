import type { Ctx } from '@milkdown/kit/ctx'
import type { PluginView } from '@milkdown/kit/prose/state'

import { editorViewCtx } from '@milkdown/kit/core'
import { BlockProvider, block, blockConfig } from '@milkdown/kit/plugin/block'
import { paragraphSchema } from '@milkdown/kit/preset/commonmark'
import { findParent } from '@milkdown/kit/prose'
import { TextSelection } from '@milkdown/kit/prose/state'
import { createApp, type App } from 'vue'

import type { BlockEditFeatureConfig } from '../index'

import { menuIcon, plusIcon } from '../../../icons'
import { menuAPI, handleMenuAPI } from '../menu'
import { BlockHandle } from './component'

export class BlockHandleView implements PluginView {
  #content: HTMLElement
  #provider: BlockProvider
  #app: App
  readonly #ctx: Ctx
  // yswang
  #positionObserver: MutationObserver

  constructor(ctx: Ctx, config?: BlockEditFeatureConfig) {
    this.#ctx = ctx
    const content = document.createElement('div')
    content.classList.add('milkdown-block-handle')

    const app = createApp(BlockHandle, {
      onAdd: this.onAdd,
      addIcon: config?.handleAddIcon ?? (() => plusIcon),
      handleIcon: config?.handleDragIcon ?? (() => menuIcon),
      // yswang
      onHandleClick: this.onHandleClick,
    })
    app.mount(content)
    this.#app = app
    this.#content = content
    this.#provider = new BlockProvider({
      ctx,
      content,
      getOffset: () => 8,
      getPlacement: ({ active, blockDom }) => {
        if (active.node.type.name === 'heading') return 'left'

        let totalDescendant = 0
        active.node.descendants((node) => {
          totalDescendant += node.childCount
        })
        const dom = active.el
        const domRect = dom.getBoundingClientRect()
        const handleRect = blockDom.getBoundingClientRect()
        const style = window.getComputedStyle(dom)
        const paddingTop = Number.parseInt(style.paddingTop, 10) || 0
        const paddingBottom = Number.parseInt(style.paddingBottom, 10) || 0
        const height = domRect.height - paddingTop - paddingBottom
        const handleHeight = handleRect.height
        return totalDescendant > 2 || handleHeight < height
          ? 'left-start'
          : 'left'
      },
    })
    this.update()

    // yswang 监听handle的位置是否发生变化,如果变化了,则自动隐藏handle-menu
    this.#positionObserver = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        // 属性变化，判断位置是否变化, 如果变化了,则自动隐藏handle-menu
        if (mutation.type === 'attributes' && mutation.attributeName === 'style') {
          const ctx = this.#ctx
          ctx.get(handleMenuAPI.key).hide();
        }
      }
    });
    this.#positionObserver.observe(content, {
      attributes: true,
      attributeOldValue: true,
      attributeFilter: ['style']
    });
    
  }

  update = () => {
    this.#provider.update()
  }

  destroy = () => {
    this.#provider.destroy()
    this.#content.remove()
    this.#app.unmount()
    // yswang
    this.#positionObserver.disconnect();
  }

  onAdd = () => {
    const ctx = this.#ctx
    const view = ctx.get(editorViewCtx)
    if (!view.hasFocus()) view.focus()

    const { state, dispatch } = view
    const active = this.#provider.active
    if (!active) return

    const $pos = active.$pos
    const pos = $pos.pos + active.node.nodeSize
    let tr = state.tr.insert(pos, paragraphSchema.type(ctx).create())
    tr = tr.setSelection(TextSelection.near(tr.doc.resolve(pos)))
    dispatch(tr.scrollIntoView())

    this.#provider.hide()
    ctx.get(menuAPI.key).show(tr.selection.from)
  }

  // yswang add
  onHandleClick = (trigger: any) => {
    const ctx = this.#ctx
    ctx.get(handleMenuAPI.key).show(trigger)
  }
}

export function configureBlockHandle(
  ctx: Ctx,
  config?: BlockEditFeatureConfig
) {
  ctx.set(blockConfig.key, {
    filterNodes: (pos) => {
      const filter = findParent((node) =>
        ['table', 'blockquote', 'math_inline'].includes(node.type.name)
      )(pos)
      if (filter) return false

      return true
    },
  })
  ctx.set(block.key, {
    view: () => new BlockHandleView(ctx, config),
  })
}
