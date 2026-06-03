import '../style.css';
import {
    ENGINE_CONFIG,
    buildTileRegistry,
    buildTileRegistryAsync,
    clampFloorZ,
    createEmptyWorldMap,
    ensureAllFloors,
    getAllFloorZs,
    getTerrainSpeedModifierAt,
    isStairHoleAtTile as engineIsStairHoleAtTile,
    loadMapFromJson,
    queryWalkable,
    type CollisionQueryContext,
    type WorldMap,
} from '../engine';
import { drawRegistryTile } from '../engine/tileDraw';
import { SpriteAnimationController } from '../character/spriteAnimation';
import type { CharacterSpriteConfig } from '../character/spriteAnimation';
import {
    createGridMovementController,
    setGridStepDuration,
    syncGridPlayerVisual,
} from '../movement/gridMovement';
import { PlayerMovement } from '../movement/playerMovement';
import { NpcAI } from '../character/npcAI';
import { GameEntity } from '../character/entity';
import { respawnEntitiesFromSpawns } from '../character/respawnEntities';
import { loadCreaturePresets } from '../editor/creaturePresets';
import { createDefaultCharacterSpeed, type CharacterSpeedState } from '../character/movementSpeed';
import { SpeedBuffManager } from '../character/speedBuffs';
import { resolveFullStepDuration } from '../character/characterMovement';
import { loadMapFile } from '../engine/worldLoader';
import { createEmptyLayerMap, getLayerCell, type LayerMap } from '../engine/mapPaintLayers';
import { collectBorderDrawTileIdsCached, buildBorderMaskTileIndex, invalidateBorderDrawCache } from '../engine/autoBorderEngine';
import { MAP_REGISTRY } from '../engine/mapRegistry';
import type { PortalData } from '../engine/types';
import {
    captureOverworldReturnIfNeeded,
    clearOverworldReturnContext,
    createMapInstanceFromTemplate,
    disposeActiveMapInstance,
    getActiveInstanceShortLabel,
    isInsideMapInstance,
} from '../engine/mapInstance';
import { DEFAULT_WS_PORT } from '../../shared/protocol';
import { GameNetClient } from '../net/gameNetClient';
import { createEnterTicket } from '../shared/enterTicket';
import type { CharacterRow } from '../shared/types';

const TILE_SIZE_SCREEN = ENGINE_CONFIG.TILE_SIZE;
const PLAY_BORDER_SET_ID = 'grass_edges';
const PLAY_FILL_TERRAIN = 'grass';
let TILE_TYPES = buildTileRegistry();
let activeMapSize: number = ENGINE_CONFIG.MAP_SIZE;
let worldMap: WorldMap = ensureAllFloors(createEmptyWorldMap());
let grassOverlayMap: LayerMap = createEmptyLayerMap();
let borderOverlayMap: LayerMap = createEmptyLayerMap();
let worldSpawns: import('../engine/types').CreatureSpawn[] = [];
let worldPortals: PortalData[] = [];
let currentMapId: string | undefined;
let isTransitioningMap = false;
let portalCooldownUntil = 0;
let previousPlayerTileKey = '';
let editingFloor = 0;

const player = {
    worldX: 50 * TILE_SIZE_SCREEN,
    worldY: 50 * TILE_SIZE_SCREEN,
    worldZ: 0,
    tileX: 50,
    tileY: 50,
};
const camera = { x: 0, y: 0 };
const keys: Record<string, boolean> = {};
const gridMovement = createGridMovementController();
const npcs: GameEntity[] = [];
const speedBuffs = new SpeedBuffManager();
const characterSpeed: CharacterSpeedState = createDefaultCharacterSpeed();

let activeCharacterController: SpriteAnimationController;
let gameNet: GameNetClient | null = null;

const canvas = document.getElementById('gameCanvas') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
ctx.imageSmoothingEnabled = false;
const statusPosEl = document.getElementById('statusPos');
const statusZEl = document.getElementById('statusZ');
const statusMapNameEl = document.getElementById('statusMapName');
const playCharNameEl = document.getElementById('playCharName');

