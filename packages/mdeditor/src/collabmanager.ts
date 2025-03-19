import { CollabService } from "@milkdown/plugin-collab";
import { WebsocketProvider } from 'y-websocket';
import { Doc } from 'yjs';

export class CollabManager {
    collabService: CollabService;
    wsProvider!: WebsocketProvider;
    doc!: Doc;

    constructor(collabService: CollabService) {
        this.collabService = collabService;
    }

    flush(template: string) {
        this.doc?.destroy();
        this.wsProvider?.destroy();

        const wsUrl = 'wss://demos.yjs.dev/ws';
        const wsRoom = 'milkdown';

        const randomColor = () => Math.floor(Math.random() * 16777215).toString(16);
        const user = {name: '测试用户' + Math.floor(Math.random() * 4), color: '#' + randomColor()};

        this.doc = new Doc();
        this.wsProvider = new WebsocketProvider(
            wsUrl,
            wsRoom,
            this.doc,
            { connect: true }
        );
        this.wsProvider.awareness.setLocalStateField('user', user);
        this.wsProvider.on('status', (payload: { status: string }) => {
            console.log('>>> 多人协作状态：', payload.status);
        });

        this.collabService
            .bindDoc(this.doc)
            .setAwareness(this.wsProvider.awareness);
        
        this.wsProvider.once('synced', async (isSynced: boolean) => {
            if (isSynced) {
                this.collabService.applyTemplate(template).connect();
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