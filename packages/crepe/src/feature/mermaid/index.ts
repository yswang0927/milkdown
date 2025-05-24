import { codeBlockConfig } from '@milkdown/kit/component/code-block'
import type { DefineFeature } from '../shared'

import { CrepeFeature } from '../..'
import { FeaturesCtx } from '../../core/slice'
import { blockMermaidSchema } from './block-mermaid'
import { mermaidBlockInputRule } from './input-rule'
import { remarkMermaidBlockPlugin } from './remark'

import type { MermaidConfig } from 'mermaid'
import mermaid from 'mermaid'
import panzoom from 'panzoom'

import {
  zoomInIcon,
  zoomOutIcon,
  fullscreenIcon,
  downloadIcon,
} from '../../icons'

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
        securityLevel: 'loose', // 允许更宽松的语法
        suppressErrorRendering: true,
        ...config
      });
      // 关闭全局错误解析
      mermaid.parseError = () => {};

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

function uuid() {
  let timestamp = new Date().getTime();
  let perforNow = (typeof performance !== 'undefined' && performance.now && performance.now() * 1000) || 0;
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    let random = Math.random() * 16;
    if (timestamp > 0) {
      random = (timestamp + random) % 16 | 0;
      timestamp = Math.floor(timestamp / 16);
    } else {
      random = (perforNow + random) % 16 | 0;
      perforNow = Math.floor(perforNow / 16);
    }
    return (c === 'x' ? random : (random & 0x3) | 0x8).toString(16);
  });
}

function downloadSvg(svgCode: string, type: string) {
  const namePrefix = `mermaid-diagram-${new Date().toISOString().replace(/-/g, "").slice(0, 8)}`;
  if ('png' === type) {
    //const svgString = new XMLSerializer().serializeToString(svgElement);
    let svgEle;
    try {
      svgEle = new DOMParser().parseFromString(svgCode, "text/xml").querySelector("svg");
    } catch(e) {
      console.error('DOMParser failed to parse mermaid-svg-code: ', e);
      return;
    }
    if (!svgEle) {
      console.error('DOMParser failed to parse mermaid-svg-code');
      return;
    }

    const svgW = svgEle.viewBox.baseVal.width, 
          svgH = svgEle.viewBox.baseVal.height;
    
    const svgCanvas = document.createElement("canvas");
    svgCanvas.width = 3 * svgW,
    svgCanvas.height = 3 * svgH,
    svgCanvas.style.width = svgW + 'px',
    svgCanvas.style.height = svgH + 'px';
    let svgCtx2d = svgCanvas.getContext("2d");
    if (!svgCtx2d) {
      console.error('no svg-convas-context2d');
      return;
    }
    svgCtx2d.fillStyle = "#fff";
    svgCtx2d.fillRect(0, 0, svgCanvas.width, svgCanvas.height);

    const img = new Image();
    img.addEventListener('load', () => {
      svgCtx2d.drawImage(img, 0, 0, svgCanvas.width, svgCanvas.height);
      svgCanvas.toBlob((d) => {
        if (!d) {
          return;
        }
        const url = URL.createObjectURL(d);
        const a = document.createElement("a");
        a.href = url;
        a.download = `mermaid-diagram-${new Date().toISOString().replace(/-/g, "").slice(0, 8)}.png`;
        a.click();
        URL.revokeObjectURL(url);
      }, "image/png");
    });
    const base64String = btoa(svgCode);
    const svgBase64 = `data:image/svg+xml;base64,${base64String}`;
    img.src = svgBase64;
    return;
  }

  // download as svg
  const blob = new Blob([svgCode], { type: "image/svg+xml" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = namePrefix + '.svg';
  a.click();
  URL.revokeObjectURL(url);
}

function renderMermaid(content: string) {
  const graphId = 'mermaid-'+ uuid();
  let dom = document.createElement('div');
  dom.className = 'milkdown-mermaid-preview-panel';
  dom.id = graphId;
  
  (function(divId) {
    const renderSvg = () => {
      const svgId = 'mermaid-svg-'+ divId;
      mermaid.render(svgId, content).then((output: any) => {
        let time = Date.now();
        let ele: HTMLElement | null;
        while (!(ele = document.querySelector('#'+ divId))) {
          if (Date.now() - time > 2000) {
            console.error('Mermaid渲染失败，没有找到渲染节点: div#'+ divId);
            return;
          }
        }
        if (!ele) {
          return;
        }

        //ele.innerHTML = output.svg;
        ele.innerHTML = `
        <div class="milkdown-mermaid-svg"></div>
        <div class="milkdown-mermaid-toolbar">
          <div class="toolbar-item" title="下载">
            <span class="toolbar-item-icon">${downloadIcon}</span>
            <div class="milkdown-dropdown-menu">
              <div class="milkdown-dropdown-menu-item" data-action="download_svg">下载SVG</div>
              <div class="milkdown-dropdown-menu-item" data-action="download_png">下载图片</div>
            </div>
          </div>
          <button class="toolbar-item" title="缩小" data-action="zoomout">${zoomOutIcon}</button>
          <button class="toolbar-item" title="放大" data-action="zoomin">${zoomInIcon}</button>
          <button class="toolbar-item" title="全屏查看" data-action="fullscreen">${fullscreenIcon}</button>
        </div>
        `;

        const svgPanel = ele.querySelector('.milkdown-mermaid-svg');
        if (!svgPanel) {
          return;
        }
        const svgCode = output.svg;
        svgPanel.innerHTML = svgCode;
        
        const svgImg = document.querySelector('#'+ svgId);
        if (!svgImg) {
          return;
        }
        // 绑定zoom-pan能力
        const pz = panzoom(svgImg as SVGElement, {
          maxZoom: 10,
          minZoom: 0.1,
          smoothScroll: false,
          beforeWheel: function(e) {
            // 按住ctrl+鼠标滚轮缩放
            const shouldIgnore = !e.ctrlKey;
            return shouldIgnore;
          }
        });

        const toolbar = ele.querySelector('.milkdown-mermaid-toolbar');
        if (!toolbar) {
          return;
        }
        toolbar.querySelectorAll('[data-action]').forEach(ele => {
          ele.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const action = (e.currentTarget as HTMLElement).getAttribute('data-action');
            switch (action) {
              case 'zoomin':
              case 'zoomout':
                if (pz) {
                  let rect = (svgImg as SVGGraphicsElement).getBBox();
                  let cx = rect.x + rect.width/2;
                  let cy = rect.y + rect.height/2;
                  pz.smoothZoom(cx, cy, 'zoomout' === action ? 0.5 : 1.5);
                }
                break;
              case 'download_svg':
                downloadSvg(svgCode, 'svg');
                break;
              case 'download_png':
                downloadSvg(svgCode, 'png');
                break;
            }
          });
        });

      });
    };

    try {
      // 先尝试完整解析, 为了增量渲染正确的部分
      // 配置了 suppressErrors = true, 当语法无效时不会抛出错误异常,而是返回false
      mermaid.parse(content, {suppressErrors: false})
        .then(() => {
          renderSvg();
        })
        .catch((err) => {
          console.error('>>>>> 渲染错误:', err);
        });
      
    } catch (e) {
      console.error(e);
    }
  })(graphId);

  return dom;
}
