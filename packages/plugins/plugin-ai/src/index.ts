import { Plugin, PluginKey } from "@milkdown/kit/prose/state";
import type { EditorState } from "@milkdown/kit/prose/state";
import type { MilkdownPlugin } from '@milkdown/kit/ctx'
import { Ctx } from "@milkdown/kit/ctx";
import { editorViewCtx, parserCtx, serializerCtx } from "@milkdown/kit/core";
import { $prose } from "@milkdown/kit/utils";
import { DOMParser, DOMSerializer } from "@milkdown/kit/prose/model";
import { Decoration, DecorationSet } from "@milkdown/kit/prose/view";
import { cloneTr } from "@milkdown/kit/prose";
import OpenAI from "openai";

import { CopilotElement } from "./component";

export * from "./config";

const copilotKey = new PluginKey("MilkdownAICopilot");


const client = new OpenAI({
  apiKey: 'ollama', // required but unused
  baseURL: 'http://10.0.9.165:11434/v1/',
  dangerouslyAllowBrowser: true
});

async function fetchAIHint(ctx: Ctx, userPrompt: string, systemPrompt: string) {
  const view = ctx.get(editorViewCtx);
  
  let accumulatedText = '';
  let lastUpdateTime = 0;
  const THROTTLE_INTERVAL = 100; // 100ms 的节流间隔

  // 创建一个节流更新函数
  const throttledUpdate = (text: string, immediate: boolean = false) => {
    const now = Date.now();
    if ((now - lastUpdateTime >= THROTTLE_INTERVAL) || immediate) {
      const tr = cloneTr(view.state.tr);
      view.dispatch(tr.setMeta(copilotKey, text));
      lastUpdateTime = now;
    }
  };

  try {
    const stream = await client.chat.completions.create({
      model: "deepseek-r1:7b",
      stream: true,
      messages: [
          {
            "role": "system",
            "content": systemPrompt ?? "你是一个写作专家，请根据用户输入的文本，进行润色和优化。"
          },
          {
            "role": "user",
            "content": userPrompt
          }
      ],
    });

    // 响应流式输出
    for await (const chunk of stream) {
      let content = chunk.choices[0]?.delta?.content || '';
      if (content) {
        /*
        // 处理 <think> 标签
        if (content.includes('<think>')) {
          content = content.replace('<think>', '> ');
          isInThinkBlock = true;
        }
        if (content.includes('</think>')) {
          content = content.replace('</think>', '\n\n');
          isInThinkBlock = false;
        }
        // 如果在思考块内，为每个新行添加 > 前缀
        if (isInThinkBlock && content.includes('\n')) {
          content = content.replace(/\n/g, '\n> ');
        }
        */

        accumulatedText += content;
        throttledUpdate(accumulatedText, false);
      }
    }

  } catch (error) {
    // 发生错误时显示错误信息
    console.error('AI响应出错:', error);
    const tr = cloneTr(view.state.tr);
    view.dispatch(tr.setMeta(copilotKey, '> ❌ AI响应出错，请稍后重试'));
    return;
  }

  // 确保最后一次更新一定会执行
  throttledUpdate(accumulatedText, true);

  //console.log('>>> 大模型最终提示:\n', accumulatedText);
}

export function getHint(ctx: Ctx, systemPrompt: string) {
  const view = ctx.get(editorViewCtx);
  const { state } = view;
  const tr = state.tr;
  const { from, to } = tr.selection;
  const slice = (from == to) ? tr.doc.slice(0, from) : tr.doc.slice(from, to);
  const sliceDoc = state.schema.topNodeType.create(null, slice.content);
  if (!sliceDoc) {
    return;
  }
  
  const serializer = ctx.get(serializerCtx);
  const theSliceMarkdownPrompt = serializer(sliceDoc);
  view.dispatch(tr.setMeta(copilotKey, "> AI思考中..."));
  fetchAIHint(ctx, theSliceMarkdownPrompt, systemPrompt);
}

