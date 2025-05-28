import type { Ctx, MilkdownPlugin } from '@milkdown/kit/ctx'
import { Plugin, PluginKey } from "@milkdown/kit/prose/state"
import { $prose, $ctx } from "@milkdown/kit/utils"

/**
 * 右键菜单插件,用于在编辑器中添加右键菜单功能.
 */

export interface ContextMenuItem {
  icon?: string;
  label?: string; 
  disabled?: boolean;
  divider?: boolean;
  chidren?: (ctx: Ctx) => Array<ContextMenuItem> | Array<ContextMenuItem>;
  [key: string]: any; // 允许添加其他属性
}

export interface ContextMenuConfig {
  enabled?: boolean;
  menus: (ctx: Ctx, e: MouseEvent) => Array<ContextMenuItem> | Array<ContextMenuItem>;
  click?: (item: ContextMenuItem | undefined, ctx: Ctx, e: MouseEvent) => void;
}

const defaultContextMenuConfig: ContextMenuConfig = {
  enabled: false,
  menus: () => [],
  click: () => {}
};

export const contextMenuConfig = $ctx<ContextMenuConfig, 'contextMenuConfigCtx'>(defaultContextMenuConfig, 'contextMenuConfigCtx');

contextMenuConfig.meta = {
  package: '@milkdown/plugin-contextmenu',
  displayName: 'Ctx<contextMenuConfigCtx>',
}

const innerContextMenuPlugin = $prose((ctx: Ctx) => {
  const contextMenuPluginKey = new PluginKey("MilkdownContextMenu");

  const { enabled, menus, click } = ctx.get(contextMenuConfig.key);

  let contextMenuDiv: HTMLDivElement | null = null;

  const buildMenu = (parentDiv: HTMLElement, items: Array<ContextMenuItem>) => {
    
  };

  return new Plugin({
    key: contextMenuPluginKey,
    view: (view) => {
      if (!enabled) {
        return {};
      }

      // 创建菜单DOM元素
      contextMenuDiv = document.createElement('div');
      contextMenuDiv.className = 'milkdown-contextmenu';
      contextMenuDiv.style.display = 'none';
      contextMenuDiv.oncontextmenu = (e) => {e.preventDefault(); return false;};
      view.dom.parentElement?.appendChild(contextMenuDiv);

      document.addEventListener('mousedown', (e) => {
        // 如果点击的不是菜单本身或菜单的子元素，则隐藏菜单
        if (contextMenuDiv && !contextMenuDiv.contains(e.target as Node)) {
          contextMenuDiv.style.display = 'none';
          contextMenuDiv.innerHTML = '';
        }
      });

      return {
        destroy: () => {
          if (contextMenuDiv) {
            contextMenuDiv.parentElement?.removeChild(contextMenuDiv);
            contextMenuDiv = null;
          }
        }
      }
    },
    props: {
      handleDOMEvents: {
        contextmenu: (_view, e) => {
          if (!enabled) {
            return false;
          }
          e.preventDefault();
          return true;
        },
        mouseup: (_view, e) => {
          if (!enabled || contextMenuDiv == null || e.button !== 2) {
            return false;
          }

          e.preventDefault();
          
          contextMenuDiv.innerHTML = '';
          const cmenuParent = contextMenuDiv.parentElement;
          if (!cmenuParent) {
            return false;
          }

          const menuItems = Array.isArray(menus) ? menus : (typeof menus === 'function' ? menus(ctx, e) : []);
          // 整理下菜单项, 比如: 合并分割线等
          let newItems: Array<ContextMenuItem> = [];
          menuItems.forEach((item) => {
            if (item) {
              const isDivider = item.divider;
              if (isDivider) {
                if (newItems.length > 0 && !newItems[newItems.length-1]?.divider) {
                  newItems.push({ divider: true });
                }
              } else {
                newItems.push(item);
              }
            }
          });
          // 移除最后一个分割线
          if (newItems.length > 0 && newItems[newItems.length-1]?.divider) {
            newItems.pop();
          }

          if (newItems.length > 0) {
            let menuDiv = document.createElement('div');
            menuDiv.className = 'milkdown-dropdown-menu';
            newItems.forEach((item) => {
              let itemDiv = document.createElement('div');
              if (item.divider) {
                itemDiv.className = 'milkdown-dropdown-menu-divider';
              } else {
                itemDiv.classList.add('milkdown-dropdown-menu-item');
                if (item.chidren) {
                  itemDiv.classList.add('milkdown-dropdown-submenu');
                }
                if (item.disabled) {
                  itemDiv.classList.add('disabled');
                  itemDiv.setAttribute('disabled', 'true');
                }
                itemDiv.innerHTML = `
                  ${item.icon ? `<span class="milkdown-dropdown-menu-icon">${item.icon}</span>` : ''}
                  <span class="milkdown-dropdown-menu-text">${item.label}</span>
                  ${ item.chidren ? `<span class="milkdown-dropdown-submenu-icon"><svg viewBox="0 0 24 24" fill="none" height="1em" width="1em" xmlns="http://www.w3.org/2000/svg"><path d="M7.707 21.707a1 1 0 0 1 0-1.414L16 12 7.707 3.707a1 1 0 0 1 1.414-1.414l8.293 8.293a2 2 0 0 1 0 2.828l-8.293 8.293a1 1 0 0 1-1.414 0" fill="currentColor"></path></svg></span>` : '' }
                `;
                
                (!item.disabled && !item.chidren) && itemDiv.addEventListener('click', (e) => {
                  if (item.disabled) {
                    return;
                  }
                  click && click(item, ctx, e);
                  contextMenuDiv!.style.display = 'none';
                });
              }

              menuDiv.appendChild(itemDiv);
            });

            contextMenuDiv.appendChild(menuDiv);
          }

          const { left, top } = cmenuParent.getBoundingClientRect();
          contextMenuDiv.style.left = `${e.clientX - left}px`;
          contextMenuDiv.style.top  = `${e.clientY - top}px`;
          contextMenuDiv.style.display = 'block';
          
          return true;
        }
      }
    }
  });

});

innerContextMenuPlugin.meta = {
  package: '@milkdown/plugin-contextmenu',
  displayName: 'Prose<contextMenuPlugin>'
};

export const contextMenuPlugin: MilkdownPlugin[] = [innerContextMenuPlugin, contextMenuConfig].flat()