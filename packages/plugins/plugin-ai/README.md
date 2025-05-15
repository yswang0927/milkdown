# @milkdown/plugin-ai

## 💥 AI写作插件

## 1️⃣ 使用

```ts
import { aiPlugin, aiConfig } from '@milkdown/plugin-ai'

// 配置
editor.config((ctx) => {
  ctx.update(aiConfig.key, (prev) => ({
    ...prev,
    enabled: true,
    baseUrl: 'http://127.0.0.1:11434',
    model: 'deepseek-r1:7b',
    apiKey: '',
  }));
});

// 使用插件
editor.use(aiPlugin)
```

## 涉及修改内容
`crepe/src/feature/toolbar/component.tsx`
`crepe/src/feature/index.ts`:
```
export const defaultFeatures: Record<CrepeFeature, boolean> = {
  // yswang 修改 Cursor 为: false, 否则AI-copilot无法获取光标焦点
  [CrepeFeature.Cursor]: false,
}
``
