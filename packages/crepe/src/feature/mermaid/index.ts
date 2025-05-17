import { codeBlockConfig } from '@milkdown/kit/component/code-block'
import type { DefineFeature } from '../shared'

import { CrepeFeature } from '../..'
import { FeaturesCtx } from '../../core/slice'
import { blockMermaidSchema } from './block-mermaid'
import { mermaidBlockInputRule } from './input-rule'
import { remarkMermaidBlockPlugin } from './remark'

import type { MermaidConfig } from 'mermaid'
import mermaid from 'mermaid'


/*export interface MermaidOptionsConfig {
  mermaidOptions: MermaidConfig
}*/

export type MermaidFeatureConfig = Partial<MermaidConfig>

export const defineFeature: DefineFeature<MermaidFeatureConfig> = (
  editor,
  config
) => {
  editor
    .config((ctx) => {
      const flags = ctx.get(FeaturesCtx)
      const isCodeMirrorEnabled = flags.includes(CrepeFeature.CodeMirror)
      if (!isCodeMirrorEnabled) {
        throw new Error('You need to enable CodeMirror to use Mermaid feature')
      }

      mermaid.initialize({
        startOnLoad: false,
        suppressErrorRendering: true,
        ...config
      })

      ctx.update(codeBlockConfig.key, (prev) => ({
        ...prev,
        renderPreview: (language, content) => {
          if (language.toLowerCase() === 'mermaid' && content.length > 0) {
            return renderMermaid(content);
          }
          const renderPreview0 = prev.renderPreview;
          return renderPreview0 ? renderPreview0(language, content) : null;
        },
      }))

    })
    .use(remarkMermaidBlockPlugin)
    .use(mermaidBlockInputRule)
    .use(blockMermaidSchema)
}

function renderMermaid(content: string) {
  const graphId = 'mermaid'+ Date.now();
  let dom = document.createElement('div');
  dom.className = 'milkdown-mermaid-preview-panel';
  dom.id = graphId;
  
  (function(divId) {
    try {
      mermaid.parseError = (err) => {
        const ele = document.querySelector('#'+ divId);
        ele && (ele.innerHTML = `<div style='color:red;'><div>Mermaid语法错误: </div><div>${err}</div></div>`);
      };
      
      mermaid.render('graph_'+ divId, content).then((output: any) => {
        let time = Date.now();
        let ele;
        while (!(ele = document.querySelector('#'+ divId))) {
          if (Date.now() - time > 2000) {
            console.error('Mermaid渲染失败，没有找到渲染节点: div#'+ divId);
            return;
          }
        }
        ele && (ele.innerHTML = output.svg);
      });
    } catch (e) {
      console.error(e);
    }
  })(graphId);

  return dom;
}