function setActiveMapSize(size: number): void {
    activeMapSize = Math.min(ENGINE_CONFIG.MAP_SIZE, Math.max(8, size));
}

function createCollisionContext(): CollisionQueryContext {
    return {
        worldMap,
        tileRegistry: TILE_TYPES,
        mapSize: activeMapSize,
        tileSize: TILE_SIZE_SCREEN,
        minFloorZ: ENGINE_CONFIG.MIN_FLOOR_Z,
        maxFloorZ: ENGINE_CONFIG.MAX_FLOOR_Z,
        collisionEnabled: true,
        hasBoatEquipped: false,
        grassOverlay: grassOverlayMap,
    };
}

function isWalkable(tx: number, ty: number, z: number): boolean {
    const wx = tx * TILE_SIZE_SCREEN;
    const wy = ty * TILE_SIZE_SCREEN;
    return queryWalkable(createCollisionContext(), wx, wy, z).walkable;
}

function isStairHoleAtTile(tx: number, ty: number, z: number): boolean {
    return engineIsStairHoleAtTile(createCollisionContext(), tx, ty, z);
}

function getStepDurationForTile(tx: number, ty: number, z: number): number {
    const terrainModifier = getTerrainSpeedModifierAt(createCollisionContext(), tx, ty, z);
    return resolveFullStepDuration({
        stats: characterSpeed,
        role: 'Player',
        buffTotals: speedBuffs.getTotals(),
        terrainModifier,
    }).stepDurationMs;
}

function refreshPlayerMovementSpeed(nowMs = performance.now()): void {
    speedBuffs.tick(nowMs);
    const dur = getStepDurationForTile(player.tileX, player.tileY, player.worldZ);
    setGridStepDuration(gridMovement, dur);
}

function getPlayerTileKey(): string {
    return `${player.tileX}_${player.tileY}_${player.worldZ}`;
}

function resetPortalTriggerState(): void {
    previousPlayerTileKey = getPlayerTileKey();
    portalCooldownUntil = performance.now() + 700;
}

function updateActiveMapHud(): void {
    if (!statusMapNameEl) return;
    const entry = currentMapId ? MAP_REGISTRY.find((m) => m.id === currentMapId) : undefined;
    const baseName = entry?.name ?? currentMapId ?? '—';
    if (isInsideMapInstance()) {
        statusMapNameEl.textContent = `${baseName} · #${getActiveInstanceShortLabel()}`;
    } else {
        statusMapNameEl.textContent = baseName;
    }
}

function respawnEntities(): void {
    respawnEntitiesFromSpawns({
        spawns: worldSpawns,
        npcs,
        mapSize: activeMapSize,
        tileSize: TILE_SIZE_SCREEN,
    });
}

function applyLoadedMap(loaded: ReturnType<typeof loadMapFromJson>): void {
    const mapEntry = loaded.mapId ? MAP_REGISTRY.find((m) => m.id === loaded.mapId) : undefined;
    if (!mapEntry?.instanced) {
        disposeActiveMapInstance();
        clearOverworldReturnContext();
    }
    const mapSize = loaded.size ?? activeMapSize;
    worldMap = ensureAllFloors(loaded.worldMap, mapSize);
    grassOverlayMap = loaded.grassOverlay ?? createEmptyLayerMap(mapSize);
    borderOverlayMap = loaded.borderOverlay ?? createEmptyLayerMap(mapSize);
    setActiveMapSize(mapSize);
    worldSpawns.length = 0;
    worldSpawns.push(...(loaded.spawns || []));
    worldPortals.length = 0;
    worldPortals.push(...(loaded.portals || []));
    currentMapId = loaded.mapId;
    player.tileX = loaded.spawn.x;
    player.tileY = loaded.spawn.y;
    player.worldZ = clampFloorZ(loaded.spawn.z);
    syncGridPlayerVisual(player, TILE_SIZE_SCREEN);
    editingFloor = player.worldZ;
    refreshPlayerMovementSpeed();
    respawnEntities();
    resetPortalTriggerState();
    updateActiveMapHud();
    invalidateBorderDrawCache();
}

