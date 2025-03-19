# @milkdown/plugin-underline

## 💥 下划线语法解析器插件

用于将 `__text__` 语法解析为 `<u>text</u>`。

## 1️⃣ 使用

```ts
import { underlinePlugin } from '@milkdown/plugin-underline'

// 在插件列表中添加 underlinePlugin
editor.use(underlinePlugin)
```

## 2️⃣ 快捷键

- `Mod-u` 切换高亮状态

## 3️⃣ 示例

```md
__这里的文字会有下划线__
```

