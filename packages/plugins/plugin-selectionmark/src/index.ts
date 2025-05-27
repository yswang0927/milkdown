import { Plugin, PluginKey } from "@milkdown/kit/prose/state"
import type { Meta, MilkdownPlugin } from '@milkdown/kit/ctx'
import { $prose } from "@milkdown/kit/utils"
import { Decoration, DecorationSet } from "@milkdown/kit/prose/view"

/**
 * 要给装饰插件,用于当编辑器失去焦点时,保持选区的样式, 当编辑器获得焦点时,清除选区样式.
 */
const selectionMarkDecoration = $prose(() => {
  const selectionMarkPluginKey = new PluginKey("MilkdownSelectionMark");

  return new Plugin({
    key: selectionMarkPluginKey,
    state: {
      init() {
        return {
          deco: DecorationSet.empty
        };
      },
      apply(tr, value) {
        const decoTransform = tr.getMeta(selectionMarkPluginKey);
        if (!decoTransform) {
          return value;
        }

        const { selection, doc } = tr;
        const hasSelection = selection && selection.from !== selection.to;

        if (!hasSelection || decoTransform?.action === 'focus') {
          return {
            deco: DecorationSet.empty
          };
        }

        if (hasSelection && decoTransform?.action === 'blur') {
          const decoration = Decoration.inline(selection.from, selection.to, {
            class: 'ProseMirror-selection-mark'
          });

          return {
            deco: DecorationSet.create(doc, [decoration])
          };
        }

        return value;
      }
    },
    props: {
      decorations(state) {
        if (!state) {
          return null;
        }
        // this.getState(state);
        const stateValue = selectionMarkPluginKey.getState(state);
        if (stateValue) {
          return stateValue.deco;
        }
        return null;
      },
      handleDOMEvents: {
        blur: (view) => {
          const { tr } = view.state;
          const transaction = tr.setMeta(selectionMarkPluginKey, {
            from: tr.selection.from,
            to: tr.selection.to,
            action: 'blur',
          });

          view.dispatch(transaction);
        },

        focus: (view) => {
          const { tr } = view.state;
          const transaction = tr.setMeta(selectionMarkPluginKey, {
            from: tr.selection.from,
            to: tr.selection.to,
            action: 'focus',
          });

          view.dispatch(transaction);
        },
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
      package: '@milkdown/plugin-selectionmark',
      ...meta,
    },
  })

  return plugin
}

withMeta(selectionMarkDecoration, {
  displayName: 'Prose<selectionMarkPlugin>',
})

export const selectionMarkPlugin: MilkdownPlugin[] = [selectionMarkDecoration].flat()
