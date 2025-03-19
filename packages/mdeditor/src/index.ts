// 导入core-js-polyfill，用于支持chrome80+低版本浏览器
import 'core-js/actual';

import { Crepe } from '@milkdown/crepe';
import { editorViewCtx } from "@milkdown/core";
import { outline, replaceAll, insert, getHTML } from '@milkdown/kit/utils';
import { html } from "@milkdown/kit/component";
import { listenerCtx } from '@milkdown/kit/plugin/listener'

import type { Uploader } from "@milkdown/kit/plugin/upload";
import { upload, uploadConfig, readImageAsBase64 } from "@milkdown/kit/plugin/upload";
import { Decoration } from '@milkdown/prose/view';
import type { Schema, Node } from '@milkdown/prose/model';

import { collab, collabServiceCtx } from '@milkdown/plugin-collab';
import { CollabManager } from "./collabmanager";

import { filePicker, clearContentAndAddBlockType, filePickerNodeBlock } from "@milkdown/plugin-file";

import "@milkdown/crepe/theme/common/style.css";
import "@milkdown/crepe/theme/frame.css";
import "./index.css";

interface EditorOptions {
    defaultValue?: string;
    splitEditing?: boolean;
    autofocus?: boolean;
    onUpload?: (file: File) => Promise<string>;
    onContentChanged?: (markdown: string, editor: MarkdownEditor) => void;
    onReady?: (editor: MarkdownEditor) => void;
}

export class MarkdownEditor {
    private container: HTMLElement;
    private options: EditorOptions;
    private crepe: Crepe | null;
    private inited: boolean;

    constructor(container: string | HTMLElement, options?: EditorOptions) {
        this.container = typeof container === 'string' ? document.querySelector(container) as HTMLElement : (container || document.body);
        this.options = options || {};
        this.crepe = null;
        this.inited = false;

        this.init();
    }

    private init(): void {

        const defaultUpload = async (file: File) => {
            return Promise.resolve(URL.createObjectURL(file))
        };

        const crepe = this.crepe = new Crepe({
            root: this.container,
            defaultValue: this.options.defaultValue || '',
            featureConfigs: {
                [Crepe.Feature.CodeMirror]: {
                    noResultText: '无结果',
                    searchPlaceholder: '搜索语言',
                    //previewToggleIcon: (previewOnlyMode) => (previewOnlyMode ? html`<svg></svg>` : html`<svg></svg>`),
                    previewToggleText: (previewOnlyMode) => (previewOnlyMode ? '编辑' : '隐藏'),
                    previewLabel: () => '预览',
                },
                [Crepe.Feature.LinkTooltip]: {
                    inputPlaceholder: '输入链接地址',
                    onCopyLink: (link) => {
                        console.log('>>> 拷贝了链接：', link);
                    }
                },
                [Crepe.Feature.Placeholder]: {
                    text: '输入 “/” 可快速插入内容，或“Command+/”可唤起AI助手',
                },
                [Crepe.Feature.BlockEdit]: {
                    slashMenuTextGroupLabel: '普通',
                    slashMenuTextLabel: '文本',
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
                    slashMenuAIGroupLabel: 'AI',
                    slashMenuAIWriterLabel: 'AI创作',

                    buildMenu: (builder) => {
                        const advanced = builder.getGroup('advanced')
                        advanced.addItem('file', {
                          label: '插入文件',
                          icon: html`
                            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">
                              <path
                                fill="none"
                                stroke="currentColor"
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                stroke-width="2"
                                d="M13.324 8.436L9.495 12.19c-.364.36-.564.852-.556 1.369a2 2 0 0 0 .6 1.387c.375.371.88.584 1.403.593a1.92 1.92 0 0 0 1.386-.55l3.828-3.754a3.75 3.75 0 0 0 1.112-2.738a4 4 0 0 0-1.198-2.775a4.1 4.1 0 0 0-2.808-1.185a3.85 3.85 0 0 0-2.77 1.098L6.661 9.39a5.63 5.63 0 0 0-1.667 4.107a6 6 0 0 0 1.798 4.161a6.15 6.15 0 0 0 4.21 1.778a5.77 5.77 0 0 0 4.157-1.646l3.829-3.756" />
                            </svg>
                          `,
                          onRun: (ctx) => {
                            const view = ctx.get(editorViewCtx)
                            const { dispatch, state } = view
                            const command = clearContentAndAddBlockType(filePickerNodeBlock.type(ctx))
                            command(state, dispatch)
                          }
                        })
                    }
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
                [Crepe.Feature.AI]: {
                    enabled: true,
                    base_url: 'http://127.0.0.1:11434/api/',
                    model: 'deepseek-r1:7b',
                    api_key: 'ollama',
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

            // 监听事件
            const listener = ctx.get(listenerCtx);
            listener.markdownUpdated((_ctx, markdown, prevMarkdown) => {
                if ((markdown !== prevMarkdown)
                    && (typeof this.options.onContentChanged === 'function')) {
                    this.options.onContentChanged(markdown, this);
                }
            });

        });

        //crepe.editor.use(collab);
        crepe.editor.use(upload);
        crepe.editor.use(filePicker);


        // 多人协作
        /*crepe.editor.action((ctx) => {
            const collabService = ctx.get(collabServiceCtx);
            const collabManager = new CollabManager(collabService);
            collabManager.flush(this.options.defaultValue || '');
        });*/


        /*if (this.options.splitEditing) {
            crepe.editor.use(splitEditing);
        }*/

        crepe.create().then(() => {
            this.inited = true;

            if (this.options.autofocus) {
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
