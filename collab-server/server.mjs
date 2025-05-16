import { Server } from "@hocuspocus/server";
import { Database } from "@hocuspocus/extension-database";
//import { Redis } from "@hocuspocus/extension-redis";
//import { Doc } from "yjs";
import { yXmlFragmentToProseMirrorRootNode } from 'y-prosemirror';

import {
  init,
  InitReady,
  initTimerCtx,
  remarkCtx,
  schema,
  schemaCtx,
  SchemaReady,
  serializerCtx,
  serializer,
  SerializerReady,
  parser,
  ParserReady,
  parserCtx,
} from '@milkdown/core';
import { Clock, Container, Ctx } from '@milkdown/ctx';
import { schema as commonSchema, commonmark } from '@milkdown/preset-commonmark';
import { schema as gfmSchema, gfm } from '@milkdown/preset-gfm';
import { ParserState, SerializerState } from '@milkdown/transformer';
import { TimerType } from './fake-timer.js';

import pg from 'pg';


// 测试存储到pg数据库中

// pg数据库连接池
const dbPool = new pg.Pool({
  host: '127.0.0.1',
  port: 5432,
  user: 'postgres',
  password: 'postgres@123',
  database: 'postgres',
  ssl: false,
  max: 20,
  min: 2,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
  maxLifetimeSeconds: 3600,
});

// 数据库扩展
const pgExtension = new Database({
  fetch: async ({documentName}) => {
    // 如果前面配置的 onAuthenticate 认证成功了，
    // 则可以从 data.context 获取到 onAuthenticate() 返回的值。
    // eg. let user = data.context;

    console.log('>>> 从数据库读取 ', documentName);

    const sql = "SELECT data FROM yjs_data WHERE doc_id = $1";
    const sqlParams = [documentName];

    const result = await dbPool.query(sql, sqlParams);
    if (result.rows.length > 0) {
      return result.rows[0].data;
    }

    return null;
  },

  store: async ({ documentName, document, state }) => {
    /*
    // 在nodejs服务端创建milkdown解析器
    const clock = new Clock();
    const container = new Container();
    const ctx = new Ctx(container, clock);

    const runInit = init({})(ctx);
    const runSchema = schema(ctx);
    //const runParser = parser(ctx);
    //const runSerializer = serializer(ctx);

    const hackTimer = (name, target) => {
      const fake = new TimerType(name);
      fake.id = target.id;
      const result = fake.create(clock.store);
      clock.store.set(target.id, result);
      return result;
    };

    hackTimer('InitReady', InitReady);
    hackTimer('SchemaReady', SchemaReady);
    //hackTimer('ParserReady', ParserReady);
    //hackTimer('SerializerReady', SerializerReady);

    ctx.set(initTimerCtx, []);

    const allSchemas = [commonSchema, gfmSchema].flat(2);
    await Promise.all([
      runInit(),
      runSchema(),
      //runParser(),
      //runSerializer(),
      ...allSchemas.map((node) => node(ctx)()),
    ]);

    const S = ctx.get(schemaCtx);
    const R = ctx.get(remarkCtx);
    //const P = ctx.get(parserCtx);
    //const SS = ctx.get(serializerCtx);
    //const parser = ParserState.create(S, R);
    const serializer2 = SerializerState.create(S, R);

    const xmlFragment = document.getXmlFragment('prosemirror');
    const pmNode = yXmlFragmentToProseMirrorRootNode(xmlFragment, S);
    let markdownContent = serializer2(pmNode);
    console.log('>> markdownContent: \n', markdownContent);
    */

    const sql = "INSERT INTO yjs_data(doc_id, data) VALUES($1, $2) ON CONFLICT(doc_id) DO UPDATE SET data = EXCLUDED.data";
    const sqlParams = [documentName, state];

    try {
      const result = await dbPool.query(sql, sqlParams);
      console.log('>>> save-to-db = ', result.rowCount);
    } catch (e) {
      console.error('>>> failed-save-to-db ', e);
      throw e;
    }
  }
});
// 在 Hocuspocus 服务器启动之前，对插件进行配置和初始化
pgExtension.onConfigure = async (data) => {
  // 启动时创建yjs数据表
  const table_ddl = `CREATE TABLE IF NOT EXISTS public.yjs_data (
    "doc_id" varchar(255) NOT NULL,
    "data" bytea NULL,
    CONSTRAINT yjs_data_pk PRIMARY KEY (doc_id)
  )`;
  await dbPool.query(table_ddl);
  console.log('>>> create-table-if-notexists: ');
};

// 注册服务端扩展包
const serverExtensions = [
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

  // 使用这个数据库扩展，可以替代 onStoreDocument 和 onLoadDocument 两者。
  pgExtension,
];

// 文档：https://tiptap.dev/docs/hocuspocus/server/configuration

const server = Server.configure({
  // 实例的名称，用于日志记录。
  name: 'markdown-collab-server',
  address: '0.0.0.0',
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
    // 如果需要针对某个连接客户端禁用认证，可以这样配置
    //data.connection.requiresAuthentication = false;
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
  async onAuthenticate(data) {
    console.info('>>> onAuthenticate: ', data.token, data.requestParameters);
    const { token } = data;

    // Demo示例
    if (token !== "t123456") {
      throw new Error("Not authorized!");
    }

    // 您可以设置上下文数据，以便在其他钩子中使用它
    // 示例：返回一个用户信息
    return {
      user: {
        id: 1234,
        name: "John"
      }
    };
  },

  /**
   * 调用onLoadDocument钩子从存储中获取现有数据。
   * 您可能习惯在应用程序中加载一些 JSON/HTML 文档，但这不是 Y.js 的方式。
   * 为了让 Y.js 正常工作，我们需要存储更改历史记录。只有这样才能合并来自多个来源的更改。
   * 您仍然可以存储 JSON/HTML 文档，但将其更多地视为数据的“视图”，而不是数据源。
   *
   * 实际上，甚至不必使用这两个钩子(onLoadDocument和onStoreDocument)！
   * 我们已经在它们之上以数据库扩展的形式创建了一个简单的抽象。
   */
  /*async onLoadDocument(data) {
    console.log('>>>> onLoadDocument ', data.documentName);
    return new Doc();
  },*/

  /**
   * 当文档被更改时触发， 与onChange相同，但已配置了防抖。
   *
   * 实际上，甚至不必使用这两个钩子(onLoadDocument和onStoreDocument)！
   * 我们已经在它们之上以数据库扩展的形式创建了一个简单的抽象。
   */
  /*async onStoreDocument(data) {
    console.log('>>> onStoreDocument', data.documentName);
  },*/

  /*async onListen(data) {
    console.log(`>>> Server is listening on port "${data.port}"!`);
  },*/

  async onDisconnect(data) {
    console.log('>>> onDisconnect ', data.clientsCount, data.socketId);
  },

  async onDestroy(data) {
    dbPool.end(() => {
      console.log('>>> Node-PG pool shutdown!');
    });
    console.log(`>>> Server was shutdown!`);
  },

  extensions: serverExtensions

});

server.listen();
