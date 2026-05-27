import type {
    ClientMessage,
    PlayerSnapshot,
    ServerMessage,
} from '../../shared/protocol';
import { PROTOCOL_VERSION } from '../../shared/protocol';
import { sameRoom } from '../../shared/roomKey';
import { getMapEntry } from '../engine/mapRegistry';

export type NetStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface GameNetClientOptions {
    url: string;
    getEnterTicket?: () => string | undefined;
    getLocalState: () => {
        name: string;
        mapId: string;
        instanceId?: string | null;
        tileX: number;
        tileY: number;
        z: number;
    };
    onStatusChange?: (status: NetStatus) => void;
    /** Servidor atribuiu instanceId (dungeon instanciada). */
    onServerInstanceId?: (instanceId: string | undefined) => void;
    /** Servidor corrigiu posição após movimento inválido. */
    onPositionCorrection?: (pos: {
        mapId: string;
        instanceId?: string;
        tileX: number;
        tileY: number;
        z: number;
    }) => void;
}

/**
 * Cliente WebSocket — join, salas mapId@instanceId, sync de tile.
 */
export class GameNetClient {
    private ws: WebSocket | null = null;
    private status: NetStatus = 'disconnected';
    private localPlayerId: string | null = null;
    /** instanceId da sala de rede (pode vir do servidor em mapas instanciados). */
    private networkInstanceId: string | undefined;
    private remotePlayers = new Map<string, PlayerSnapshot>();
    private lastSynced = {
        mapId: '',
        instanceId: undefined as string | undefined,
        tileX: -1,
        tileY: -1,
        z: -999,
    };
    private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    private shouldReconnect = false;

    constructor(private readonly options: GameNetClientOptions) {}

    getStatus(): NetStatus {
        return this.status;
    }

    getLocalPlayerId(): string | null {
        return this.localPlayerId;
    }

    getNetworkInstanceId(): string | undefined {
        return this.networkInstanceId;
    }

    /** Outros jogadores na mesma sala (mapId + instanceId). */
    getRemotePlayers(mapId: string, instanceId?: string | null): PlayerSnapshot[] {
        const local = {
            mapId,
            instanceId: instanceId ?? this.networkInstanceId ?? undefined,
        };
        return [...this.remotePlayers.values()].filter(
            (p) =>
                p.playerId !== this.localPlayerId &&
                sameRoom(
                    { mapId: p.mapId, instanceId: p.instanceId },
                    local
                )
        );
    }

    isConnected(): boolean {
        return this.status === 'connected' && this.ws?.readyState === WebSocket.OPEN;
    }

    connect(): void {
        if (this.ws?.readyState === WebSocket.OPEN || this.ws?.readyState === WebSocket.CONNECTING) {
            return;
        }
        this.shouldReconnect = true;
        this.setStatus('connecting');

        const ws = new WebSocket(this.options.url);
        this.ws = ws;

        ws.onopen = () => {
            this.setStatus('connected');
            this.sendJoin();
        };

        ws.onmessage = (ev) => {
            try {
                const msg = JSON.parse(String(ev.data)) as ServerMessage;
                this.handleServerMessage(msg);
            } catch (err) {
                console.warn('[GameNet] mensagem inválida:', err);
            }
        };

        ws.onerror = () => this.setStatus('error');

        ws.onclose = () => {
            this.ws = null;
            this.localPlayerId = null;
            this.networkInstanceId = undefined;
            this.remotePlayers.clear();
            this.setStatus('disconnected');
            this.scheduleReconnect();
        };
    }

    disconnect(): void {
        this.shouldReconnect = false;
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        if (this.ws?.readyState === WebSocket.OPEN) {
            this.send({ type: 'leave', v: PROTOCOL_VERSION });
        }
        this.ws?.close();
        this.ws = null;
        this.localPlayerId = null;
        this.networkInstanceId = undefined;
        this.remotePlayers.clear();
        this.setStatus('disconnected');
    }

    /** Chamar após movimento ou troca de mapa no loop do jogo. */
    syncPositionIfChanged(): void {
        if (!this.isConnected()) return;

        const state = this.options.getLocalState();
        const instanceId = state.instanceId ?? this.networkInstanceId ?? undefined;
        const { mapId, tileX, tileY, z } = state;
        const last = this.lastSynced;

        if (
            last.mapId === mapId &&
            last.instanceId === instanceId &&
            last.tileX === tileX &&
            last.tileY === tileY &&
            last.z === z
        ) {
            return;
        }

        const mapChanged = last.mapId !== '' && (last.mapId !== mapId || last.instanceId !== instanceId);
        if (mapChanged && !getMapEntry(mapId)?.instanced) {
            this.networkInstanceId = undefined;
        }
        if (mapChanged) {
            this.send({
                type: 'map_change',
                v: PROTOCOL_VERSION,
                mapId,
                instanceId,
                tileX,
                tileY,
                z,
            });
        } else {
            this.send({
                type: 'move',
                v: PROTOCOL_VERSION,
                mapId,
                instanceId,
                tileX,
                tileY,
                z,
            });
        }

        this.lastSynced = { mapId, instanceId, tileX, tileY, z };
    }

