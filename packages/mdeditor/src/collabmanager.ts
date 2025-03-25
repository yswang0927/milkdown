import { CollabService } from "@milkdown/plugin-collab";
import { WebsocketProvider } from 'y-websocket';
import { Doc } from 'yjs';
import { HocuspocusProvider } from "@hocuspocus/provider";

import { names } from "./names";


const randomColor = () => Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0');
const demo_users = names.map((n) => ({
    color: `#${randomColor()}`,
    name: n,
}));

export class CollabManager {
    private collabService: CollabService;
    private wsProvider!: HocuspocusProvider;
    private doc!: Doc;
    private currentUser;

    constructor(collabService: CollabService) {
        this.collabService = collabService;

        this.currentUser = demo_users[Math.floor(Math.random() * 4)];
    }

    flush(template: string) {
        this.doc?.destroy();
        this.wsProvider?.destroy();

        const wsUrl = 'ws://127.0.0.1:2345';
        const wsRoom = 'milkdown';

        this.doc = new Doc();

        this.wsProvider = new HocuspocusProvider({
            url: wsUrl,
            name: wsRoom,
            document: this.doc,
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
             // 当客户端已成功验证时
             onAuthenticated() {
                console.log('>>> onAuthenticated');
            },
            // 当客户端身份验证不成功时
            onAuthenticationFailed(data) {
                console.error('>>> onAuthenticationFailed: ', data);
            },
            // 当感知发送变化时，通常是人员信息等
            onAwarenessUpdate(data) {
                // eg. data.states = [{clientId:2233, user:{name, color}, cursor?}, {}]
                console.log(`>>> 当前参与人员： [${data.states.map(s => s.user.name)}]`, data.states);
            },
            /*onAwarenessChange(data) {
                console.log('>>> onAwarenessChange ', data);
            },*/
            // 当接收到消息时，这个方法会被高频的调用
            /*onMessage(data) {
                console.log('>>> onMessage: ', data);
            },*/
            // 当服务提供商断开连接时
            onDisconnect(data) {
                console.log('>>> onDisconnect: ', data);
            },
        });

        // 当连接状态发生改变时，接收websocket连接状态并显示: connecting | connected | disconnected
        this.wsProvider.on('status', (data: { status: string }) => {
            // 连接状态
            console.log('>>> 当前连接状态：' + data.status);
        });

        // 设置当前用户
        this.wsProvider.setAwarenessField("user", this.currentUser);

        this.collabService.bindDoc(this.doc).setAwareness(this.wsProvider.awareness!);

        // 当Y.js文档同步成功时（初始化阶段）
        this.wsProvider.on('synced', (data: {state: boolean}) => {
            if (data && data.state) {
                //this.collabService.applyTemplate(template).connect();
                this.collabService.connect();
            }
        });
    }

    connect() {
        this.wsProvider.connect();
        this.collabService.connect();
    }

    disconnect() {
        this.collabService.disconnect();
        this.wsProvider.disconnect();
    }

    applyTemplate(template: string) {
        this.collabService
          .disconnect()
          .applyTemplate(template, () => true)
          .connect();
    }

}