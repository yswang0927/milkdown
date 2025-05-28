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
  type Ref
} from 'vue'
import DOMPurify from 'dompurify'
import { computePosition, flip, offset, shift } from '@floating-ui/dom'

import OpenAI from "openai"

import { aiConfig, AIPromptsKey } from './config'

import {
  aiIcon,
  aiIcon2,
  acceptIcon,
  arrowRightIcon,
  chevronRight,
  discardIcon,
  graphicIcon,
  insertIcon,
  refreshIcon,
  sendIcon,
  stopIcon,
  thinkingIcon,
  translationIcon,
  warnIcon,
  writingExpansionIcon,
  writingSummarizeIcon,
  writingContinueIcon,
  writingSimplyIcon,
} from './icons'


h
Fragment

type CopilotViewProps = {
  ctx: Ctx,
  selection: string
  contextBefore: string
  apply: (ctx: Ctx, content: string, insert: boolean) => void
  hide: (ctx: Ctx) => void
}

// 0-初始状态,1-等待响应,2-正在输出,3-输出完成,9-响应失败
enum CopilotStatus {
  INIT = 0,
  PENDING = 1,
  OUTPUTING = 2,
  FINISHED = 3,
  ERROR = 9
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
    contextBefore: {
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
    const { ctx, selection, contextBefore, apply, hide } = props
    const aiConfigs = ctx.get(aiConfig.key)

    const copilotViewDivRef = ref<HTMLElement>()
    const mainContentDivRef = ref<HTMLElement>()
    const mainAutoScrollingRef = ref<boolean>(true)
    const crepeEditorRef = ref<any>()
    const promptInputWrapRef = ref<HTMLElement>()
    const promptInputRef = ref<HTMLTextAreaElement>()
    const dropdownMenuRef = ref<HTMLElement>()

    const signalAbortRef = ref<AbortController>()
    const stoppingOutputRef = ref<boolean>(false)
    const currentSystemPromptRef = ref<string>('')
    const currentUserPromptRef = ref<string>('')
    const mainContentRef = ref<string>('')

    const hasThinkingRef = ref<boolean>(false)
    const thinkingFoldedRef = ref<boolean>(false)
    const thinkingEndRef = ref<boolean>(false)
    const thinkingAutoScrollingRef = ref<boolean>(true)
    const thinkingContentDivRef = ref<HTMLElement>()

    const copilotStatusRef = ref<CopilotStatus>(CopilotStatus.INIT)
    const copilotErrorMsgRef = ref<string>("")

    const dropdownMenuShouldShow = computed(() => {
      const textarea = promptInputRef.value;
      if (!textarea) {
        return false;
      }
      return (textarea.value.trim().length === 0)
              && (copilotStatusRef.value === CopilotStatus.INIT
                    || copilotStatusRef.value === CopilotStatus.ERROR)
    });

    const openAIClient = new OpenAI({
      apiKey: aiConfigs.apiKey,
      baseURL: aiConfigs.baseUrl,
      dangerouslyAllowBrowser: true
    });

    function isAsyncIterable(obj: any) {
      return (
        (obj !== null) 
          && (typeof obj === "object") 
          && (Symbol.asyncIterator in obj) && (typeof obj[Symbol.asyncIterator] === "function")
      );
    }

    async function fetchAIHint(userPrompt: string, systemPrompt: string="") {
      copilotStatusRef.value = CopilotStatus.PENDING;
      hasThinkingRef.value = false;
      thinkingEndRef.value = false;
      thinkingFoldedRef.value = false;
      thinkingAutoScrollingRef.value = true;
      mainAutoScrollingRef.value = true;
      renderThinking("");
      renderMainContent("");

      currentUserPromptRef.value = userPrompt || '';
      currentSystemPromptRef.value = systemPrompt || '';

      let signalAbort = signalAbortRef.value = new AbortController();
      stoppingOutputRef.value = false;

      let lastUpdateTime = 0;
      const THROTTLE_INTERVAL = 150; // 节流间隔
      // 创建一个节流更新函数
      const throttledUpdate = (thinkingText: string, mainText: string, immediate: boolean = false) => {
        const now = Date.now();
        if ((now - lastUpdateTime >= THROTTLE_INTERVAL) || immediate) {
          if (thinkingText && thinkingText.length > 0) {
            renderThinking(thinkingText);
          }

          if (mainText && mainText.length > 0) {
            renderMainContent(mainText);
          }

          lastUpdateTime = now;
        }
      };
    
      const payload: any = {
        model: aiConfigs.model,
        messages: [{ "role": "user", "content": userPrompt }],
        stream: true,
        signal: signalAbort
      };

      if (systemPrompt && systemPrompt.trim().length > 0) {
        payload.messages = [{ "role": "system", "content": systemPrompt }].concat(payload.messages);
      }
    
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
        const newResponse = await openAIClient.chat.completions.create(payload);
        cleanTextarea();

        // 流式输出
        if (isAsyncIterable(newResponse)) {
          // 响应流式输出
          for await (const chunk of newResponse) {
            copilotStatusRef.value = CopilotStatus.OUTPUTING;
            if (stoppingOutputRef.value) {
              break;
            }
      
            const delta = chunk.choices[0]?.delta;
      
            // 处理 vllm 输出的 reasoning_content
            let reasoningContent = delta?.reasoning_content || delta?.reasoning;
            let content = delta?.content || '';

            if (!hasReasoning && reasoningContent !== undefined) {
              hasReasoning = true;
            }

            if (!hasReasoning && !content) {
              continue;
            }
      
            // 碰到思考输出
            // 处理 <think> 标签
            if (hasReasoning || content.includes('<think>')) {
              hasThinkingRef.value = true;
              inThinking = true;
              content = (reasoningContent || content).replace('<think>', '');
            }
            if (content.includes('</think>')) {
              content = content.replace('</think>', '');
              inThinking = false;
              thinkingEndRef.value = true;
              thinkingFoldedRef.value = true;
            }

            if (hasReasoning && inThinking && delta?.content) {
              inThinking = false;
              thinkingEndRef.value = true;
              thinkingFoldedRef.value = true;
            }

            // 如果在思考块内
            if (inThinking) {
              if (content.length === 0) {
                continue;
              }
              // <think>后的第一个换行符忽略
              if (content === '\n' && thinkingText.length === 0) {
                continue;
              }
              content = content.replace(/\n+/g, '</p><p>');
              thinkingText += content;
              let tc = '<p>'+ thinkingText + '</p>';
              throttledUpdate(tc, '', false);
              continue;
            }
            
            if (!inThinking) {
              // 更新前面最后一次的think
              if (thinkingText.length > 0) {
                throttledUpdate('<p>'+ thinkingText + '</p>', '', true);
                thinkingText = '';
              }

              // 累加主内容
              mainText += content;
              if (mainText) {
                throttledUpdate('', mainText, false);
              }
            }
          }

        }
        // 非流式输出,直接响应: {choices:[{finish_reason: "stop", message:{role:"assistant", content:"", [reasoning_content:""]}}]}
        else if (newResponse.choices !== undefined) {
          const choices = newResponse.choices;
          if (choices.length > 0) {
            let content = choices[0]?.message?.content;
            let reasoningContent = choices[0]?.message?.reasoning_content || choices[0]?.message?.reasoning;
            if (typeof content === 'string') {
              if (reasoningContent !== undefined) {
                hasThinkingRef.value = true;
                thinkingEndRef.value = true;
                thinkingFoldedRef.value = true;
                thinkingText = reasoningContent || '';
              }
              else {
                const thinkRegxp = /<think>([\s\S]*?)<\/think>/;
                const matchedThink = content.match(thinkRegxp);
                if (matchedThink != null && matchedThink.length > 1) {
                  hasThinkingRef.value = true;
                  thinkingEndRef.value = true;
                  thinkingFoldedRef.value = true;
                  thinkingText = matchedThink[1] || '';
                  content = content.replace(thinkRegxp, "");
                }
              }
              if (hasThinkingRef.value && thinkingText) {
                throttledUpdate('<p>'+ thinkingText.replace(/\n+/g, '</p><p>') + '</p>', '', true);
              }

              mainText = content;
              
            } else {
              copilotStatusRef.value = CopilotStatus.ERROR;
              copilotErrorMsgRef.value = '不支持的大模型响应格式';
              return;
            }
          }
        }
    
      } catch (error: any) {
        copilotStatusRef.value = CopilotStatus.ERROR;
        let errorMsg = "";
        if (typeof error === 'string') {
          errorMsg = error;
        } 
        else if (typeof error === 'object') {
          if (error.message !== undefined) {
            errorMsg = `(${error.message})`;
          }
        }
        copilotErrorMsgRef.value = errorMsg;
        console.error(">> Error: AI chat completion error:", error);
        return;
      }
    
      // 确保最后一次更新一定会执行
      throttledUpdate('', mainText, true);
      copilotStatusRef.value = CopilotStatus.FINISHED;
      mainContentRef.value = mainText;
    }