async function transitionToMap(
    targetMapId: string,
    overrideSpawn?: { x: number; y: number; z: number }
): Promise<void> {
    if (isTransitioningMap) return;
    const entry = MAP_REGISTRY.find((m) => m.id === targetMapId);
    if (!entry) return;
    isTransitioningMap = true;
    showLoading(`Carregando ${entry.name}…`);
    try {
        if (entry.instanced) {
            captureOverworldReturnIfNeeded(currentMapId, {
                x: player.tileX,
                y: player.tileY,
                z: player.worldZ,
            });
            disposeActiveMapInstance();
            const template = await loadMapFile(entry, TILE_TYPES);
            const { data } = createMapInstanceFromTemplate(entry.id, template);
            applyLoadedMap({ ...data, mapId: entry.id, spawn: overrideSpawn ?? data.spawn });
        } else {
            disposeActiveMapInstance();
            clearOverworldReturnContext();
            const loaded = await loadMapFile(entry, TILE_TYPES);
            applyLoadedMap({
                ...loaded,
                mapId: loaded.mapId ?? entry.id,
                spawn: overrideSpawn ?? loaded.spawn,
            });
        }
        if (overrideSpawn) {
            player.tileX = overrideSpawn.x;
            player.tileY = overrideSpawn.y;
            player.worldZ = clampFloorZ(overrideSpawn.z);
            syncGridPlayerVisual(player, TILE_SIZE_SCREEN);
        }
    } finally {
        isTransitioningMap = false;
        hideLoading();
    }
}

function showLoading(msg: string): void {
    const el = document.getElementById('loadingScreen');
    const m = document.getElementById('loadingMsg');
    if (m) m.textContent = msg;
    if (el) el.style.display = 'flex';
}

function hideLoading(): void {
    const el = document.getElementById('loadingScreen');
    if (el) {
        el.classList.add('fade-out');
        setTimeout(() => el.remove(), 500);
    }
}

function isEntityAtTile(tx: number, ty: number, z: number, excludeId?: string): boolean {
    if (excludeId !== 'player' && player.tileX === tx && player.tileY === ty && player.worldZ === z) {
        return true;
    }
    for (const npc of npcs) {
        if (npc.id !== excludeId && npc.tileX === tx && npc.tileY === ty && npc.worldZ === z) {
            return true;
        }
    }
    return false;
}

function update(): void {
    const nowMs = performance.now();
    NpcAI.tickNpcAI({
        nowMs,
        npcs,
        player,
        TILE_SIZE_SCREEN,
        MAP_SIZE: activeMapSize,
        isEntityAtTile,
        queryWalkable: (ctx, px, py, z) => queryWalkable(ctx, px, py, z),
        createCollisionContext: () => createCollisionContext(),
    });
    speedBuffs.tick(nowMs);
    const result = PlayerMovement.updateMovement({
        keys,
        player,
        gridMovement,
        activeCharacterController,
        camera,
        canvas,
        TILE_SIZE_SCREEN,
        MAP_SIZE: activeMapSize,
        ENGINE_CONFIG,
        editingFloor,
        isWalkable: (x, y, z) => isWalkable(x, y, z),
        isStairHoleAtTile,
        getStepDurationForTile,
        updateFloorButtons: () => {},
        refreshPlayerMovementSpeed,
        posXEl: document.getElementById('posX') as HTMLElement,
        posYEl: document.getElementById('posY') as HTMLElement,
        posZEl: document.getElementById('posZ') as HTMLElement,
    });
    editingFloor = result.editingFloor;

    const currentTileKey = getPlayerTileKey();
    const enteredNewTile = currentTileKey !== previousPlayerTileKey;
    if (enteredNewTile) previousPlayerTileKey = currentTileKey;

    if (
        enteredNewTile &&
        !isTransitioningMap &&
        worldPortals.length > 0 &&
        performance.now() >= portalCooldownUntil
    ) {
        const portal = worldPortals.find(
            (p) =>
                p.tileX === player.tileX &&
                p.tileY === player.tileY &&
                p.tileZ === player.worldZ
        );
        if (portal && MAP_REGISTRY.some((m) => m.id === portal.targetMapId)) {
            void transitionToMap(portal.targetMapId, {
                x: portal.targetX,
                y: portal.targetY,
                z: portal.targetZ,
            });
        }
    }

    if (statusPosEl) statusPosEl.textContent = `${player.tileX}, ${player.tileY}`;
    if (statusZEl) statusZEl.textContent = String(player.worldZ);
    gameNet?.syncPositionIfChanged();
}