function applyHint(ctx: Ctx, insert: boolean) {
  const view = ctx.get(editorViewCtx);
  const { state } = view;
  const { message } = copilotKey.getState(state);
  if (typeof message !== "string" || message.length === 0) {
    return;
  }

  // 去除message中的思考内容：<think>...</think>
  let cleanedMessage = message.replace(/<think>([\s\S]*?)<\/think>/g, '');

  const tr = state.tr;
  const parser = ctx.get(parserCtx);
  const node = parser(cleanedMessage);
  const slice = node.slice(0);

  if (insert) {
    // 在选区结束位置插入内容
    view.dispatch(tr.setMeta(copilotKey, "").insert(tr.selection.to, slice.content));
    /*if (cleanedMessage.charAt(0) === '\n') {
      cleanedMessage = cleanedMessage.slice(1);
    }
    if (cleanedMessage.charAt(cleanedMessage.length - 1) === '\n') {
      cleanedMessage = cleanedMessage.slice(0, -1);
    }
    view.dispatch(tr.setMeta(copilotKey, "").insertText(cleanedMessage, tr.selection.to));
    */
  } else {
    // 替换选中内容
    view.dispatch(tr.setMeta(copilotKey, "").replaceSelection(slice));
  }
}

function hideHint(ctx: Ctx) {
  const view = ctx.get(editorViewCtx);
  const { state } = view;
  const tr = state.tr;
  view.dispatch(tr.setMeta(copilotKey, ""));
}

