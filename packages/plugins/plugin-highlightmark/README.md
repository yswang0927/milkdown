# @milkdown/plugin-highlightmark

## 💥 背景黄色高亮语法解析器插件

用于将 `==text==` 语法解析为 `<mark>text</mark>`。

## 1️⃣ 使用

```ts
import { highlightMarkPlugin } from '@milkdown/plugin-highlightmark'

// 在插件列表中添加 highlightMarkPlugin
editor.use(highlightMarkPlugin)
```

## 2️⃣ 快捷键

- `Mod-m` 切换高亮状态

## 3️⃣ 示例

```md
==这里的文字会被高亮==
```