function getPlayBorderDrawContext() {
    return {
        worldMap,
        grassOverlay: grassOverlayMap,
        borderOverlay: borderOverlayMap,
        registry: TILE_TYPES,
        fillTerrain: PLAY_FILL_TERRAIN,
        borderSetId: PLAY_BORDER_SET_ID,
    };
}

function draw(): void {
    ctx.fillStyle = '#0a0b0e';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const borderDrawCtx = getPlayBorderDrawContext();
    const borderMaskIndex = buildBorderMaskTileIndex(
        borderDrawCtx.registry,
        borderDrawCtx.borderSetId
    );

    getAllFloorZs().forEach((z) => {
        const isAbove = z > player.worldZ;
        let playerUnder = false;
        if (isAbove && worldMap[z]?.[player.tileY]?.[player.tileX] !== -1) {
            playerUnder = true;
        }
        ctx.globalAlpha = isAbove && playerUnder ? 0.3 : 1;

        const startX = Math.max(0, Math.floor(camera.x / TILE_SIZE_SCREEN));
        const endX = Math.min(activeMapSize - 1, Math.floor((camera.x + canvas.width) / TILE_SIZE_SCREEN));
        const startY = Math.max(0, Math.floor(camera.y / TILE_SIZE_SCREEN));
        const endY = Math.min(activeMapSize - 1, Math.floor((camera.y + canvas.height) / TILE_SIZE_SCREEN));

        for (let y = startY; y <= endY; y++) {
            for (let x = startX; x <= endX; x++) {
                const drawLayerTile = (tid: number | undefined) => {
                    if (tid === undefined || tid === -1) return;
                    const tile = TILE_TYPES[tid];
                    if (tile?.image?.complete) {
                        drawRegistryTile(
                            ctx,
                            tile,
                            x * TILE_SIZE_SCREEN - camera.x,
                            y * TILE_SIZE_SCREEN - camera.y,
                            TILE_SIZE_SCREEN
                        );
                    }
                };
                drawLayerTile(worldMap[z]?.[y]?.[x]);
                drawLayerTile(getLayerCell(grassOverlayMap, z, x, y));
                const grassTid = getLayerCell(grassOverlayMap, z, x, y);
                if (grassTid === ENGINE_CONFIG.EMPTY_TILE_ID) {
                    for (const borderTid of collectBorderDrawTileIdsCached(
                        borderDrawCtx,
                        z,
                        x,
                        y,
                        borderMaskIndex
                    )) {
                        drawLayerTile(borderTid);
                    }
                }
                const portal = worldPortals.find((p) => p.tileX === x && p.tileY === y && p.tileZ === z);
                if (portal && z === player.worldZ) {
                    const pulse = (Math.sin(Date.now() / 400) + 1) / 2;
                    ctx.fillStyle = `rgba(99, 102, 241, ${0.35 + pulse * 0.25})`;
                    ctx.fillRect(
                        x * TILE_SIZE_SCREEN - camera.x,
                        y * TILE_SIZE_SCREEN - camera.y,
                        TILE_SIZE_SCREEN,
                        TILE_SIZE_SCREEN
                    );
                }
            }
        }

        if (currentMapId && gameNet) {
            for (const remote of gameNet.getRemotePlayers(
                currentMapId,
                gameNet.getNetworkInstanceId()
            )) {
                if (remote.z !== z) continue;
                const rx = remote.tileX * TILE_SIZE_SCREEN - camera.x;
                const ry = remote.tileY * TILE_SIZE_SCREEN - camera.y;
                ctx.fillStyle = 'rgba(244, 114, 182, 0.85)';
                ctx.fillRect(rx + 10, ry + 10, TILE_SIZE_SCREEN - 20, TILE_SIZE_SCREEN - 20);
                ctx.fillStyle = '#fda4af';
                ctx.font = 'bold 8px sans-serif';
                ctx.textAlign = 'center';
                ctx.fillText(remote.name, rx + TILE_SIZE_SCREEN / 2, ry - 4);
            }
        }

        if (player.worldZ === z) {
            ctx.globalAlpha = 1;
            npcs.forEach((npc) => {
                if (npc.worldZ === z) npc.draw(ctx, camera, TILE_SIZE_SCREEN);
            });
            if (activeCharacterController.isLoaded && activeCharacterController.image) {
                const rect = activeCharacterController.getSourceRect();
                const drawX =
                    player.worldX - camera.x + (TILE_SIZE_SCREEN - rect.sw) / 2 + rect.ax;
                const drawY =
                    player.worldY - camera.y + (TILE_SIZE_SCREEN - rect.sh) + rect.ay;
                ctx.drawImage(
                    activeCharacterController.image,
                    rect.sx,
                    rect.sy,
                    rect.sw,
                    rect.sh,
                    drawX,
                    drawY,
                    rect.sw,
                    rect.sh
                );
            }
            ctx.fillStyle = '#38bdf8';
            ctx.font = 'bold 8px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(
                activeCharacterController.config.name,
                player.worldX - camera.x + TILE_SIZE_SCREEN / 2,
                player.worldY - camera.y - 4
            );
        }
    });
}