    const foldThinking = () => {
      thinkingFoldedRef.value = !thinkingFoldedRef.value;
    }
    
    const scrollToBottom = (container: HTMLElement) => {
      if (container) {
        requestAnimationFrame(() => {
          container.scrollTop = container.scrollHeight;
          //container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
        });
      }
    };

    const renderThinking = (content: string) => {
      const tcDiv = thinkingContentDivRef.value;
      if (tcDiv) {
        tcDiv.innerHTML = DOMPurify.sanitize(content);
        if (thinkingAutoScrollingRef.value) {
          scrollToBottom(tcDiv);
        }
      }
    };

    const renderMainContent = (markdown: string) => {
      const mainDiv = mainContentDivRef.value;
      if (mainDiv && crepeEditorRef.value) {
        crepeEditorRef.value.action(replaceAll(markdown || ''));

        if (mainAutoScrollingRef.value) {
          scrollToBottom(mainDiv);
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

    const reGenerate = () => {
      const currentUserPrompt = currentUserPromptRef.value;
      const currentSystemPrompt = currentSystemPromptRef.value;
      if (currentUserPrompt && currentUserPrompt.trim().length > 0) {
        fetchAIHint(currentUserPrompt, currentSystemPrompt);
      }
    }

    const writing = (_ctx: Ctx, type: string) => {
      let content = selection || contextBefore;
      if (!content) {
        return;
      }
      let systemPrompt = aiConfigs.prompts['article:'+ type];
      if (!systemPrompt) {
        return;
      }
      fetchAIHint(content, systemPrompt);
    }

    const translate = (_ctx: Ctx, lang: string) => {
      let content = selection || contextBefore;
      if (!content) {
        return;
      }
      let prompt = aiConfigs.prompts[AIPromptsKey.Translation];
      if (!prompt) {
        return;
      }
      prompt = prompt.replaceAll('{{lang}}', lang);
      prompt = prompt.replace('{{content}}', content);
      fetchAIHint(prompt, "");
    }

    const text2visuals = (_ctx: Ctx) => {
      let content = selection || contextBefore;
      if (!content) {
        return;
      }
      let systemPrompt = aiConfigs.prompts[AIPromptsKey.Text2Visuals];
      if (!systemPrompt) {
        return;
      }
      fetchAIHint(content, systemPrompt);
    }

    const sendUserInputPrompt = () => {
      const textarea = promptInputRef.value;
      if (textarea) {
        let inputValue = textarea.value.trim();
        if (inputValue) {
          if (inputValue.includes('前面的内容')
            || inputValue.includes('前面内容')
            || inputValue.includes('上述内容')
            || inputValue.includes('选择的内容')
            || inputValue.includes('选中的内容')
            || inputValue.includes('选中内容')) {
              let prepend = selection || contextBefore;
              if (prepend) {
                inputValue = prepend + '\n\n' + inputValue;
              }
          }
          
          fetchAIHint(inputValue);
        } else {
          textarea.focus();
        }
      }
    }

    const cleanTextarea = () => {
      const textarea = promptInputRef.value;
      if (textarea) {
        textarea.value = '';
        textarea.style.height = 'auto';
      }
    };

    const toggleDropdownMenu = (show: boolean) => {
      const menu = dropdownMenuRef.value;
      if (menu) {
        if (show) {
          menu.classList.add('shown');
          const inputWrapEle = promptInputWrapRef.value;
          if (inputWrapEle) {
            // 使用 floating-ui/dom 来自动计算位置
            computePosition(inputWrapEle, menu, {
              placement: 'bottom-start',
              middleware: [flip(), shift(), offset({mainAxis: 0, crossAxis: 0})]
            }).then(({ x, y }) => {
              Object.assign(menu.style, {
                left: `${x}px`,
                top: `${y}px`,
              });
            });
          }

        } else {
          menu.classList.remove('shown');
        }
      }
    };

    onMounted(() => {
      const copilotViewDiv = copilotViewDivRef.value;
      if (!copilotViewDiv) {
        return;
      }

      const crepe = new Crepe({
        root: mainContentDivRef.value,
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

      copilotViewDiv.addEventListener('mousedown', (e: MouseEvent) => {
        e.stopPropagation();
        const targetEle = e.target;
        if (!targetEle) {
          return;
        }
        if (!dropdownMenuRef.value?.contains(targetEle as HTMLElement)) {
          toggleDropdownMenu(false);
        }
      });
      ['mousemove', 'pointermove'].forEach((evtName) => {
        copilotViewDiv.addEventListener(evtName, (e: any) => {
          e.preventDefault();
          e.stopPropagation();
        });
      });

      // 绑定输入框上的事件
      const textarea = promptInputRef.value;
      if (textarea) {
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
          if (e.key === 'Escape') {
            discard(ctx);
            return;
          }
          if (e.key === 'Enter' && e.ctrlKey) {
            sendUserInputPrompt();
          }
        }, false);

        textarea.addEventListener('focus', (e) => {
          e.stopPropagation();
          toggleDropdownMenu(textarea.value.trim().length === 0);
        }, false);

        setTimeout(function(){
          textarea.focus();
        }, 200);
        
      }

      // 支持用户自由滚动
      const anchorUserScrolling = (scrollArea: HTMLElement, autoScrollingRef: Ref) => {
        scrollArea.addEventListener('scroll', () => {
          const isAtBottom = scrollArea.scrollHeight - scrollArea.scrollTop - scrollArea.clientHeight <= 10;
          // 用户向上滚动了 -> 停止自动滚动
          if (autoScrollingRef.value && !isAtBottom) {
            autoScrollingRef.value = false;
          } 
          // 如果用户又回到了底部，可以重新开启自动滚动（可选）
          else if (!autoScrollingRef.value && isAtBottom) {
            autoScrollingRef.value = true;
            scrollToBottom(scrollArea);
          }
        });
      };

      const thinkingDiv = thinkingContentDivRef.value;
      if (thinkingDiv) {
        anchorUserScrolling(thinkingDiv, thinkingAutoScrollingRef);
      }
      const mainDiv = mainContentDivRef.value;
      if (mainDiv) {
        anchorUserScrolling(mainDiv, mainAutoScrollingRef);
      }

    })

    return () => {
      return (
        <div class="milkdown-copilot-viewpanel" ref={copilotViewDivRef}>
          <div class="milkdown-copilot-wrap">
            {copilotStatusRef.value === CopilotStatus.PENDING && (
              <div class="milkdown-copilot-loading">
                <div class="copilot-loading-icon1">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="25 25 50 50"><circle r="20" cy="50" cx="50"></circle></svg>
                </div>
                <div class="copilot-loading-icon2"><Icon icon={aiIcon}/></div>
              </div>
            )}
            {copilotStatusRef.value === CopilotStatus.ERROR && (
              <div class="milkdown-copilot-error">
                <div><Icon icon={warnIcon}/></div>
                <div>AI服务异常,请稍后重试</div>
                <div>{copilotErrorMsgRef.value}</div>
              </div>
            )}
            <div tabindex="-1" class={clsx(
              'milkdown-copilot-thinking-panel', 
              hasThinkingRef.value?'shown':'',
              thinkingFoldedRef.value?'':'opened'
              )}>
              <div class="milkdown-copilot-thinking-header" onClick={foldThinking}>
                <div class="milkdown-copilot-thinking-header-icon"><Icon icon={thinkingIcon}/></div>
                <div class="milkdown-copilot-thinking-header-text">
                  <span class="status-text">{thinkingEndRef.value ? '已思考完':'正在思考中...'}</span>
                </div>
                <div class="milkdown-copilot-thinking-header-icon"><Icon icon={arrowRightIcon} class='fold-icon'/></div>
              </div>
              <div class="milkdown-copilot-thinking-content" ref={thinkingContentDivRef}></div>
            </div>
            <div tabindex="-1" class={clsx(
              'milkdown-copilot-content',
              (thinkingEndRef.value && (copilotStatusRef.value === CopilotStatus.OUTPUTING || copilotStatusRef.value === CopilotStatus.FINISHED))?'shown':''
            )} ref={mainContentDivRef}></div>
            <div class={clsx(
              "milkdown-copilot-actions",
              (copilotStatusRef.value === CopilotStatus.OUTPUTING)?'shown':''
            )}>
              <div class="actions-left">
                <div class="ai-loading-tip">
                  <span class="ai-loading-icon"><Icon icon={aiIcon}/></span>
                  <span class="ai-loading-text">AI生成中...</span>
                </div>
              </div>
              <div class="actions-right">
                <button class="btn-intent-warn" title="停止AI继续生成" onClick={onClick(stopOutput)}>
                  <span class="copilot-btn-icon"><Icon icon={stopIcon}/></span>
                  <span class="copilot-btn-text">停止生成</span>
                </button>
              </div>
            </div>
            <div class={clsx(
              "milkdown-copilot-actions",
              (copilotStatusRef.value === CopilotStatus.FINISHED)?'shown':''
            )}>
              <div class="actions-left">
                <button onClick={onClick(applyReplace)}>
                  <span class="copilot-btn-icon"><Icon icon={acceptIcon}/></span>
                  <span class="copilot-btn-text">替换</span>
                </button>
                <button onClick={onClick(applyInsert)}>
                  <span class="copilot-btn-icon"><Icon icon={insertIcon}/></span>
                  <span class="copilot-btn-text">在原文后插入</span>
                </button>
                <button onClick={onClick(discard)}>
                  <span class="copilot-btn-icon"><Icon icon={discardIcon}/></span>
                  <span class="copilot-btn-text">弃用</span>
                </button>
              </div>
              <div class="actions-right">
                <button onClick={onClick(reGenerate)}>
                  <span class="copilot-btn-icon"><Icon icon={refreshIcon}/></span>
                  <span class="copilot-btn-text">重新生成</span>
                </button>
              </div>
            </div>
            <div class={clsx(
              'milkdown-copilot-input-panel',
              (copilotStatusRef.value === CopilotStatus.INIT 
                || copilotStatusRef.value === CopilotStatus.FINISHED
                || copilotStatusRef.value === CopilotStatus.ERROR
              )?'shown':''
            )}>
              <div class="milkdown-copilot-input-wrap" ref={promptInputWrapRef}>
                <div class="copilot-input-icon"><Icon icon={aiIcon}/></div>
                <div class="copilot-input">
                  <textarea rows="1" cols="20" placeholder="输入要求，或从下方选择场景提问" ref={promptInputRef}></textarea>
                </div>
                <div class="copilot-input-actions">
                  <button class="copilot-input-send-btn" title="发送(Ctrl+Enter)" onClick={onClick(sendUserInputPrompt)}><Icon icon={sendIcon}/></button>
                </div>
              </div>
              <div ref={dropdownMenuRef} class={clsx(
                'milkdown-copilot-dropdown', 
                dropdownMenuShouldShow?'shown':''
              )}>
                <div class="milkdown-dropdown-menu">
                  <div class="milkdown-dropdown-menu-item" onClick={onClick(text2visuals)}>
                    <span class="milkdown-dropdown-menu-icon"><Icon icon={graphicIcon}/></span>
                    <span class="milkdown-dropdown-menu-text">文生图表</span>
                  </div>
                  <div class="milkdown-dropdown-menu-divider"></div>
                  <div class="milkdown-dropdown-menu-item" onClick={onClick((ctx) => writing(ctx, 'polishing'))}>
                    <span class="milkdown-dropdown-menu-icon"><Icon icon={aiIcon2}/></span>
                    <span class="milkdown-dropdown-menu-text">润色</span>
                  </div>
                  <div class="milkdown-dropdown-menu-item" onClick={onClick((ctx) => writing(ctx, 'expansion'))}>
                    <span class="milkdown-dropdown-menu-icon"><Icon icon={writingExpansionIcon}/></span>
                    <span class="milkdown-dropdown-menu-text">扩写</span>
                  </div>
                  <div class="milkdown-dropdown-menu-item" onClick={onClick((ctx) => writing(ctx, 'continue'))}>
                    <span class="milkdown-dropdown-menu-icon"><Icon icon={writingContinueIcon}/></span>
                    <span class="milkdown-dropdown-menu-text">续写</span>
                  </div>
                  <div class="milkdown-dropdown-menu-item" onClick={onClick((ctx) => writing(ctx, 'simply'))}>
                    <span class="milkdown-dropdown-menu-icon"><Icon icon={writingSimplyIcon}/></span>
                    <span class="milkdown-dropdown-menu-text">缩写</span>
                  </div>
                  <div class="milkdown-dropdown-menu-item" onClick={onClick((ctx) => writing(ctx, 'summarize'))}>
                    <span class="milkdown-dropdown-menu-icon"><Icon icon={writingSummarizeIcon}/></span>
                    <span class="milkdown-dropdown-menu-text">总结</span>
                  </div>
                  <div class="milkdown-dropdown-menu-divider"></div>
                  <div class="milkdown-dropdown-menu-item milkdown-dropdown-submenu">
                    <span class="milkdown-dropdown-menu-icon"><Icon icon={translationIcon}/></span>
                    <span class="milkdown-dropdown-menu-text">翻译为</span>
                    <div class="milkdown-dropdown-submenu-icon"><Icon icon={chevronRight}/></div>
                    <div class="milkdown-dropdown-menu">
                      <div class="milkdown-dropdown-menu-item" onClick={onClick((ctx) => translate(ctx, 'english'))}>
                        <span class="milkdown-dropdown-menu-icon">🇬🇧</span>
                        <span class="milkdown-dropdown-menu-text">英文</span>
                      </div>
                      <div class="milkdown-dropdown-menu-item" onClick={onClick((ctx) => translate(ctx, 'chinese'))}>
                        <span class="milkdown-dropdown-menu-icon">🇨🇳</span>
                        <span class="milkdown-dropdown-menu-text">简体中文</span>
                      </div>
                      <div class="milkdown-dropdown-menu-item" onClick={onClick((ctx) => translate(ctx, 'japanese'))}>
                        <span class="milkdown-dropdown-menu-icon">🇯🇵</span>
                        <span class="milkdown-dropdown-menu-text">日文</span>
                      </div>
                      <div class="milkdown-dropdown-menu-item" onClick={onClick((ctx) => translate(ctx, 'korean'))}>
                        <span class="milkdown-dropdown-menu-icon">🇰🇷</span>
                        <span class="milkdown-dropdown-menu-text">韩文</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )
    }
  }
})
