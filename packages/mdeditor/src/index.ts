// 导入core-js-polyfill，用于支持chrome80+低版本浏览器
import 'core-js/actual';

import { Crepe } from '@milkdown/crepe';
import { editorViewCtx } from "@milkdown/core";
import { outline, replaceAll, insert, getHTML } from '@milkdown/kit/utils';
import { listenerCtx } from '@milkdown/kit/plugin/listener'

import type { Uploader } from "@milkdown/kit/plugin/upload";
import { upload, uploadConfig } from "@milkdown/kit/plugin/upload";
import { Decoration } from '@milkdown/prose/view';
import type { Schema, Node } from '@milkdown/prose/model';

import { aiPlugin, aiConfig } from '@milkdown/plugin-ai';


import "@milkdown/crepe/theme/common/style.css";
import "@milkdown/crepe/theme/frame.css";
import "@milkdown/plugin-ai/style.css"

import "./index.css";

interface EditorOptions {
  defaultValue?: string
  editable?: boolean
  autofocus?: boolean
  ai?: {
    enabled: boolean
    baseUrl: string
    model: string
    apiKey: string
    temperature: number
    maxTokens: number
    topP: number
  }
  onUpload?: (file: File) => Promise<string>
  onContentChanged?: (markdown: string, editor: MarkdownEditor) => void
  onReady?: (editor: MarkdownEditor) => void
  onCopyLink?: (value: string) => void
}

export class MarkdownEditor {
  private container: HTMLElement;
  private options: EditorOptions;
  private crepe: Crepe | null;
  private inited: boolean;

  constructor(container: string | HTMLElement, options?: EditorOptions) {
    this.container = (typeof container === 'string' ? document.querySelector(container) : container) ?? document.body;
    this.options = Object.assign({
      defaultValue: '',
      editable: true,
      autofocus: true
    }, options || {});

    this.crepe = null;

    this.inited = false;

    this.init();
  }

