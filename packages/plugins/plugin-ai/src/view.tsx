import type { Ctx } from '@milkdown/kit/ctx'
import { replaceAll} from '@milkdown/kit/utils'
import { Icon } from '@milkdown/kit/component'
import { Crepe } from '@milkdown/crepe'
import clsx from 'clsx'
import {
  computed,
  defineComponent,
  ref,
  h,
  Fragment,
  onMounted,
} from 'vue'
import DOMPurify from 'dompurify'

import OpenAI from "openai"

import { aiConfig, AIPromptsKey } from './config'

import {
  aiIcon,
  aiIcon2,
  acceptIcon,
  arrowRightIcon,
  chevronRight,
  discardIcon,
  insertIcon,
  refreshIcon,
  sendIcon,
  stopIcon,
  translationIcon,
  writerIcon1,
  writerIcon2,
} from './icons'


h
Fragment

type CopilotViewProps = {
  ctx: Ctx,
  selection: string
  apply: (ctx: Ctx, content: string, insert: boolean) => void
  hide: (ctx: Ctx) => void
}

export const CopilotView = defineComponent<CopilotViewProps>({
  name: "AICopilotView",
  props: {
    ctx: {
      type: Object,
      required: true,
    },
    selection: {
      type: String,
      required: false,
    },
    apply: {
      type: Function,
      required: true,
    },
    hide: {
      type: Function,
      required: true,
    },
  },
  setup(props) {
    const { ctx, selection, apply, hide } = props
    const aiConfigs = ctx.get(aiConfig.key)

    const contentDivRef = ref<HTMLElement>()
    const crepeEditorRef = ref<any>()
    const promptInputRef = ref<HTMLTextAreaElement>()
    const dropdownMenuRef = ref<HTMLElement>()

    const signalAbortRef = ref<AbortController>()
    const stoppingOutputRef = ref<boolean>(false)
    const currentPromptRef = ref<string>('')
    const mainContentRef = ref<string>('')

    const hasThinkingRef = ref<boolean>(true)
    const thinkingFoldedRef = ref<boolean>(false)
    const thinkingEndRef = ref<boolean>(false)
    const thinkingContentDivRef = ref<HTMLElement>()
    

    const openAIClient = new OpenAI({
      apiKey: aiConfigs.apiKey,
      baseURL: aiConfigs.baseUrl,
      dangerouslyAllowBrowser: true
    });

    async function fetchAIHint(prompt: string) {
      hasThinkingRef.value = false;
      renderThinking("");
      renderMainContent("");

      let signalAbort = signalAbortRef.value = new AbortController();
      stoppingOutputRef.value = false;
      currentPromptRef.value = prompt;

    
      let lastUpdateTime = 0;
      const THROTTLE_INTERVAL = 200; // 节流间隔
      // 创建一个节流更新函数
      const throttledUpdate = (thinkingText: string, mainText: string, immediate: boolean = false) => {
        const now = Date.now();
        if ((now - lastUpdateTime >= THROTTLE_INTERVAL) || immediate) {
          if (thinkingText) {
            renderThinking(thinkingText);
          }

          if (mainText) {
            renderMainContent(mainText);
          }

          lastUpdateTime = now;
        }
      };
    
      const payload: any = {
        model: aiConfigs.model,
        messages: [{ role: "user", content: prompt }],
        stream: true,
        signal: signalAbort
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
    
      let thinkingText = '';
      let mainText = '';
      let hasReasoning = false;
      let inThinking = false;
      try {
        const newStream = await openAIClient.chat.completions.create(payload);
    
        // 响应流式输出
        for await (const chunk of newStream) {
          if (stoppingOutputRef.value) {
            break;
          }
    
          const delta = chunk.choices[0]?.delta;
    
          let reasoningContent = delta?.reasoning_content || delta?.reasoning;
          let content = delta?.content || '';
          if (!reasoningContent && !content) {
            continue;
          }
    
          // 碰到思考输出
          // 处理 <think> 标签
          if (content.includes('<think>')) {
            hasThinkingRef.value = true;
            inThinking = true;
            content = content.replace('<think>', '');
          }
          if (content.includes('</think>')) {
            content = content.replace('</think>', '');
            inThinking = false;
            thinkingEndRef.value = true;
          }

          // 如果在思考块内，为每个新行添加 > 前缀
          if (inThinking) {
            if (content.length === 0) {
              continue;
            }
            // <think>后的第一个换行符忽略
            if (content === '\n' && thinkingText.length == 0) {
              continue;
            }
            content = content.replace(/\n+/g, '</p><p>');
            thinkingText += content;
            let tc = '<p>'+ thinkingText + '</p>';
            throttledUpdate(tc, "", false);
            continue;
          }
          
          if (!inThinking) {
            mainText += content;
          }

          /*if (reasoningContent !== undefined || content.contains('<think>')) {
            // 第一次进入思考内容
            if (!hasReasoning) {
              hasReasoning = true;
              hasThinkingRef.value = true;
            }
            reasoningText += reasoningContent;
            //accumulatedText += reasoningContent;
          }
          // 思考结束了
          else {
            if (hasReasoning) {
              hasReasoning = false;
              accumulatedText += '</think>';
            }
    
            mainText += content;
            accumulatedText += content;
          }*/
          
          if (mainText) {
            throttledUpdate('', mainText, false);
          }
        }
    
      } catch (error) {
        console.error(">> Error: AI chat completion error:", error);
        return;
      }
    
      // 确保最后一次更新一定会执行
      throttledUpdate('', mainText, true);
      mainContentRef.value = mainText;
    }

    const foldThinking = () => {
      thinkingFoldedRef.value = !thinkingFoldedRef.value;
    }

    const renderThinking = (content: string) => {
      const tcDiv = thinkingContentDivRef.value;
      if (tcDiv) {
        tcDiv.innerHTML = DOMPurify.sanitize(content);
        tcDiv.scrollTop = tcDiv.scrollHeight;
      }
    };
    const renderMainContent = (markdown: string) => {
      if (crepeEditorRef.value) {
        crepeEditorRef.value.action(replaceAll(markdown || ''));
        if (contentDivRef.value) {
          contentDivRef.value.scrollTop = contentDivRef.value?.scrollHeight;
        }
      }
    }
    
    const onClick = (fn: (ctx: Ctx) => void) => (e: MouseEvent) => {
      e.preventDefault()
      e.stopPropagation()
      ctx && fn(ctx)
    }

    const stopOutput = () => {
      stoppingOutputRef.value = true;
      signalAbortRef.value?.abort();
    }

    const applyReplace = (ctx: Ctx) => {
      apply(ctx, mainContentRef.value, false)
    }

    const applyInsert = (ctx: Ctx) => {
      apply(ctx, mainContentRef.value, true)
    }

    const discard = (ctx: Ctx) => {
      hide(ctx);
    }

    const resend = () => {
      const currentPrompt = currentPromptRef.value;
      if (currentPrompt && currentPrompt.trim()) {
        fetchAIHint(currentPrompt);
      }
    }

    const writing = (_ctx: Ctx, type: string) => {
      if (!selection) {
        return;
      }
      let prompt = aiConfigs.prompts['article:'+ type];
      if (!prompt) {
        return;
      }
      prompt = prompt.replaceAll('{{content}}', selection);
      fetchAIHint(prompt);
    }

    const translate = (_ctx: Ctx, lang: string) => {
      if (!selection) {
        return;
      }
      let prompt = aiConfigs.prompts[AIPromptsKey.Translation];
      if (!prompt) {
        return;
      }
      prompt = prompt.replaceAll('{{lang}}', lang);
      prompt = prompt.replaceAll('{{content}}', selection);
      fetchAIHint(prompt);
    }

    const sendUserInputPrompt = () => {
      if (promptInputRef.value) {
        const textarea = promptInputRef.value;
        let inputValue = textarea.value.trim();
        if (inputValue) {
          fetchAIHint(inputValue);
        } else {
          textarea.focus();
        }
      }
    }

    const toggleDropdownMenu = (show: boolean) => {
      const menu = dropdownMenuRef.value;
      if (menu) {
        if (show) {
          menu.classList.remove('hide');
        } else {
          menu.classList.add('hide');
        }
      }
    };

    onMounted(() => {
      const crepe = new Crepe({
        root: contentDivRef.value,
        defaultValue: ' ',
        featureConfigs: {
          [Crepe.Feature.CodeMirror]: {
            noResultText: '无结果',
            searchPlaceholder: '搜索语言',
            previewToggleText: (previewOnlyMode) => (previewOnlyMode ? '代码' : '隐藏'),
            previewLabel: () => '预览',
          },
          [Crepe.Feature.Placeholder]: {
            text: ''
          },
        }
      });
      crepe.editor.use([aiConfig]);
      crepe.create().then(() => {
        crepeEditorRef.value = crepe.editor;
        crepe.setReadonly(true);
      });

      // 绑定输入框上的事件
      if (promptInputRef.value) {
        const textarea = promptInputRef.value;

        ['mousedown', 'pointerdown', 'keydown', 'keypress', 'paste'].forEach((evtName) => {
          textarea.addEventListener(evtName, (e:any) => {
            e.stopPropagation();
          }, false);
        });

        textarea.addEventListener('input', () => {
          textarea.style.height = '1em';
          const sh = textarea.scrollHeight;
          textarea.style.height = Math.min(sh, 100) + 'px';
          textarea.style.overflowY = (sh > 100) ? 'auto' : 'hidden';

          const value = textarea.value.trim();
          toggleDropdownMenu(value.length === 0);
        });

        textarea.addEventListener('keydown', (e: KeyboardEvent) => {
          if (e.key === 'Enter' && e.ctrlKey) {
            let value = textarea.value.trim();
            textarea.value = '';
            value && fetchAIHint(value);
          }
        }, false);

        textarea.addEventListener('focus', (e) => {
          e.stopPropagation();
          toggleDropdownMenu(textarea.value.trim().length === 0);
        }, false);
      }

    })

    return () => {
      return (
        <>
          <div class="milkdown-copilot-viewpanel">
            <div class="milkdown-copilot-inner">
              <div class={clsx('milkdown-copilot-thinking', hasThinkingRef.value?'':'hide' , thinkingFoldedRef.value?'closed':'')} tabindex="-1">
                <div class="milkdown-copilot-thinking-header" onClick={foldThinking}>
                  <div class="thinking-header-icon"><Icon icon={arrowRightIcon}/></div>
                  <div class="thinking-header-text">
                    <span class="status-text">{thinkingEndRef.value ? '已思考完':'正在思考中...'}</span>
                  </div>
                </div>
                <div class="milkdown-copilot-thinking-content" ref={thinkingContentDivRef}></div>
              </div>
              <div class="milkdown-copilot-content" tabindex="-1" ref={contentDivRef}></div>
              <div class={clsx("milkdown-copilot-actions")}>
                <div class="actions-left">
                  <div class="ai-loading-tip">
                    <span class="ai-loading-icon"><Icon icon={aiIcon}/></span>
                    <span class="ai-loading-text">AI思考中...</span>
                  </div>
                </div>
              </div>
              <div class="milkdown-copilot-actions">
                <div class="actions-left">
                  <div class="ai-loading-tip">
                    <span class="ai-loading-icon"><Icon icon={aiIcon}/></span>
                    <span class="ai-loading-text">AI正在输出...</span>
                  </div>
                </div>
                <div class="actions-right">
                  <button class="copilot-btn-stop" onClick={onClick(stopOutput)}>
                    <span class="copilot-btn-icon"><Icon icon={stopIcon}/></span>
                    <span class="copilot-btn-text">停止输出</span>
                  </button>
                </div>
              </div>
              <div class="milkdown-copilot-actions">
                <div class="actions-left">
                  <button class="copilot-btn-accept" onClick={onClick(applyReplace)}>
                    <span class="copilot-btn-icon"><Icon icon={acceptIcon}/></span>
                    <span class="copilot-btn-text">接受</span>
                  </button>
                  <button class="copilot-btn-discard" onClick={onClick(discard)}>
                    <span class="copilot-btn-icon"><Icon icon={discardIcon}/></span>
                    <span class="copilot-btn-text">弃用</span>
                  </button>
                  <button class="copilot-btn-insert" onClick={onClick(applyInsert)}>
                    <span class="copilot-btn-icon"><Icon icon={insertIcon}/></span>
                    <span class="copilot-btn-text">在原文后插入</span>
                  </button>
                </div>
                <div class="actions-right">
                  <button class="copilot-btn-rehint" onClick={onClick(resend)}>
                    <span class="copilot-btn-icon"><Icon icon={refreshIcon}/></span>
                    <span class="copilot-btn-text">重新生成</span>
                  </button>
                </div>
              </div>
              <div class="milkdown-copilot-input-portal">
                <div class="milkdown-copilot-input">
                  <div class="copilot-input-icon"><Icon icon={aiIcon2}/></div>
                  <div class="copilot-input-wrapper">
                    <textarea rows="1" cols="20" placeholder="想让我做什么呢?" ref={promptInputRef}></textarea>
                  </div>
                  <div class="copilot-input-actions">
                    <button class="copilot-input-send-btn" onClick={onClick(sendUserInputPrompt)}><Icon icon={sendIcon}/></button>
                  </div>
                </div>
                <div class="milkdown-copilot-dropdown" ref={dropdownMenuRef}>
                  <div class="dropdown-menu-item" onClick={onClick((ctx) => writing(ctx, 'polishing'))}>
                    <div class="menu-icon"><Icon icon={aiIcon2}/></div>
                    <div class="menu-text">润色</div>
                  </div>
                  <div class="dropdown-menu-item" onClick={onClick((ctx) => writing(ctx, 'expansion'))}>
                    <div class="menu-icon"><Icon icon={writerIcon1}/></div>
                    <div class="menu-text">扩写</div>
                  </div>
                  <div class="dropdown-menu-item" onClick={onClick((ctx) => writing(ctx, 'continue'))}>
                    <div class="menu-icon"><Icon icon={writerIcon1}/></div>
                    <div class="menu-text">续写</div>
                  </div>
                  <div class="dropdown-menu-item" onClick={onClick((ctx) => writing(ctx, 'simplify'))}>
                    <div class="menu-icon"><Icon icon={writerIcon2}/></div>
                    <div class="menu-text">缩写</div>
                  </div>
                  <div class="dropdown-menu-item" onClick={onClick((ctx) => writing(ctx, 'summarize'))}>
                    <div class="menu-icon"><Icon icon={writerIcon2}/></div>
                    <div class="menu-text">总结</div>
                  </div>
                  <div class="dropdown-menu-item submenu">
                    <div class="menu-icon"><Icon icon={translationIcon}/></div>
                    <div class="menu-text">翻译</div>
                    <div class="submenu-icon"><Icon icon={chevronRight}/></div>
                    <div class="milkdown-copilot-dropdown" onClick={onClick((ctx) => translate(ctx, 'english'))}>
                      <div class="dropdown-menu-item">
                        <div class="menu-icon">🇬🇧</div>
                        <div class="menu-text">英文</div>
                      </div>
                      <div class="dropdown-menu-item" onClick={onClick((ctx) => translate(ctx, 'chinese'))}>
                        <div class="menu-icon">🇨🇳</div>
                        <div class="menu-text">简体中文</div>
                      </div>
                      <div class="dropdown-menu-item" onClick={onClick((ctx) => translate(ctx, 'japanese'))}>
                        <div class="menu-icon">🇯🇵</div>
                        <div class="menu-text">日文</div>
                      </div>
                      <div class="dropdown-menu-item" onClick={onClick((ctx) => translate(ctx, 'korean'))}>
                        <div class="menu-icon">🇰🇷</div>
                        <div class="menu-text">韩文</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </>
      )
    }
  }
})
