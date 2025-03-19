# 这是我基于 milkdown 封装的编辑器，提供独立的 css 和 js 文件，方便使用

## 使用

```html
<link rel="stylesheet" href="./mdeditor.css">
<script src="./mdeditor.umd.js"></script>

<div id="editor"></div>

<script>
    const editor = new mdeditor.MarkdownEditor('#editor', {
        defaultValue: '#你好，Markdown! \n\n 数学公式：$e=mc^2$',
        onReady: () => {
            console.log('目录信息：', editor.getToc());
        },
        onContentChanged: (mdContent) => {
            console.log('实时目录信息：', editor.getToc());
        }
    });
</script>
```
