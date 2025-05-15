import { Plugin, PluginKey } from "@milkdown/kit/prose/state"
import type { EditorState } from "@milkdown/kit/prose/state";
import { Ctx } from "@milkdown/kit/ctx"
import type { MilkdownPlugin } from '@milkdown/kit/ctx'
import { editorViewCtx, parserCtx, serializerCtx } from "@milkdown/kit/core"
import { $prose } from "@milkdown/kit/utils"
import { DOMSerializer } from "@milkdown/kit/prose/model"
import { Decoration, DecorationSet } from "@milkdown/kit/prose/view"
//import { cloneTr } from "@milkdown/kit/prose"
//import { Icon } from '@milkdown/kit/component'
//import { computePosition, flip, shift } from '@floating-ui/dom'

import OpenAI from "openai"

import { aiConfig, AIPromptsKey } from "./config"

const copilotKey = new PluginKey("MilkdownAICopilot");

interface AiMessage {
  prompt?: string
  selection?: string
  content?: string
  writing?: boolean
  finished?: boolean
  loading?: boolean
  hide?: boolean
  error?: boolean
}

async function fetchAIHint(ctx: Ctx, prompt: string) {
  const view = ctx.get(editorViewCtx);
  const aiConfigs = ctx.get(aiConfig.key);
  if (!aiConfigs.enabled || !aiConfigs.baseUrl) {
    return;
  }

  const { state } = view;
  const tr = state.tr;
  // 显示AI思考中的提示信息
  view.dispatch(tr.setMeta(copilotKey, {loading: true}));

  let lastUpdateTime = 0;
  const THROTTLE_INTERVAL = 200; // 节流间隔
  // 创建一个节流更新函数
  const throttledUpdate = (msg: AiMessage, immediate: boolean = false) => {
    const now = Date.now();
    if ((now - lastUpdateTime >= THROTTLE_INTERVAL) || immediate) {
      //const tr = cloneTr(view.state.tr);
      view.dispatch(tr.setMeta(copilotKey, msg));
      lastUpdateTime = now;
    }
  };

  let openAIClient = new OpenAI({
    apiKey: aiConfigs.apiKey,
    baseURL: aiConfigs.baseUrl,
    dangerouslyAllowBrowser: true
  });

  const payload: any = {
    model: aiConfigs.model,
    messages: [{ role: "user", content: prompt }],
    stream: true
  };

  if (aiConfigs.temperature && aiConfigs.temperature > 0) {
    payload["temperature"] = aiConfigs.temperature;
  }
  if (aiConfigs.maxTokens && aiConfigs.maxTokens > 0) {
    payload["max_tokens"] = aiConfigs.maxTokens;
  }
  if (aiConfigs.topP && aiConfigs.topP > 0) {
    payload["top_p"] = aiConfigs.topP;
  }

  let accumulatedText = '';
  let hasReasoningContent = false;
  try {
    const newStream = await openAIClient.chat.completions.create(payload);

    // 响应流式输出
    for await (const chunk of newStream) {
      const delta = chunk.choices[0]?.delta;
      if (delta?.reasoning_content || delta?.reasoning) {
        hasReasoningContent = true;
      }

      let content = delta?.content || '';
      if (content) {
        accumulatedText += content;
        throttledUpdate({ 
          content: accumulatedText, 
          writing: true,
          finished: false
        }, false);
      }
    }

  } catch (error) {
    console.error(">> Error: AI chat completion error:", error);
    // 发生错误时显示错误信息
    //const tr = cloneTr(view.state.tr);
    view.dispatch(tr.setMeta(copilotKey, { 
      content: '❌ AI响应异常，请稍后重试', 
      error: true
    }));

    return;
  }

  // 确保最后一次更新一定会执行
  throttledUpdate({ 
    content: accumulatedText,
    writing: true,
    finished: true
  }, true);
}

// 显示AI交互框
export function showAIHint(ctx: Ctx) {
  const aiConfigs = ctx.get(aiConfig.key);
  if (!aiConfigs.enabled || !aiConfigs.baseUrl) {
    console.warn(">> Warning: Not enable AI-plugin or not config `baseUrl`.");
    return;
  }

  const view = ctx.get(editorViewCtx);
  const { state } = view;
  const tr = state.tr;
  const { from, to } = tr.selection;
  const slice = (from === to) ? tr.doc.slice(0, from) : tr.doc.slice(from, to);
  const doc = state.schema.topNodeType.create(null, slice.content);
  if (!doc) {
    view.dispatch(tr.setMeta(copilotKey, {
      selection: '',
      content: ''
    }));
    return;
  }

  const serializer = ctx.get(serializerCtx);
  const selectionText = serializer(doc);
  
  view.dispatch(tr.setMeta(copilotKey, {
    selection: selectionText,
    content: ''
  }));

}

