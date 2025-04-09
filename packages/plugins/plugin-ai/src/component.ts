import type { Component } from 'atomico'
import { c, html, useEffect } from 'atomico';
//import clsx from 'clsx';
import { AIConfig } from './config';

// yswang add custom-component: copilot

const copilotComponent: Component<AIConfig> = ({ enabled, base_url, model, api_key, prompts }) => {

  useEffect(() => {
    console.log('>>> copilotComponent init: ', enabled, base_url, model, api_key, prompts);
  }, []);

  return html`
    <host>
      <div>
        <h1>Copilot</h1>
      </div>
    </host>
  `;
};

copilotComponent.props = {
  enabled: Boolean,
  base_url: String,
  model: String,
  api_key: String,
  prompts: Object,
};

export const CopilotElement = c(copilotComponent);
if (customElements.get('milkdown-copilot') == null) {
    customElements.define('milkdown-copilot', CopilotElement);
}

