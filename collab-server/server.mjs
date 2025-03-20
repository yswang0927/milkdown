import { Server } from "@hocuspocus/server";
import { Database } from "@hocuspocus/extension-database";
import { Redis } from "@hocuspocus/extension-redis";
import { Doc } from "yjs";
import pg from 'pg';


// 测试存储到pg数据库中
const dbClient = new pg.Client({
  host: '127.0.0.1',
  port: 5432,
  user: 'postgres',
  password: 'postgres@123',
  database: 'postgres',
  ssl: false
});
await dbClient.connect((err) => {
  if (err) {
    console.error('>>> 连接pg数据库失败：', err);
  }
  else {
    console.info('>>> 连接pg数据库成功');
  }
});



// 文档：https://tiptap.dev/docs/hocuspocus

const server = Server.configure({
  // 实例的名称，用于日志记录。
  name: 'markdown-collab-server',
  address: '127.0.0.1',
  port: 2345,
  // 连接健康检查间隔（以毫秒为单位）。
  timeout: 30000,
  // 在指定的时间内（以毫秒为单位）取消对 onStoreDocument 钩子的调用。否则，每个更新都会被保留下来。
  debounce: 5000,
  // 确保至少在给定的时间内（毫秒）调用 onStoreDocument。
  maxDebounce: 10000,
  // 默认情况下，服务器会显示启动屏幕。如果传递 false，服务器将静默启动。
  quiet: false,

  async onConnect(data) {
    console.log(`>>> New hocuspocus-websocket<${data.socketId}> connection created.`);
  },

  /**
   * https://tiptap.dev/docs/hocuspocus/server/hooks#on-authenticate
   * 当服务器收到来自客户端提供商的身份验证请求时，将调用onAuthenticate钩子。
   * 它应该返回一个 Promise。抛出异常或拒绝 Promise 将终止连接。
   * 请注意，仅在客户端发送了 Auth 消息后才会调用 onAuthenticate 钩子，
   * 如果没有向 HocuspocusProvider 提供令牌，则不会发生这种情况。
   * 
   * @param {*} data {
   *     documentName: string,
   *     instance: Hocuspocus,
   *     requestHeaders: IncomingHttpHeaders,
   *     requestParameters: URLSearchParams,
   *     request: IncomingMessage,
   *     socketId: string,
   *     token: string,
   *     connection: {
   *       readOnly: boolean,
   *     },
   *   } 
   */
  /*async onAuthenticate(data) {
    const { token } = data;

    // Demo示例
    if (token !== "t123456") {
      throw new Error("Not authorized!");
    }

    // 您可以设置上下文数据，以便在其他钩子中使用它
    return {
      user: {
        id: 1234,
        name: "John",
      },
    };
  },*/

  /**
   * 调用onLoadDocument钩子从存储中获取现有数据。
   * 您可能习惯在应用程序中加载一些 JSON/HTML 文档，但这不是 Y.js 的方式。
   * 为了让 Y.js 正常工作，我们需要存储更改历史记录。只有这样才能合并来自多个来源的更改。
   * 您仍然可以存储 JSON/HTML 文档，但将其更多地视为数据的“视图”，而不是数据源。
   * 
   * 实际上，甚至不必使用这两个钩子(onLoadDocument和onStoreDocument)！我们已经在它们之上以数据库扩展的形式创建了一个简单的抽象。
   * 
   * @param {*} data 
   * @returns 
   */
  /*async onLoadDocument(data) {
    console.log('>>>> onLoadDocument ', data.documentName);
    return new Doc();
  },*/

  /**
   * 当文档被更改时触发。
   * （与onChange相同，但已配置了防抖动）
   * 实际上，甚至不必使用这两个钩子(onLoadDocument和onStoreDocument)！我们已经在它们之上以数据库扩展的形式创建了一个简单的抽象。
   * 
   * @param {*} data 
   */
  /*async onStoreDocument(data) {
    console.log('>>> onStoreDocument', data.documentName);
  },*/

  /*async onListen(data) {
    console.log(`>>> Server is listening on port "${data.port}"!`);
  },*/

  onDisconnect(data) {
    console.log('>>> onDisconnect ', data.clientsCount, data.socketId);
  },

  async onDestroy(data) {
    dbClient.end();
    console.log(`>>> Server was shutdown!`);
  },

  extensions: [
    /* 当服务端水平扩展时，可以通过配置Redis来实现多个服务端节点之间的数据同步
      Redis 扩展与数据库扩展配合良好。一旦一个实例存储了文档，所有其他实例都会被阻止，以避免写入冲突。
    */
    /*new Redis({
      host: "127.0.0.1",
      port: 6379,
      options: {
        db: 6 // Database index to use.
      }
    }),*/
    new Database({
      fetch: async(data) => {
        return new Promise((resolve, reject) => {
          console.log('>>> 从数据库读取 ', data.documentName);
          let sql = "select data from yjs_data where doc_id = $1";
          dbClient.query(sql, [data.documentName], (err, result) => {
            if (err) {
              reject(err);
              return;
            }
            console.log('>>>>  fetch-from-db:', result.rowCount);
            if (result.rowCount == 0) {
              resolve(null);
            } else {
              // eg. rows = [{field: value, ...}]
              resolve(result.rows[0].data);
            }
          });

        });
      },
      store: async(data) => {
        console.log('>>> 存入数据库', data.state);
        let sql = "insert into yjs_data(doc_id, data) values($1, $2) on conflict (doc_id) do update set data = excluded.data";
        dbClient.query(sql, [data.documentName, data.state], (err, result) => {
          if (err) {
            reject(err);
            console.error('>>>  failed to save to db', err);
            return;
          }
          console.log('>>> save-to-db = ', result.rowCount);
          //resolve(result.rows[0]);
        });
      }
    })
  ]

});

server.listen();