    private scheduleReconnect(): void {
        if (!this.shouldReconnect || this.reconnectTimer) return;
        this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            if (this.shouldReconnect) this.connect();
        }, 3000);
    }

    private setStatus(status: NetStatus): void {
        if (this.status === status) return;
        this.status = status;
        this.options.onStatusChange?.(status);
    }

    private sendJoin(): void {
        const state = this.options.getLocalState();
        const instanceId = state.instanceId ?? this.networkInstanceId ?? undefined;
        this.lastSynced = {
            mapId: '',
            instanceId: undefined,
            tileX: -1,
            tileY: -1,
            z: -999,
        };
        this.send({
            type: 'join',
            v: PROTOCOL_VERSION,
            name: state.name,
            mapId: state.mapId,
            instanceId,
            enterTicket: this.options.getEnterTicket?.(),
            tileX: state.tileX,
            tileY: state.tileY,
            z: state.z,
        });
    }

    private send(msg: ClientMessage): void {
        if (this.ws?.readyState !== WebSocket.OPEN) return;
        this.ws.send(JSON.stringify(msg));
    }

    private handleServerMessage(msg: ServerMessage): void {
        if (msg.v !== PROTOCOL_VERSION) {
            console.warn('[GameNet] versão de protocolo incompatível:', msg.v);
            return;
        }

        switch (msg.type) {
            case 'welcome':
                this.localPlayerId = msg.playerId;
                if (msg.instanceId) {
                    this.networkInstanceId = msg.instanceId;
                    this.options.onServerInstanceId?.(msg.instanceId);
                }
                this.remotePlayers.clear();
                for (const p of msg.players) {
                    this.remotePlayers.set(p.playerId, p);
                }
                {
                    const s = this.options.getLocalState();
                    const instanceId = s.instanceId ?? this.networkInstanceId;
                    this.lastSynced = {
                        mapId: s.mapId,
                        instanceId,
                        tileX: s.tileX,
                        tileY: s.tileY,
                        z: s.z,
                    };
                }
                console.log(
                    `[GameNet] conectado como ${msg.playerId}` +
                        (msg.instanceId ? ` · sala inst_${msg.instanceId.slice(-8)}` : '') +
                        ` · ${msg.players.length} jogador(es) na sala`
                );
                break;
            case 'instance_assigned':
                this.networkInstanceId = msg.instanceId;
                this.options.onServerInstanceId?.(msg.instanceId);
                this.lastSynced.instanceId = msg.instanceId;
                console.log(
                    `[GameNet] sala instanciada: …${msg.instanceId.slice(-8)} (${msg.mapId})`
                );
                break;
            case 'player_joined':
                this.remotePlayers.set(msg.player.playerId, msg.player);
                break;
            case 'player_left':
                this.remotePlayers.delete(msg.playerId);
                break;
            case 'player_moved': {
                const existing = this.remotePlayers.get(msg.playerId);
                if (existing) {
                    existing.tileX = msg.tileX;
                    existing.tileY = msg.tileY;
                    existing.z = msg.z;
                    existing.mapId = msg.mapId;
                    existing.instanceId = msg.instanceId;
                } else {
                    this.remotePlayers.set(msg.playerId, {
                        playerId: msg.playerId,
                        name: 'Jogador',
                        mapId: msg.mapId,
                        instanceId: msg.instanceId,
                        tileX: msg.tileX,
                        tileY: msg.tileY,
                        z: msg.z,
                    });
                }
                break;
            }
            case 'state_sync':
                this.remotePlayers.clear();
                for (const p of msg.players) {
                    if (p.playerId !== this.localPlayerId) {
                        this.remotePlayers.set(p.playerId, p);
                    }
                }
                break;
            case 'position_correction':
                this.lastSynced = {
                    mapId: msg.mapId,
                    instanceId: msg.instanceId,
                    tileX: msg.tileX,
                    tileY: msg.tileY,
                    z: msg.z,
                };
                this.options.onPositionCorrection?.({
                    mapId: msg.mapId,
                    instanceId: msg.instanceId,
                    tileX: msg.tileX,
                    tileY: msg.tileY,
                    z: msg.z,
                });
                break;
            case 'error':
                console.warn(`[GameNet] ${msg.code}: ${msg.message}`);
                break;
            case 'pong':
                break;
        }
    }
}