export const copilotPlugin = $prose((ctx) => {
  // 缓存 DOM 元素、widget 和解析器
  let cachedDom: HTMLElement | null = null;
  let cachedWidget: Decoration | null = null;
  let cachedPosition: number = -1;
  let cachedParser: any | null = null;
  let cachedSerializer: DOMSerializer | null = null;
  
  function getOrCreateWidget(to: number, message: string, state: EditorState) {
    // 创建或复用
    if (cachedPosition !== to || !cachedWidget || !cachedDom) {
      const copilotDiv = document.createElement("div");
      copilotDiv.className = "milkdown-copilot-decoration";
      copilotDiv.innerHTML = `
        <milkdown-copilot></milkdown-copilot>
        <div class="milkdown-copilot-content"></div>
        <div class="milkdown-copilot-actions">
          <div class="actions-left">
            <button class="copilot-btn-accept">
              <span class="copilot-btn-icon"><svg width="1em" height="1em" viewBox="0 0 1024 1024"><path d="M233.8912 508.3456l0.0128 0.0128 165.296 166.256L790.0928 281.4528l0.016-0.016A31.9904 31.9904 0 0 1 812.7072 272H812.8a32.0064 32.0064 0 0 1 32 31.9072V304a32 32 0 0 1-9.3088 22.56l-0.0128 0.016-413.584 415.9872-0.1312 0.128c-12.5344 12.4608-32.7968 12.4032-45.2544-0.128l-187.9904-189.0816-0.0096-0.0096A32 32 0 0 1 179.2 530.9088V530.816a32 32 0 0 1 54.6912-22.4704z"></path></svg></span>
              接受
            </button>
            <button class="copilot-btn-discard">
              <span class="copilot-btn-icon"><svg width="1em" height="1em" viewBox="0 0 1024 1024"><path d="M722.944 768.2048L255.8272 301.0304A32 32 0 0 1 301.0816 255.776l467.1168 467.1744a32 32 0 1 1-45.2544 45.2544z"></path><path d="M255.7984 768.2048c-12.496-12.4992-12.4992-32.7584 0-45.2544L722.944 255.8048c12.496-12.4992 32.7584-12.4992 45.2544 0 12.496 12.496 12.496 32.7552 0 45.2544L301.0528 768.2048c-12.496 12.496-32.7584 12.496-45.2544 0z"></path></svg></span>
              弃用
            </button>
            <button class="copilot-btn-insert">
              <span class="copilot-btn-icon"><svg width="1em" height="1em" viewBox="0 0 1024 1024"><path d="M800 185.6H227.2c-17.6736 0-32 14.3264-32 32s14.3264 32 32 32h572.8c17.6736 0 32-14.3264 32-32s-14.3264-32-32-32z m0 256H227.2c-17.6736 0-32 14.3264-32 32s14.3264 32 32 32h572.8c17.6736 0 32-14.3264 32-32s-14.3264-32-32-32z m-95.9968 160c-17.6736 0-32 14.3264-32 32v64H608c-17.6736 0-32 14.3264-32 32s14.3264 32 32 32h64.0032v64c0 17.6736 14.3264 32 32 32s32-14.3264 32-32v-64H800c17.6736 0 32-14.3264 32-32s-14.3264-32-32-32h-63.9968v-64c0-17.6736-14.3264-32-32-32zM480 697.6H224c-17.6736 0-32 14.3264-32 32s14.3264 32 32 32h256c17.6736 0 32-14.3264 32-32s-14.3264-32-32-32z"></path></svg></span>
              在原文后插入
            </button>
          </div>
          <div class="actions-right">
            <button class="copilot-btn-rehint">
              <span class="copilot-btn-icon"><svg xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 16 16" width="1em" height="1em"><path d="M11.432 11.636a5 5 0 0 1-8.428-3.445L4.2 9.39l.778-.778-2-2a.55.55 0 0 0-.778 0l-2 2 .778.778L2.01 8.358a6 6 0 0 0 10.107 4.007zM4.568 4.364a5 5 0 0 1 8.428 3.445L11.8 6.61l-.778.778 2 2a.55.55 0 0 0 .778 0l2-2-.778-.778-1.031 1.032A6 6 0 0 0 3.882 3.636z"/></svg></span>
              重新生成
            </button>
          </div>
        </div>
      `;

      cachedDom = copilotDiv.querySelector(".milkdown-copilot-content");
      copilotDiv.querySelector(".copilot-btn-accept")?.addEventListener("click", () => {
        applyHint(ctx, false);
      });
      copilotDiv.querySelector(".copilot-btn-discard")?.addEventListener("click", () => {
        hideHint(ctx);
      });
      copilotDiv.querySelector(".copilot-btn-insert")?.addEventListener("click", () => {
        applyHint(ctx, true);
      });
      copilotDiv.querySelector(".copilot-btn-rehint")?.addEventListener("click", () => {
        getHint(ctx, "");
      });

      cachedWidget = Decoration.widget(to + 1, () => copilotDiv!);
      cachedPosition = to;
    }
    
    // 初始化解析器缓存
    if (!cachedParser) {
      cachedParser = ctx.get(parserCtx);
    }
    if (!cachedSerializer) {
      cachedSerializer = DOMSerializer.fromSchema(state.schema);
    }
    
    // 更新 DOM 内容
    cachedDom!.innerHTML = '';
    let replacedMessage = message;
    // 将 <think>...</think> 转换为 > ...
    if (message.includes('<think>')) {
      if (message.includes('</think>')) {
        replacedMessage = message.replace(/<think>([\s\S]*?)<\/think>/g, (_, content) => {
          return content.split('\n').map((line: string) => `> ${line}`).join('\n');
        });
      } else {
        replacedMessage = replacedMessage.replace('<think>', '');
        replacedMessage = replacedMessage.split('\n').map((line: string) => `> ${line}`).join('\n');
      }
      replacedMessage = '思考中...\n' + replacedMessage;
    }

    const slice = cachedParser(replacedMessage);
    const dom = cachedSerializer.serializeFragment(slice.content);
    cachedDom!.appendChild(dom);
    cachedDom!.scrollTop = cachedDom!.scrollHeight;
    
    return cachedWidget;
  }

  return new Plugin({
    key: copilotKey,
    props: {
      // 监听文档上的键盘事件
      handleKeyDown(_view, event) {
        /*if (event.key === "Enter") {
          event.preventDefault();
          applyHint(ctx);
          return;
        }*/
        
        /*if (event.key === "/" && event.ctrlKey) {
          event.preventDefault();
          event.stopPropagation();
          getHint(ctx, "");
          return;
        }*/
      },
      decorations(state) {
        return copilotKey.getState(state).deco;
      },
    },
    state: {
      init() {
        return {
          deco: DecorationSet.empty,
          message: "",
          widget: null as (Decoration | null),
        };
      },
      apply(tr, value, _oldState, state) {
        const message = tr.getMeta(copilotKey);
        if (typeof message !== "string") {
          /*if (value.widget && tr.docChanged) {
            return {
              ...value,
              deco: value.deco.map(tr.mapping, tr.doc),
            };
          }*/
          return value;
        }

        // 清除提示时重置所有缓存
        if (message.length === 0) {
          cachedDom = null;
          cachedWidget = null;
          cachedPosition = -1;
          cachedParser = null;
          cachedSerializer = null;
          return {
            deco: DecorationSet.empty,
            message: "",
            widget: null,
          };
        }

        const { to } = tr.selection;

        const widget = getOrCreateWidget(to, message, state);

        return {
          deco: DecorationSet.create(state.doc, widget ? [widget] : []),
          message: message,
          widget: widget,
        };
      },
    },
  });
});