function applyHint(ctx: Ctx, insert: boolean = false) {
  const view = ctx.get(editorViewCtx);
  const { state } = view;
  const { message } = copilotKey.getState(state);
  if (!message) {
    return;
  }

  const content = message.content;
  // 去除内容中的思考内容：<think>...</think>
  let cleanedContent = content.replace(/<think>([\s\S]*?)<\/think>/g, '');

  const tr = state.tr;
  const parser = ctx.get(parserCtx);
  const node = parser(cleanedContent);
  const slice = node.slice(0);

  if (insert) {
    // 在选区结束位置插入内容
    view.dispatch(tr.setMeta(copilotKey, {hide: true}).insert(tr.selection.to, slice.content));
  } else {
    // 替换选中内容
    view.dispatch(tr.setMeta(copilotKey, {hide: true}).replaceSelection(slice));
  }
}

function hideHint(ctx: Ctx) {
  const view = ctx.get(editorViewCtx);
  const { state } = view;
  const tr = state.tr;
  view.dispatch(tr.setMeta(copilotKey, {hide: true}));
}

const copilotPlugin = $prose((ctx: Ctx) => {
  const aiConfigs = ctx.get(aiConfig.key);

  // 缓存 DOM 元素、widget 和解析器
  let cachedDomRefs: any = null;
  let cachedWidget: Decoration | null = null;
  let cachedPosition: number = -1;
  let cachedParser: any | null = null;
  let cachedSerializer: DOMSerializer | null = null;

  function getOrCreateWidget(to: number, message: AiMessage, state: EditorState) {
    // 创建或复用
    if (cachedPosition !== to || !cachedWidget || !cachedDomRefs) {
      const aiIcon = '<svg width="1em" height="1em" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><path fill="#FF8F11" fill-rule="evenodd" d="M12 5.684a.524.524 0 0 1-.499-.36l-.278-.831a1.05 1.05 0 0 0-.665-.664l-.83-.277a.526.526 0 0 1 0-.999l.83-.277c.314-.105.561-.352.665-.665l.278-.832a.527.527 0 0 1 .999 0l.277.832c.105.313.352.56.665.665l.831.277a.526.526 0 0 1 0 .999l-.831.277c-.313.104-.56.351-.665.664l-.277.831a.527.527 0 0 1-.5.36zm-5.789 7.369a.7.7 0 0 1-.681-.532l-.243-.968a2.458 2.458 0 0 0-1.785-1.787l-.968-.243a.701.701 0 0 1 0-1.361l.968-.241a2.461 2.461 0 0 0 1.786-1.787l.243-.969a.702.702 0 0 1 1.361 0l.241.969a2.46 2.46 0 0 0 1.786 1.787l.969.241a.702.702 0 0 1 0 1.362l-.969.242a2.453 2.453 0 0 0-1.786 1.786l-.242.969a.703.703 0 0 1-.68.532zm7.895 10.527a.79.79 0 0 1-.758-.573l-.856-2.996a3.951 3.951 0 0 0-2.711-2.712l-2.997-.855a.79.79 0 0 1 0-1.518l2.997-.856a3.949 3.949 0 0 0 2.709-2.711l.858-2.997a.789.789 0 0 1 1.518 0l.855 2.997a3.952 3.952 0 0 0 2.711 2.711l2.996.856a.79.79 0 0 1 0 1.518l-2.996.855a3.95 3.95 0 0 0-2.711 2.712l-.855 2.996a.79.79 0 0 1-.76.573z" clip-rule="evenodd"/></svg>';
      let copilotDiv = document.createElement("div");
      copilotDiv.tabIndex = -1;
      copilotDiv.className = "milkdown-copilot-decoration";
      copilotDiv.innerHTML = `<div class="milkdown-copilot-bdy">
        <div class="milkdown-copilot-content hide" tabindex="-1" data-ref="content"></div>
        <div class="milkdown-copilot-actions hide" data-ref="loading_actions">
          <div class="actions-left">
            <div class="ai-loading-tip">
              <span class="ai-loading-icon">${aiIcon}</span>
              <span class="ai-loading-text">AI思考中...</span>
            </div>
          </div>
        </div>
        <div class="milkdown-copilot-actions hide" data-ref="unfinish_actions">
          <div class="actions-left">
            <div class="ai-loading-tip">
              <span class="ai-loading-icon">${aiIcon}</span>
              <span class="ai-loading-text">AI正在输出...</span>
            </div>
          </div>
          <div class="actions-right">
            <button class="copilot-btn-stop hide" data-ref="btn_stop">
              <span class="copilot-btn-icon"><svg width="1em" height="1em" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg" fill="currentColor"><path d="M512 968a456 456 0 1 1 395.76-229.36 32 32 0 0 1-55.52-32A392 392 0 1 0 706.8 852.08a32 32 0 0 1 32 55.52A456 456 0 0 1 512 968z"/><path d="M576 672H448a96 96 0 0 1-96-96V448a96 96 0 0 1 96-96h128a96 96 0 0 1 96 96v128a96 96 0 0 1-96 96zM448 416a32 32 0 0 0-32 32v128a32 32 0 0 0 32 32h128a32 32 0 0 0 32-32V448a32 32 0 0 0-32-32H448z"/></svg></span>
              <span class="copilot-btn-text">停止输出</span>
            </button>
          </div>
        </div>
        <div class="milkdown-copilot-actions hide" data-ref="finished_actions">
          <div class="actions-left">
            <button class="copilot-btn-accept" data-ref="btn_accept">
              <span class="copilot-btn-icon"><svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 1024 1024"><path d="M210.715 508.042l.013.014L389.8 688.166l423.468-425.925.016-.018A34.665 34.665 0 0 1 837.766 252h.101c19.105.004 34.607 15.46 34.666 34.567v.099a34.665 34.665 0 0 1-10.083 24.44l-.015.018-448.05 450.654-.142.138c-13.578 13.499-35.53 13.437-49.026-.138L161.562 556.939l-.011-.011a34.66 34.66 0 0 1-10.085-24.443v-.101c.078-26.687 29.015-43.281 52.088-29.871a34.655 34.655 0 0 1 7.161 5.529z"/></svg></span>
              接受
            </button>
            <button class="copilot-btn-discard" data-ref="btn_discard">
              <span class="copilot-btn-icon"><svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 1024 1024"><path d="M742.237 791.657L232.129 281.54c-18.939-19.102-10.093-51.541 15.921-58.388a34.944 34.944 0 0 1 33.498 8.975l510.109 510.115c19.105 18.936 10.544 51.45-15.409 58.527a34.954 34.954 0 0 1-34.011-9.112z"/><path d="M232.236 791.767c-13.646-13.649-13.649-35.772 0-49.417l510.113-510.114c13.646-13.649 35.772-13.649 49.417 0 13.646 13.645 13.646 35.768 0 49.417L281.652 791.767c-13.645 13.645-35.771 13.645-49.416 0z"/></svg></span>
              弃用
            </button>
            <button class="copilot-btn-insert" data-ref="btn_insert">
              <span class="copilot-btn-icon"><svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 1024 1024"><path d="M846.287 122H181.429c-20.514 0-37.142 16.629-37.142 37.143s16.628 37.142 37.142 37.142h664.858c20.514 0 37.142-16.628 37.142-37.142 0-20.514-16.628-37.143-37.142-37.143zm0 297.143H181.429c-20.514 0-37.142 16.629-37.142 37.143s16.628 37.142 37.142 37.142h664.858c20.514 0 37.142-16.628 37.142-37.142 0-20.514-16.628-37.143-37.142-37.143zM734.862 604.857c-20.514 0-37.144 16.629-37.144 37.143v74.286h-74.289c-20.514 0-37.143 16.629-37.143 37.143s16.629 37.142 37.143 37.142h74.289v74.286c0 20.514 16.63 37.143 37.144 37.143s37.142-16.629 37.142-37.143v-74.286h74.283c20.514 0 37.142-16.628 37.142-37.142 0-20.514-16.628-37.143-37.142-37.143h-74.283V642c0-20.514-16.628-37.143-37.142-37.143zM474.858 716.286H177.715c-20.514 0-37.143 16.629-37.143 37.143s16.629 37.142 37.143 37.142h297.143c20.514 0 37.142-16.628 37.142-37.142 0-20.514-16.628-37.143-37.142-37.143z"/></svg></span>
              在原文后插入
            </button>
          </div>
          <div class="actions-right">
            <button class="copilot-btn-rehint hide" data-ref="btn_rehint">
              <span class="copilot-btn-icon"><svg xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 16 16" width="1em" height="1em"><path d="M11.432 11.636a5 5 0 0 1-8.428-3.445L4.2 9.39l.778-.778-2-2a.55.55 0 0 0-.778 0l-2 2 .778.778L2.01 8.358a6 6 0 0 0 10.107 4.007zM4.568 4.364a5 5 0 0 1 8.428 3.445L11.8 6.61l-.778.778 2 2a.55.55 0 0 0 .778 0l2-2-.778-.778-1.031 1.032A6 6 0 0 0 3.882 3.636z"/></svg></span>
              重新生成
            </button>
          </div>
        </div>
        <div class="milkdown-copilot-input-portal hide" data-ref="input_portal">
          <div class="milkdown-copilot-input" data-ref="input_box">
            <div class="copilot-input-icon">${aiIcon}</div>
            <div class="copilot-input-wrapper"><textarea rows="1" cols="20" placeholder="想让我做什么呢?" data-ref="promptInput"></textarea></div>
            <div class="copilot-input-actions"><button class="copilot-input-send-btn" data-ref="sendPrompt"><svg width="1em" height="1em" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg" fill="currentColor" overflow="hidden"><path d="M960.445 109.498L660.991 945.479a24.95 24.95 0 0 1-23.457 16.47h-7.986a25.45 25.45 0 0 1-22.959-14.47L488.803 697.932c-17.344-36.791-10.631-80.425 16.97-110.301l149.728-163.703c9.19-9.64 9.19-24.798 0-34.438l-18.966-18.966c-9.641-9.189-24.798-9.189-34.438 0l-163.703 149.73c-29.875 27.601-73.509 34.313-110.3 16.969L78.547 419.436a25.452 25.452 0 0 1-16.47-22.958v-7.986a24.951 24.951 0 0 1 16.47-25.453L914.532 63.581a24.953 24.953 0 0 1 25.953 5.49l12.98 12.977a24.939 24.939 0 0 1 6.98 27.45z"/></svg></button></div>
          </div>
          <div class="milkdown-copilot-dropdown" data-ref="dropdown">
            <div class="dropdown-menu-item" data-action="article:polishing">
              <div class="menu-icon"><svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" fill="none" viewBox="0 0 24 24"><path fill="currentColor" fill-rule="evenodd" d="M4.19 7.7q.037.3.31.3a.28.28 0 0 0 .21-.082.35.35 0 0 0 .1-.2q.117-.91.245-1.42.127-.51.39-.765.273-.264.8-.4a21 21 0 0 1 1.482-.328Q8 4.75 8 4.495a.28.28 0 0 0-.082-.209.27.27 0 0 0-.19-.09 18 18 0 0 1-1.483-.265q-.536-.127-.809-.391-.263-.274-.39-.801a17 17 0 0 1-.237-1.448Q4.773 1 4.5 1t-.31.3q-.108.91-.235 1.42-.128.501-.4.756-.273.255-.81.4-.536.137-1.472.32Q1 4.24 1 4.495q0 .263.31.309.926.154 1.454.291.536.137.8.4.272.256.39.774.128.52.237 1.43m-.91 9.085q.025.215.22.215.09 0 .15-.058a.25.25 0 0 0 .07-.144q.085-.65.176-1.014.09-.365.28-.546.195-.189.57-.286.384-.104 1.06-.234.195-.04.194-.221 0-.09-.058-.15a.2.2 0 0 0-.137-.065q-.675-.098-1.058-.188-.383-.091-.578-.28-.189-.195-.28-.572a12 12 0 0 1-.168-1.034Q3.695 12 3.5 12t-.22.215a9 9 0 0 1-.17 1.014q-.09.357-.285.54-.195.18-.578.286-.384.097-1.052.227-.195.032-.195.215 0 .19.22.22.663.111 1.04.209.383.097.571.286.195.182.28.553.09.37.168 1.02M14.5 6q-.195 0-.22-.215a9 9 0 0 0-.17-1.02q-.084-.371-.279-.553-.188-.189-.571-.286a13 13 0 0 0-1.04-.208Q12 3.685 12 3.497q0-.183.195-.215.668-.13 1.052-.227.383-.105.578-.286.195-.183.285-.54.091-.365.17-1.014Q14.304 1 14.5 1q.196 0 .22.208.085.657.17 1.034.09.377.279.572.194.189.578.28.383.09 1.058.188a.2.2 0 0 1 .137.065.2.2 0 0 1 .058.15q0 .182-.195.22-.675.132-1.058.235-.377.097-.572.286-.187.181-.279.546-.09.365-.175 1.014a.25.25 0 0 1-.072.143A.2.2 0 0 1 14.5 6m5.465 12.58-5.738-5.736-1.383 1.383 5.737 5.738a.979.979 0 0 0 1.384-1.384m1.414-1.413-5.737-5.737-3.325-3.325a2.978 2.978 0 0 0-4.212 4.212l3.325 3.325 5.737 5.737a2.978 2.978 0 0 0 4.212-4.212" clip-rule="evenodd"></path></svg></div>
              <div class="menu-text">润色</div>
            </div>
            <div class="dropdown-menu-item" data-action="article:expansion">
              <div class="menu-icon"><svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" fill="none" viewBox="0 0 24 24"><path fill="currentColor" d="M2 3c0-.552.497-1 1.111-1H20.89C21.503 2 22 2.448 22 3s-.497 1-1.111 1H3.11C2.497 4 2 3.552 2 3M2 9c0-.552.497-1 1.111-1H20.89C21.503 8 22 8.448 22 9s-.497 1-1.111 1H3.11C2.497 10 2 9.552 2 9M2 15c0-.552.497-1 1.111-1H20.89c.614 0 1.111.448 1.111 1s-.497 1-1.111 1H3.11C2.497 16 2 15.552 2 15M2 21c0-.552.497-1 1.111-1H13c.614 0 1.111.448 1.111 1s-.497 1-1.111 1H3.111C2.497 22 2 21.552 2 21"></path></svg></div>
              <div class="menu-text">扩写</div>
            </div>
            <div class="dropdown-menu-item hide" data-action="article:simplify">
              <div class="menu-icon"><svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" fill="none" viewBox="0 0 24 24"><path fill="currentColor" fill-rule="evenodd" d="M2 9a1 1 0 0 1 1-1h18a1 1 0 1 1 0 2H3a1 1 0 0 1-1-1m1 5a1 1 0 1 0 0 2h12a1 1 0 1 0 0-2z" clip-rule="evenodd"></path></svg></div>
              <div class="menu-text">缩写</div>
            </div>
            <div class="dropdown-menu-item" data-action="article:summarize">
              <div class="menu-icon"><svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" fill="none" viewBox="0 0 24 24"><path fill="currentColor" fill-rule="evenodd" d="M2 9a1 1 0 0 1 1-1h18a1 1 0 1 1 0 2H3a1 1 0 0 1-1-1m1 5a1 1 0 1 0 0 2h12a1 1 0 1 0 0-2z" clip-rule="evenodd"></path></svg></div>
              <div class="menu-text">总结</div>
            </div>
            <div class="dropdown-menu-item submenu">
              <div class="menu-icon"><svg width="1em" height="1em" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg" fill="currentColor" overflow="hidden"><path d="M379.392 460.8L494.08 575.488l-42.496 102.4L307.2 532.48 138.24 701.44l-71.68-72.704L234.496 460.8l-45.056-45.056c-27.136-27.136-51.2-66.56-66.56-108.544h112.64c7.68 14.336 16.896 27.136 26.112 35.84l45.568 46.08 45.056-45.056C382.976 312.32 409.6 247.808 409.6 204.8H0V102.4h256V0h102.4v102.4h256v102.4H512c0 70.144-37.888 161.28-87.04 210.944L378.88 460.8zM576 870.4L512 1024H409.6l256-614.4H768l256 614.4H921.6l-64-153.6H576zM618.496 768h196.608L716.8 532.48 618.496 768z"/></svg></div>
              <div class="menu-text">翻译</div>
              <div class="submenu-icon"><svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" fill="none" viewBox="0 0 24 24"><path fill="currentColor" d="M7.707 21.707a1 1 0 0 1 0-1.414L16 12 7.707 3.707a1 1 0 0 1 1.414-1.414l8.293 8.293a2 2 0 0 1 0 2.828l-8.293 8.293a1 1 0 0 1-1.414 0"></path></svg></div>
              <div class="milkdown-copilot-dropdown">
                <div class="dropdown-menu-item" data-action="translation:english">
                  <div class="menu-icon">🇬🇧</div>
                  <div class="menu-text">英文</div>
                </div>
                <div class="dropdown-menu-item" data-action="translation:chinese">
                  <div class="menu-icon">🇨🇳</div>
                  <div class="menu-text">简体中文</div>
                </div>
                <div class="dropdown-menu-item" data-action="translation:japanese">
                  <div class="menu-icon">🇯🇵</div>
                  <div class="menu-text">日文</div>
                </div>
                <div class="dropdown-menu-item" data-action="translation:korean">
                  <div class="menu-icon">🇰🇷</div>
                  <div class="menu-text">韩文</div>
                </div>
              </div>
            </div>
          </div>
        </div>
        </div>
      `;

      cachedDomRefs = {};
      const cdoms = copilotDiv.getElementsByTagName("*");
      for (let i = 0; i < cdoms.length; i++) {
        const ref = cdoms[i]?.getAttribute("data-ref");
        if (ref) {
          cachedDomRefs[ref] = cdoms[i];
        }
      }

      ['mousedown', 'pointerdown', 'keydown', 'keypress'].forEach((evtName) => {
        copilotDiv.addEventListener(evtName, (e) => {
          e.stopPropagation();
        }, false);
      });
      copilotDiv.addEventListener('keydown', (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          hideHint(ctx);
        }
      }, false);

      copilotDiv.addEventListener('mousedown', (e: MouseEvent) => {
        if (!cachedDomRefs['dropdown'].contains(e.target)) {
          cachedDomRefs['dropdown'].classList.add('hide');
        }
      }, false);

      cachedDomRefs['btn_accept']?.addEventListener("click", () => {
        applyHint(ctx, false);
      });
      cachedDomRefs['btn_discard']?.addEventListener("click", () => {
        hideHint(ctx);
      });
      cachedDomRefs['btn_insert']?.addEventListener("click", () => {
        applyHint(ctx, true);
      });
      cachedDomRefs['btn_rehint']?.addEventListener("click", () => {
        //showAIHint(ctx);
      });

      const textarea = cachedDomRefs['promptInput'];
      ['mousedown', 'pointerdown', 'keydown', 'keypress', 'paste'].forEach((evtName) => {
        textarea.addEventListener(evtName, (e:any) => {
          e.stopPropagation();
        }, false);
      });
      textarea.addEventListener('input', () => {
        textarea.style.height = '1em';
        const sh = textarea.scrollHeight;
        textarea.style.height = Math.min(sh, 200) + 'px';
        textarea.style.overflowY = (sh > 200) ? 'auto' : 'hidden';

        const value = textarea.value.trim();
        if (value.length > 0) {
          cachedDomRefs['dropdown'].classList.add('hide');
        } else {
          cachedDomRefs['dropdown'].classList.remove('hide');
        }
      });
      textarea.addEventListener('keydown', (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          hideHint(ctx);
          return;
        }
        if (e.key === 'Enter' && e.ctrlKey) {
          let value = textarea.value.trim();
          cachedDomRefs['promptInput'].value = '';
          value && fetchAIHint(ctx, value);
        }
      }, false);
      textarea.addEventListener('focus', () => {
        if (textarea.value.trim().length == 0) {
          cachedDomRefs['dropdown'].classList.remove('hide');
        } else {
          cachedDomRefs['dropdown'].classList.add('hide');
        }
      }, false);

      cachedDomRefs['sendPrompt'].addEventListener('click', () => {
        let value = cachedDomRefs['promptInput'].value.trim();
        if (value.length == 0) {
          cachedDomRefs['promptInput'].focus();
          return;
        }
        cachedDomRefs['promptInput'].value = '';
        fetchAIHint(ctx, value);
      });

      const menuFunctions = {
        'article': function(type: string) {
          let prompt = '';
          switch(type) {
            case 'polishing':
              prompt = aiConfigs.prompts[AIPromptsKey.ArticlePolishing]??"";
              break;
            case 'expansion':
              prompt = aiConfigs.prompts[AIPromptsKey.ArticleExpansion]??"";
              break;
            case 'summarize':
              prompt = aiConfigs.prompts[AIPromptsKey.ArticleSummarize]??"";
              break;
          }
          prompt = prompt.replace("{{content}}", message.selection??"");
          prompt && fetchAIHint(ctx, prompt);
        },
        'translation': function(lang: string) {
          let prompt = aiConfigs.prompts[AIPromptsKey.Translation];
          prompt = prompt?.replace("{{lang}}", lang);
          prompt = prompt?.replace("{{content}}", message.selection??"");
          prompt && fetchAIHint(ctx, prompt);
        }
      };

      const menuItems = cachedDomRefs['dropdown'].querySelectorAll('div.dropdown-menu-item');
      for (let i = 0; i < menuItems.length; i++) {
        menuItems[i]?.addEventListener('click', (e: MouseEvent) => {
          const action = e.currentTarget?.getAttribute('data-action');
          if (action) {
            let parts = action.split(':');
            if (parts.length == 2) {
              let func = menuFunctions[parts[0]];
              func && func(parts[1]);
            }
          }
        });
      }
      
      
      cachedWidget = Decoration.widget(to + 1, () => copilotDiv);
      cachedPosition = to;
    }

    // 初始化解析器缓存
    if (!cachedParser) {
      cachedParser = ctx.get(parserCtx);
    }
    if (!cachedSerializer) {
      cachedSerializer = DOMSerializer.fromSchema(state.schema);
    }

    const loading = message.loading || false;
    const content = message.content || '';
    const writing = message.writing || false;
    const finished = message.finished || false;

    const toggle = (ele: any, show: boolean) => {
      if (show) {
        ele.classList.remove('hide');
      } else {
        ele.classList.add('hide');
      }
    };

    toggle(cachedDomRefs['loading_actions'], loading);
    toggle(cachedDomRefs['unfinish_actions'], (writing && !finished));
    toggle(cachedDomRefs['finished_actions'], finished);
    toggle(cachedDomRefs['input_portal'], !(loading || (writing && !finished)));
    toggle(cachedDomRefs['content'], writing);
    toggle(cachedDomRefs['dropdown'], !finished);
    
    if (writing || finished) {
      // 更新 DOM 内容
      cachedDomRefs['content'].innerHTML = '';
      if (content && content.length > 0) {
        let replacedContent = content;
        // 将 <think>...</think> 转换为 > ...
        if (content.includes('<think>')) {
          if (content.includes('</think>')) {
            replacedContent = content.replace(/<think>([\s\S]*?)<\/think>/g, (_, text) => {
              return text.split('\n').map((line: string) => `> ${line}`).join('\n');
            });
          } else {
            replacedContent = replacedContent.replace('<think>', '');
            replacedContent = replacedContent.split('\n').map((line: string) => `> ${line}`).join('\n');
          }
        }

        const slice = cachedParser(replacedContent);
        const dom = cachedSerializer.serializeFragment(slice.content);
        cachedDomRefs['content'].appendChild(dom);
        cachedDomRefs['content'].scrollTop = cachedDomRefs['content'].scrollHeight;
      }
    }

    return cachedWidget;
  }

  return new Plugin({
    key: copilotKey,
    props: {
      // 监听文档上的键盘事件
      handleKeyDown(_view, evt: KeyboardEvent) {
        if (evt.key === "/" && evt.ctrlKey) {
          evt.preventDefault();
          evt.stopPropagation();
          showAIHint(ctx);
          return;
        }

        if (evt.key == 'Escape') {
          hideHint(ctx);
          return;
        }

      },
      handleDOMEvents: {
        'mousedown': (_view, _evt) => {
          hideHint(ctx);
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
          message: null as (AiMessage | null),
          widget: null as (Decoration | null),
        };
      },
      apply(tr, value, _oldState, state) {
        const message = tr.getMeta(copilotKey);
        if (!message) {
          /*if (value.widget && tr.docChanged) {
            return {
              ...value,
              deco: value.deco.map(tr.mapping, tr.doc),
            };
          }*/
          return value;
        }

        // 清除提示时重置所有缓存
        if (message.hide) {
          cachedDomRefs = null;
          cachedWidget = null;
          cachedPosition = -1;
          cachedParser = null;
          cachedSerializer = null;

          return {
            deco: DecorationSet.empty,
            message: null,
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
      }
    }
  });
});

copilotPlugin.meta = {
    package: '@milkdown/plugin-ai',
    displayName: 'Prose<aiCopilot>',
}

export * from "./config"
export const aiPlugin: MilkdownPlugin[] = [copilotPlugin, aiConfig]
