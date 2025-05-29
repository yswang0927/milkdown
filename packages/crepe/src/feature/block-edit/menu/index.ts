import type { Ctx } from '@milkdown/kit/ctx'
import type { EditorView } from '@milkdown/kit/prose/view'

import { SlashProvider, slashFactory } from '@milkdown/kit/plugin/slash'
import {
  TextSelection,
  type PluginView,
  type Selection,
} from '@milkdown/kit/prose/state'
import { $ctx } from '@milkdown/kit/utils'
import { createApp, ref, type App, type Ref } from 'vue'

import type { BlockEditFeatureConfig } from '../index'

import { isInCodeBlock, isInList } from '../../../utils'
import { Menu } from './component'

// yswang
import { computePosition, flip, offset, shift } from '@floating-ui/dom'
import { HandleMenuComponent } from './handle-menu'

// yswang
export const handleMenu = slashFactory('HANDLE_MENU')

export const menu = slashFactory('CREPE_MENU')

export interface MenuAPI {
  show: (pos: number) => void
  hide: () => void
}

export const menuAPI = $ctx(
  {
    show: () => {},
    hide: () => {},
  } as MenuAPI,
  'menuAPICtx'
)

export function configureMenu(ctx: Ctx, config?: BlockEditFeatureConfig) {
  ctx.set(menu.key, {
    view: (view) => new MenuView(ctx, view, config),
  })
}

class MenuView implements PluginView {
  readonly #content: HTMLElement
  readonly #app: App
  readonly #filter: Ref<string>
  readonly #slashProvider: SlashProvider
  #programmaticallyPos: number | null = null

  constructor(ctx: Ctx, view: EditorView, config?: BlockEditFeatureConfig) {
    const content = document.createElement('div')
    content.classList.add('milkdown-slash-menu')
    const show = ref(false)

    const filter = ref('')
    this.#filter = filter

    const hide = this.hide

    const app = createApp(Menu, {
      ctx,
      config,
      show,
      filter,
      hide,
    })
    this.#app = app
    app.mount(content)

    this.#content = content
    // oxlint-disable-next-line ts/no-this-alias
    const self = this
    this.#slashProvider = new SlashProvider({
      content: this.#content,
      debounce: 20,
      shouldShow(this: SlashProvider, view: EditorView) {
        if (
          isInCodeBlock(view.state.selection) ||
          isInList(view.state.selection)
        )
          return false

        const currentText = this.getContent(view, (node) =>
          ['paragraph', 'heading'].includes(node.type.name)
        )

        if (currentText == null) return false

        if (!isSelectionAtEndOfNode(view.state.selection)) {
          return false
        }

        const pos = self.#programmaticallyPos

        filter.value = currentText.startsWith('/')
          ? currentText.slice(1)
          : currentText

        if (typeof pos === 'number') {
          const maxSize = view.state.doc.nodeSize - 2
          const validPos = Math.min(pos, maxSize)
          if (
            view.state.doc.resolve(validPos).node() !==
            view.state.doc.resolve(view.state.selection.from).node()
          ) {
            self.#programmaticallyPos = null

            return false
          }

          return true
        }

        if (!currentText.startsWith('/')) return false

        return true
      },
      offset: 10,
    })

    this.#slashProvider.onShow = () => {
      show.value = true
    }
    this.#slashProvider.onHide = () => {
      show.value = false
    }
    this.update(view)

    ctx.set(menuAPI.key, {
      show: (pos) => this.show(pos),
      hide: () => this.hide(),
    })
  }

  update = (view: EditorView) => {
    this.#slashProvider.update(view)
  }

  show = (pos: number) => {
    this.#programmaticallyPos = pos
    this.#filter.value = ''
    this.#slashProvider.show()
  }

  hide = () => {
    this.#programmaticallyPos = null
    this.#slashProvider.hide()
  }

  destroy = () => {
    this.#slashProvider.destroy()
    this.#app.unmount()
    this.#content.remove()
  }
}

function isSelectionAtEndOfNode(selection: Selection) {
  if (!(selection instanceof TextSelection)) return false

  const { $head } = selection
  const parent = $head.parent
  const offset = $head.parentOffset

  return offset === parent.content.size
}


// ================= yswang add handle-menu= ===================
export interface HanleMenuApiType {
  show: (trigger: HTMLElement) => void
  hide: () => void
}
export const handleMenuAPI = $ctx(
  {
    show: () => {},
    hide: () => {},
  } as HanleMenuApiType,
  'handleMenuAPICtx'
)

export function configureHandleMenu(ctx: Ctx, config?: BlockEditFeatureConfig) {
  ctx.set(handleMenu.key, {
    view: (view) => new HandleMenuView(ctx, view, config),
  })
}

class HandleMenuView implements PluginView {
  readonly #content: HTMLElement
  readonly #app: App
  //readonly #menuProvider: SlashProvider

  constructor(ctx: Ctx, view: EditorView, config?: BlockEditFeatureConfig) {
    const content = document.createElement('div');
    content.className = 'milkdown-handle-menu';
    content.style.display = 'none';
    (view.dom.parentElement || document.body).appendChild(content);

    const show = ref(false);
    const hide = this.hide;
    
    const app = createApp(HandleMenuComponent, {
      ctx: ctx,
      config: config,
      show: show,
      hide: hide
    });

    this.#app = app;
    app.mount(content);

    this.#content = content;

    /*this.#menuProvider = new SlashProvider({
      content: this.#content,
      debounce: 20,
      shouldShow: (view) => {
        console.log('>> shouldMenushow: ', this.menuShow);
        console.log('>> view-hasfocus: '+ view.hasFocus());
        return false;
      }
    });*/

    /*this.#menuProvider.onShow = () => {
      show.value = true
    }
    this.#menuProvider.onHide = () => {
      show.value = false
    }*/

    this.update(view)

    ctx.set(handleMenuAPI.key, {
      show: (trigger) => this.show(trigger),
      hide: () => this.hide(),
    })
  }

  update = (view: EditorView) => {
    //this.#menuProvider.update(view);
  }

  show = (trigger: HTMLElement) => {
    trigger.classList.add('active');
    //this.#menuProvider.show();
    this.#content.style.display = 'block';
    this.#content.style.opacity = '0';
    computePosition(trigger, this.#content, {
      placement: 'bottom-start',
      middleware: [flip(), shift(), offset({mainAxis: 4, crossAxis: 0})]
    }).then(({ x, y }) => {
      Object.assign(this.#content.style, {
        left: `${x}px`,
        top: `${y}px`,
      });
      this.#content.style.opacity = '1';
    });

    document.addEventListener('pointerdown', (e) => {
      if (this.#content.contains(e.target as Node)) {
        return false;
      }
      this.hide();
      trigger.classList.remove('active');
      return false;
    }, {once: true});
  }

  hide = () => {
    //this.#menuProvider.hide();
    this.#content.style.display = 'none';
  }

  destroy = () => {
    this.#app.unmount();
    //this.#menuProvider.destroy();
    this.#content.remove();
  }
}