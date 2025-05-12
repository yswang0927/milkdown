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
        ...config
      })

      ctx.update(codeBlockConfig.key, (prev) => ({
        ...prev,
        renderPreview: (language, content) => {
          if (language.toLowerCase() === 'mermaid' && content.length > 0) {
            return renderMermaid(content, config)
          }
          const renderPreview = prev.renderPreview
          return renderPreview(language, content)
        },
      }))

    })
    .use(remarkMermaidBlockPlugin)
    .use(mermaidBlockInputRule)
    .use(blockMermaidSchema)
}

function renderMermaid(content: string, config?: MermaidConfig) {
  const graphId = 'mermaid'+ Date.now();
  let dom = document.createElement('div');
  dom.dataset.id = graphId;
  dom.id = graphId;
  
  mermaid.render('graph_'+ graphId, content).then((output: any) => {
    const ele = document.querySelector('#'+ dom.dataset.id);
    ele && output.svg && (ele.innerHTML = output.svg);
  });

  return dom;
}
