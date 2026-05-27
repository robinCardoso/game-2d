import { createServer } from 'node:http';
import { WebSocketServer, type WebSocket } from 'ws';
import { DEFAULT_WS_PORT } from '../../shared/protocol.js';
import { GameRoom } from './GameRoom.js';
import { MapCollisionStore } from './MapCollisionStore.js';
import { MapInstanceStore } from './MapInstanceStore.js';

const PORT = Number(process.env.GAME_SERVER_PORT ?? DEFAULT_WS_PORT);
const collision = new MapCollisionStore();
const instances = new MapInstanceStore();
const room = new GameRoom(collision, instances);

await collision.loadAll();

const httpServer = createServer((_req, res) => {
    const stats = room.getStats();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
        JSON.stringify({
            service: 'game-2d-server',
            status: 'ok',
            online: stats.online,
            ws: `ws://localhost:${PORT}`,
            features: ['roomKey', 'walkable', 'instance_buckets'],
        })
    );
});

const wss = new WebSocketServer({ server: httpServer });

wss.on('connection', (socket: WebSocket) => {
    socket.on('message', (data) => {
        try {
            const raw = JSON.parse(data.toString());
            room.handleMessage(socket, raw);
        } catch {
            socket.send(
                JSON.stringify({
                    type: 'error',
                    v: 1,
                    code: 'PARSE_ERROR',
                    message: 'JSON inválido.',
                })
            );
        }
    });

    socket.on('close', () => room.handleDisconnect(socket));
    socket.on('error', () => room.handleDisconnect(socket));
});

httpServer.listen(PORT, () => {
    console.log(`[game-2d-server] HTTP  http://localhost:${PORT}`);
    console.log(`[game-2d-server] WS    ws://localhost:${PORT}`);
});
