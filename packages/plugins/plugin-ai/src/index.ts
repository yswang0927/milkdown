import { Plugin, PluginKey } from "@milkdown/kit/prose/state"
import { Ctx } from "@milkdown/kit/ctx"
import type { Meta, MilkdownPlugin } from '@milkdown/kit/ctx'
import { editorViewCtx, serializerCtx, parserCtx } from "@milkdown/kit/core"
import { $prose } from "@milkdown/kit/utils"
import { Decoration, DecorationSet } from "@milkdown/kit/prose/view"
import { createApp, type App } from 'vue'

import { aiConfig } from "./config"
import { CopilotView } from "./view"

const copilotKey = new PluginKey("MilkdownAICopilot");

// 显示AI交互框
export function showAiCopilot(ctx: Ctx) {
  const view = ctx.get(editorViewCtx);
  const { state, editable } = view;
  if (!editable) {
    return;
  }

  const tr = state.tr;
  const { from, to } = tr.selection;
  const slice = (from === to) ? tr.doc.slice(0, from) : tr.doc.slice(from, to);
  const doc = state.schema.topNodeType.create(null, slice.content);
  if (!doc) {
    view.dispatch(tr.setMeta(copilotKey, {selection:'', contextBefore: '', copilotShow: true}));
    return;
  }

  const serializer = ctx.get(serializerCtx);
  const selectionText = serializer(doc);
  
  view.dispatch(tr.setMeta(copilotKey, {
    selection: (from === to) ? '' : selectionText, 
    contextBefore: selectionText, 
    copilotShow: true
  }));
}

function hideHint(ctx: Ctx) {
  const view = ctx.get(editorViewCtx);
  const { state } = view;
  const tr = state.tr;
  view.dispatch(tr.setMeta(copilotKey, {copilotShow: false}));
}

function applyHint(ctx: Ctx, content: string, insert: boolean = false) {
  const view = ctx.get(editorViewCtx);
  const { state } = view;
  const tr = state.tr;
  const parser = ctx.get(parserCtx);
  const node = parser(content);
  const slice = node.slice(0);

  if (insert) {
    // 在选区结束位置插入内容
    view.dispatch(tr.setMeta(copilotKey, {copilotShow: false}).insert(tr.selection.to, slice.content));
  } else {
    // 替换选中内容
    view.dispatch(tr.setMeta(copilotKey, {copilotShow: false}).replaceSelection(slice));
  }
}

const copilotPlugin = $prose((ctx: Ctx) => {
  const { enabled, baseUrl } = ctx.get(aiConfig.key);
  const aiEnabled = enabled && baseUrl;

  const isMacos = (navigator.userAgent.indexOf('Macintosh') !== -1) 
                  || (navigator.platform && navigator.platform.indexOf('Mac') !== -1);

  let shown = false;
  let copilotDiv: (HTMLElement | null) = null;
  let copilotViewApp: App;

  return new Plugin({
    key: copilotKey,
    props: {
      /**
       * @returns 
       *  true - 该事件已经被“消费”或处理完毕，不需要再由 ProseMirror 的核心或其他监听器进行处理。
       *  false|void - 该事件未被处理，ProseMirror 执行其默认的行为。
       */
      handleKeyDown(view, evt: KeyboardEvent) {
        if (!aiEnabled || !view.editable) {
          return false;
        }

        const eKey = evt.key.toLowerCase();

        // 快捷键 Ctrl + / 唤起AI-Copilot
        if (eKey === "/" && (evt.ctrlKey || (isMacos && evt.metaKey)) && !shown) {
          evt.stopPropagation();
          showAiCopilot(ctx);
          return true;
        }

        // 快捷键 Esc 关闭AI-Copilot
        if (eKey === 'escape' && shown) {
          shown = false;
          hideHint(ctx);
          return true;
        }

        return false;
      },
      handleDOMEvents: {
        "mousedown": () => {
          if (!aiEnabled) {
            return false;
          }
          shown && hideHint(ctx);
          return false;
        }
      },
      decorations(state) {
        return copilotKey.getState(state).deco;
      },
    },
    state: {
      init() {
        return {
          deco: DecorationSet.empty,
          widget: null as (Decoration | null),
        };
      },
      apply(tr, value, _oldState, state) {
        if (!aiEnabled) {
          return value;
        }
        
        const message = tr.getMeta(copilotKey);
        //console.log('>>> message: ', message);
        if (!message || message.copilotShow === undefined) {
          /*if (value.widget && tr.docChanged) {
            return {
              ...value,
              deco: value.deco.map(tr.mapping, tr.doc),
            };
          }*/
          return value;
        }

        // 清除提示时清理
        if (!message.copilotShow) {
          shown = false;
          copilotViewApp && (copilotViewApp.unmount());
          copilotDiv = null;
          return {
            deco: DecorationSet.empty,
            widget: null,
          };
        }

        shown = true;
        copilotDiv = document.createElement('div');
        copilotDiv.tabIndex = -1;
        copilotDiv.className = "milkdown-custom-decoration";

        copilotViewApp = createApp(CopilotView, {
          ctx: ctx, 
          selection: message.selection || '',
          contextBefore: message.contextBefore || '',
          apply: applyHint,
          hide: hideHint,
        });
        copilotViewApp.mount(copilotDiv);

        const { to } = tr.selection;
        const widget = Decoration.widget(to, () => copilotDiv as HTMLElement)

        return {
          deco: DecorationSet.create(state.doc, [widget]),
          widget: widget,
        };
      }
    }
  });
});

function withMeta<T extends MilkdownPlugin>(
  plugin: T,
  meta: Partial<Meta> & Pick<Meta, 'displayName'>
): T {
  Object.assign(plugin, {
    meta: {
      package: '@milkdown/plugin-ai',
      ...meta,
    },
  })

  return plugin
}

withMeta(copilotPlugin, {
  displayName: 'Prose<aiCopilot>',
})

export * from "./config"
export const aiPlugin: MilkdownPlugin[] = [copilotPlugin, aiConfig].flat()