function loop(): void {
    update();
    draw();
    requestAnimationFrame(loop);
}

function resize(): void {
    const container = document.getElementById('canvasContainer')!;
    canvas.width = container.clientWidth;
    canvas.height = container.clientHeight;
    ctx.imageSmoothingEnabled = false;
}

function resolveGameServerUrl(): string | null {
    const env = import.meta.env.VITE_GAME_SERVER_WS;
    if (env === 'false' || env === '0') return null;
    if (env && env.length > 0) return env;
    if (import.meta.env.DEV) return `ws://localhost:${DEFAULT_WS_PORT}`;
    return null;
}

function setupNetwork(char: CharacterRow, accountId: string): void {
    const url = resolveGameServerUrl();
    if (!url) return;
    let ticket: string | undefined;
    void createEnterTicket(char.id, accountId, char.name).then((t) => {
        ticket = t;
    });

    gameNet = new GameNetClient({
        url,
        getEnterTicket: () => ticket,
        getLocalState: () => ({
            name: char.name,
            mapId: currentMapId ?? char.spawnMapId,
            instanceId: gameNet?.getNetworkInstanceId(),
            tileX: player.tileX,
            tileY: player.tileY,
            z: player.worldZ,
        }),
    });
    void createEnterTicket(char.id, accountId, char.name).then((t) => {
        ticket = t;
        gameNet!.connect();
    });
}

export async function startPlay(character: CharacterRow, accountId: string): Promise<void> {
    if (playCharNameEl) playCharNameEl.textContent = character.name;

    const outfit = character.outfitConfig as CharacterSpriteConfig;
    activeCharacterController = new SpriteAnimationController(outfit);

    const entry = MAP_REGISTRY.find((m) => m.id === character.spawnMapId) ?? MAP_REGISTRY[0];
    if (!entry) throw new Error('Mapa inicial não encontrado.');

    showLoading('Carregando mundo…');
    await loadCreaturePresets();
    TILE_TYPES = await buildTileRegistryAsync();
    const loaded = await loadMapFile(entry, TILE_TYPES);
    applyLoadedMap({ ...loaded, mapId: loaded.mapId ?? entry.id });

    window.addEventListener('keydown', (e) => {
        keys[e.key.toLowerCase()] = true;
    });
    window.addEventListener('keyup', (e) => {
        keys[e.key.toLowerCase()] = false;
    });
    window.addEventListener('resize', resize);
    resize();
    hideLoading();

    setupNetwork(character, accountId);
    loop();
}