  private init(): void {

    const defaultUpload = async (file: File) => {
      return URL.createObjectURL(file)
    };

    const isMacos = (navigator.userAgent.indexOf('Macintosh') !== -1) 
                  || (navigator.platform && navigator.platform.indexOf('Mac') !== -1);
    const isEditable = this.options.editable !== undefined ? this.options.editable : true;
    const aiEnabled = this.options.ai && this.options.ai.enabled && this.options.ai.baseUrl;

    const crepe = this.crepe = new Crepe({
      root: this.container,
      defaultValue: this.options.defaultValue || '',
      featureConfigs: {
        [Crepe.Feature.Cursor]: {
          virtual: false
        },
        [Crepe.Feature.CodeMirror]: {
          noResultText: '无结果',
          searchPlaceholder: '搜索语言',
          previewToggleText: (previewOnlyMode) => (previewOnlyMode ? '编辑' : '隐藏'),
          previewLabel: () => '预览',
        },
        [Crepe.Feature.LinkTooltip]: {
          inputPlaceholder: '输入链接地址',
          onCopyLink: (link) => {
            (typeof this.options.onCopyLink === 'function') && this.options.onCopyLink(link);
          }
        },
        [Crepe.Feature.Placeholder]: {
          text: '输入 “ / ” 可插入内容' + (aiEnabled ? '或 “ '+ (isMacos?'Command':'Ctrl') +' + / ” 唤起AI助手' : '')
        },
        [Crepe.Feature.BlockEdit]: {
          slashMenuTextGroupLabel: '普通',
          slashMenuTextLabel: '正文',
          slashMenuH1Label: '一级标题',
          slashMenuH2Label: '二级标题',
          slashMenuH3Label: '三级标题',
          slashMenuH4Label: '四级标题',
          slashMenuH5Label: '五级标题',
          slashMenuH6Label: '六级标题',
          slashMenuQuoteLabel: '引用',
          slashMenuDividerLabel: '分割线',
          slashMenuListGroupLabel: '列表',
          slashMenuBulletListLabel: '无序列表',
          slashMenuOrderedListLabel: '有序列表',
          slashMenuTaskListLabel: '任务列表',
          slashMenuAdvancedGroupLabel: '高级',
          slashMenuImageLabel: '图片',
          slashMenuCodeBlockLabel: '代码块',
          slashMenuTableLabel: '表格',
          slashMenuMathLabel: '数学公式',
          slashMenuGraphLabel: 'Mermaid图表'
        },
        [Crepe.Feature.ImageBlock]: {
          blockCaptionPlaceholderText: '图片描述',
          blockUploadButton: () => '上传图片',
          blockUploadPlaceholderText: '或 粘贴图片URL地址',
          inlineUploadPlaceholderText: '或 粘贴图片URL地址',
          inlineUploadButton: () => '上传图片',
          blockConfirmButton: () => '确定',
          inlineConfirmButton: () => '确定',
          inlineImageIcon: () => '🖼️',
          blockImageIcon: () => '🖼️',
          onUpload: (file: File): Promise<string> => {
            // 这里自定义上传逻辑，将图片转换为base64
            return new Promise((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = (e: ProgressEvent<FileReader>) => {
                if (e.target?.result) {
                  resolve(e.target.result.toString());
                }
              };
              reader.onerror = (e: ProgressEvent<FileReader>) => {
                reject(e);
              };
              reader.readAsDataURL(file);
            });
          }
        },
        [Crepe.Feature.Mermaid]: {
          suppressErrorRendering: true
          //theme: 'dark'
        }

      }
    });

    const fileUploader: Uploader = async (files, schema: Schema) => {
      const nodes: Node[] = await Promise.all(
        Array.from(files).map(async (file) => {
          const src = await defaultUpload(file)

          // Handle image files
          if (file.type.includes('image')) {
            return schema.nodes.image!.createAndFill({
              src,
              alt: file.name
            }) as Node
          }

          // Handle other files as attachment links
          const linkMark = schema.marks.link!.create({ href: src })
          const textNode = schema.text(file.name, [linkMark])
          return schema.nodes.paragraph!.create({}, textNode)
        })
      )

      return nodes.filter((node): node is Node => !!node)
    };

    crepe.editor.config((ctx) => {

      ctx.update(uploadConfig.key, (prev) => ({
        ...prev,
        uploadWidgetFactory: (pos, spec) => {
          const widgetDOM = document.createElement('span');
          widgetDOM.className = 'milkdown-drop-uploading-tip';
          widgetDOM.textContent = '正在上传...';
          return Decoration.widget(pos, widgetDOM, spec);
        },
        uploader: fileUploader,
      }));

      // 配置AI助手
      if (aiEnabled) {
        ctx.update(aiConfig.key, (prev) => ({
          ...prev,
          ...this.options.ai
        }));
      }

      // 监听事件
      const listener = ctx.get(listenerCtx);

      const hasContentChangeListen = (typeof this.options.onContentChanged === 'function');
      if (hasContentChangeListen) {
        let callback = this.options.onContentChanged ?? function() {};
        listener.markdownUpdated((_ctx, markdown, prevMarkdown) => {
          if (markdown !== prevMarkdown) {
            callback(markdown, this);
          }
        });
      }

    });

    crepe.editor.use(upload);
    crepe.editor.use(aiPlugin);

    crepe.create().then(() => {
      this.inited = true;

      if (!isEditable) {
        crepe.setReadonly(true);
      }
      
      if (isEditable && this.options.autofocus) {
        crepe.editor.ctx.get(editorViewCtx).dom.focus();
      }

      if (typeof this.options.onReady === 'function') {
        this.options.onReady(this);
      }
    });
  }

  public isReady(): boolean {
    return this.inited;
  }

  public setEditable(value: boolean) {
    this.crepe?.setReadonly(!value);
  }

  public setContent(value: string): void {
    if (!this.inited) {
      return;
    }
    this.crepe?.editor.action(replaceAll(value || ''));
  }

  public insertContent(value: string): void {
    if (!this.inited) {
      return;
    }
    this.crepe?.editor.action(insert(value || ''));
  }

  public getMarkdown(): string {
    if (!this.inited) {
      return '';
    }
    return this.crepe?.getMarkdown() || '';
  }

  public getHtml(): string {
    if (!this.inited) {
      return '';
    }
    return this.crepe?.editor.action(getHTML()) || '';
  }

  public getToc(): any {
    return this.crepe?.editor.action(outline());
  }

  public destroy(): void {
    if (!this.inited) {
      return;
    }
    this.crepe?.destroy();
    this.crepe = null;
    this.inited = false;
  }
}
