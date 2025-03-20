# 使用 Hocuspocus 提供多人协作能力的 Websocket 服务后端

> yswang 2025/03/20
>
> Hocuspocus：一个成熟的服务器端解决方案，支持构建稳健且高度可扩展的协作/离线优先应用。
>
> Hocuspocus文档：https://tiptap.dev/docs/hocuspocus
>
> github: https://github.com/ueberdosis/hocuspocus
>

此服务后端支持将yjs协作数据保存到数据库中和从数据库中读取。

启动后端服务： `node server.mjs`

------

前端使用方式：

```js
let provider = new HocuspocusProvider({
  url: "ws://127.0.0.1:2345",
  name: 'doc_id_or_name_or_room_name',
  document: Doc,
  connect: true,
  onAwarenessUpdate({ states }) {
    console.log('>>> onAwarenessUpdate ', states);
  },
});

provider.setAwarenessField("user", {"name":"user1", "color": "#ff0000"});
//provider.awareness.setLocalStateField('user', {"name":"user1", "color": "#ff0000"});

providerrovider.on('status', (payload: { status: string }) => {
  this.doms.status.textContent = payload.status;
});

```


