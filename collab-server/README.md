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
let doc = new Doc();

// see https://tiptap.dev/docs/hocuspocus/provider/configuration
let provider = new HocuspocusProvider({
  url: "ws://127.0.0.1:2345",
  name: "doc_id/name_or_room_name",
  document: doc,
  connect: true,
  // 如果客户端需要进行认证，则需要配置此 token 属性，
  // 同时服务端也必须开启 onAuthenticate(){} 配置
  token: 't123456',
  // 可以发送一些额外请求参数
  parameters: {
    'param1': 'p001',
    'param2': 'p002',
  },
  // 当 WebSocket 连接创建时
  onOpen(data) {
    console.log('>>> onOpen');
  },
  // 当连接上websocket时
  onConnect() {
    console.log('>>> onConnect');
  },
  // 当感知发送变化时，通常是人员信息等
  /*onAwarenessUpdate(data) {
    console.log('>>> onAwarenessUpdate ', data.states);
  },
  onAwarenessChange(data) {
    console.log('>>> onAwarenessChange ', data);
  },*/
  // 当客户端已成功验证时
  onAuthenticated() {
    console.log('>>> onAuthenticated');
  },
  // 当客户端身份验证不成功时
  onAuthenticationFailed(data) {
    console.error('>>> onAuthenticationFailed: ', data);
  },
  // 当接收到消息时，这个方法会被高频的调用
  /*onMessage(data) {
    console.log('>>> onMessage: ', data);
  },*/
  /*onStatus(data) {

  },*/
  /*onSynced(data) {

  },*/
  // 当服务提供商断开连接时
  onDisconnect(data) {
    console.log('>>> onDisconnect: ', data);
  },
});

// 设置用户信息
provider.setAwarenessField("user", {"name":"user1", "color": "#ff0000"});
//provider.awareness.setLocalStateField('user', {"name":"user1", "color": "#ff0000"});

// 当连接状态发生改变时，接收websocket连接状态并显示: connecting | connected | disconnected
provider.on('status', (data: { status: string }) => {
  console.log(`>>> 当前连接状态：${data.status}`);
});

// 当Y.js文档同步成功时（初始化阶段）
provider.on('synced', (data: {state: boolean}) => {
  if (data && data.state) {
    // your code
  }
});

```


