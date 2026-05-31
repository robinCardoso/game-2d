import './style.css';
import { HistoryManager } from './functions/history';
import { mergeCustomTileProperties } from './functions/tileConfig';
import { AccountType, getRolePermissions } from './functions/roles';
import { toast, popup } from './utils/popup';
import { saveMapDocumentToDevPublic, saveTileCatalogToDevPublic } from './utils/mapDevSave';
import {
    captureOverworldReturnIfNeeded,
    clearOverworldReturnContext,
    createMapInstanceFromTemplate,
    disposeActiveMapInstance,
    getActiveInstanceShortLabel,
    isInsideMapInstance,
} from './engine/mapInstance';
import { SpriteAnimationController } from './character/spriteAnimation';
import { createDefaultCharacterConfig } from './character/characterSerializer';
import { respawnEntitiesFromSpawns } from './character/respawnEntities';
import { GameEntity } from './character/entity';
import { initCharacterEditor, setSpriteEditorProfile, getSpriteEditorFlyoutTitle, type SpriteProfileId } from './editor/characterEditor';
import { initMapSpriteEditor, setMapSpriteAfterSaveHandler } from './editor/mapSpriteEditor';
import { NpcAI } from './character/npcAI';
import {
    ENGINE_CONFIG,
    buildTileRegistryAsync,
    mergeRuntimeTileProperties,
    takeVariantStripMismatches,
    clampFloorZ,
    collectSparseTiles,
    createEmptyWorldMap,
    ensureAllFloors,
    getAllFloorZs,
    getTerrainSpeedModifierAt,
    isStairHoleAtTile as engineIsStairHoleAtTile,
    loadMapFromJson,
    queryWalkable,
    serializeMapDocument,
    formatMapDocumentJson,
    type CollisionQueryContext,
    type WorldMap,
} from './engine';
import { initFloorSelector, type FloorSelectorController } from './editor/floorSelector';
import { initEditorShell, type EditorShellController } from './editor/menuBar';
import { resolveFullStepDuration } from './character/characterMovement';
import {
    buildMovementSnapshot,
    logMovementCompare,
} from './character/movementDebug';
import {
    createDefaultCharacterSpeed,
    stepDurationToTilesPerSecond,
    type CharacterSpeedState,
} from './character/movementSpeed';
import { SpeedBuffManager } from './character/speedBuffs';
import {
    calculateEquipmentSpeedBonus,
    createDefaultEquipment,
    describeEquipment,
    equipItem,
    type EquipmentState,
} from './character/equipment/equipment';
import {
    createGridMovementController,
    initGridPlayerPosition,
    setGridStepDuration,
    syncGridPlayerVisual,
} from './movement/gridMovement';
import { PlayerMovement } from './movement/playerMovement';
import { DEFAULT_WS_PORT } from '../shared/protocol';
import { GameNetClient } from './net/gameNetClient';
import { getStudioBoot, isStudioMode } from './studio/studioBoot';
import {
    resolveStudioMapIdToLoad,
    writeStudioLastMapId,
} from './studio/studioMapSession';
import { drawRegistryTile } from './engine/tileDraw';
import {
    attachVariantBrushes,
    findVariantBrushForTileId,
    formatVariantGroupLabel,
    getVariantGroupForBrush,
    getVariantSelectionSummary,
    isVariantBrush,
    loadVariantGroupManifest,
    resolvePaintTileId,
} from './engine/tileVariants';

// --- ENGINE ---
const TILE_SIZE_SCREEN = ENGINE_CONFIG.TILE_SIZE;
/** Tamanho N×N do mapa ativo (atualizado ao carregar/importar outro MapDocument). */
let activeMapSize: number = ENGINE_CONFIG.MAP_SIZE;
export let TILE_TYPES: import('./engine/types').TileRegistry = {
    [ENGINE_CONFIG.EMPTY_TILE_ID]: {
        id: ENGINE_CONFIG.EMPTY_TILE_ID,
        name: 'Vazio',
        walkable: false,
        category: 'all',
    },
};

let worldMap: WorldMap = ensureAllFloors(createEmptyWorldMap());
let worldMetadata: Record<string, import('./engine/types').TileMetadata> = {};
let worldHouses: Record<number, import('./engine/types').HouseData> = {};
let mapSpawn = { x: 50, y: 50, z: 0 };
let floorSelector: FloorSelectorController;

function createCollisionContext(): CollisionQueryContext {
    const permissions = getRolePermissions(currentRole);
    const noclip =
        permissions.canToggleCollision &&
        collisionToggle &&
        !collisionToggle.checked;
    return {
        worldMap,
        tileRegistry: TILE_TYPES,
        mapSize: activeMapSize,
        tileSize: TILE_SIZE_SCREEN,
        minFloorZ: ENGINE_CONFIG.MIN_FLOOR_Z,
        maxFloorZ: ENGINE_CONFIG.MAX_FLOOR_Z,
        collisionEnabled: !noclip,
        hasBoatEquipped: !!(boatToggle && boatToggle.checked),
    };
}

// --- CONTROLES E MÓDULOS MODULARES ---
import { initMapEditor, floodFill, floodFillRandom, type MapEditorController } from './editor/mapEditor';
import {
    PAINT_BRUSH_SIZE_OPTIONS,
    getBrushFootprint,
    iterBrushCells,
    type PaintBrushSize,
} from './editor/paintBrush';
import { ZoneType, ZONE_COLORS } from './engine/zones';
import { initHouseManager } from './editor/houseManager';
import { initSpawnEditor, getSpawnDisplayColor } from './editor/spawnEditor';
import { loadCreaturePresets } from './editor/creaturePresets';
import { initPortalEditor } from './editor/portalEditor';
import { loadMapFile } from './engine/worldLoader';
import { MAP_REGISTRY, registerMap, type MapEntry } from './engine/mapRegistry';
import type { PortalData } from './engine/types';
import { initMapManagerUI, promptCreateNewMap, ensureMapEntryForSave } from './editor/mapManager';

let mapEditorController: MapEditorController;
let spawnEditorController: ReturnType<typeof initSpawnEditor>;
let portalEditorController: ReturnType<typeof initPortalEditor>;
let editingFloor = 0;

let activeMapEditorTab = 'paint';
let paintBrushSize: PaintBrushSize = 1;
let paintBrushPreview: { tx: number; ty: number } | null = null;
let selectedZoneType: ZoneType = ZoneType.NORMAL;
let selectedHouseId: number = 1;
let worldSpawns: import('./engine/types').CreatureSpawn[] = [];
let worldPortals: PortalData[] = [];
let currentMapId: string | undefined = undefined;
let isTransitioningMap = false;
let portalCooldownUntil = 0;
/** Tile onde o jogador estava no frame anterior (detecção de entrada em portal). */
let previousPlayerTileKey = '';

// --- ELEMENTOS DOM ---
const canvas = document.getElementById('gameCanvas') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
ctx.imageSmoothingEnabled = false;
const minimapCanvas = document.getElementById('minimapCanvas') as HTMLCanvasElement;
const mCtx = minimapCanvas.getContext('2d')!;
mCtx.imageSmoothingEnabled = false;
const posXEl = document.getElementById('posX')!;
const posYEl = document.getElementById('posY')!;
const posZEl = document.getElementById('posZ')!;
const posSpeedEl = document.getElementById('posSpeed')!;
const posStepMsEl = document.getElementById('posStepMs')!;
const posStepBaseMsEl = document.getElementById('posStepBaseMs')!;
const posTerrainModEl = document.getElementById('posTerrainMod')!;
const posEquipEl = document.getElementById('posEquip')!;
const posBuffsEl = document.getElementById('posBuffs')!;
const posTilesPerSecEl = document.getElementById('posTilesPerSec')!;
const posStepDeltaEl = document.getElementById('posStepDelta')!;
const devEquipHasteBootsBtn = document.getElementById('devEquipHasteBoots');
const devEquipLeatherBootsBtn = document.getElementById('devEquipLeatherBoots');
const devBuffHasteBtn = document.getElementById('devBuffHaste');
const devBuffSlowBtn = document.getElementById('devBuffSlow');
const devClearBuffsBtn = document.getElementById('devClearBuffs');
const undoBtn = document.getElementById('undoBtn') as HTMLButtonElement;
const redoBtn = document.getElementById('redoBtn') as HTMLButtonElement;
const undoBtnFlyout = document.getElementById('undoBtnFlyout') as HTMLButtonElement;
const redoBtnFlyout = document.getElementById('redoBtnFlyout') as HTMLButtonElement;
const quickUndo = document.getElementById('quickUndo') as HTMLButtonElement;
const quickRedo = document.getElementById('quickRedo') as HTMLButtonElement;
const statusPosEl = document.getElementById('statusPos')!;
const statusZEl = document.getElementById('statusZ')!;
const statusSpeedEl = document.getElementById('statusSpeed')!;
const statusStepMsEl = document.getElementById('statusStepMs')!;
const statusRoleEl = document.getElementById('statusRole')!;
const statusMapNameEl = document.getElementById('statusMapName');
const collisionToggle = document.getElementById('collisionToggle') as HTMLInputElement;
const boatToggle = document.getElementById('boatToggle') as HTMLInputElement;
const roleSelector = document.getElementById('roleSelector') as HTMLSelectElement;
const roleBadge = document.getElementById('roleBadge') as HTMLSpanElement;

// Zone Editor DOM
const zoneTypeSelect = document.getElementById('zoneTypeSelect') as HTMLSelectElement;
const houseIdContainer = document.getElementById('houseIdContainer') as HTMLElement;
const zoneHouseIdInput = document.getElementById('zoneHouseIdInput') as HTMLInputElement;

zoneTypeSelect?.addEventListener('change', () => {
    selectedZoneType = parseInt(zoneTypeSelect.value) as ZoneType;
    if (selectedZoneType === ZoneType.HOUSE) {
        houseIdContainer.style.display = 'block';
    } else {
        houseIdContainer.style.display = 'none';
    }
});
zoneHouseIdInput?.addEventListener('input', () => {
    selectedHouseId = parseInt(zoneHouseIdInput.value) || 1;
});

// Estado da conta e cargo ativo
let currentRole: AccountType = 'GM';
let editorShell: EditorShellController;

function updateRoleUI() {
    const permissions = getRolePermissions(currentRole);
    
    if (roleBadge) {
        roleBadge.innerText = currentRole;
        roleBadge.style.background = permissions.color;
    }
    if (statusRoleEl) {
        statusRoleEl.innerText = currentRole;
        statusRoleEl.style.color = permissions.color;
    }

    editorShell?.setEditorMenusVisible(permissions.canEditMap);
    updatePaintBrushSizeBarVisibility();

    // Restringe os checkboxes de mecânicas se for Player/Tutor
    if (collisionToggle && boatToggle) {
        if (!permissions.canToggleCollision) {
            collisionToggle.checked = true; // Força colisão
            collisionToggle.disabled = true; // Impede desativar
        } else {
            collisionToggle.disabled = false;
        }
    }
}

// Vincula o evento de mudança de cargo
if (roleSelector) {
    roleSelector.onchange = () => {
        currentRole = roleSelector.value as AccountType;
        updateRoleUI();
        refreshPlayerMovementSpeed();
    };
}

// Chama a inicialização de interface uma vez para alinhar os estados
setTimeout(updateRoleUI, 50);

// Instanciação do histórico para retroceder/seguir
const history = new HistoryManager();

function updateHistoryButtons() {
    const canUndo = history.canUndo();
    const canRedo = history.canRedo();
    const undos = [undoBtn, undoBtnFlyout, quickUndo];
    const redos = [redoBtn, redoBtnFlyout, quickRedo];
    undos.forEach((btn) => { if (btn) btn.disabled = !canUndo; });
    redos.forEach((btn) => { if (btn) btn.disabled = !canRedo; });
}

function saveState() {
    history.saveState(worldMap);
    updateHistoryButtons();
}

function triggerUndo() {
    const prevState = history.undo(worldMap);
    if (prevState) {
        worldMap = prevState;
        updateHistoryButtons();
    }
}

function triggerRedo() {
    const nextState = history.redo(worldMap);
    if (nextState) {
        worldMap = nextState;
        updateHistoryButtons();
    }
}

function bindHistoryButtons(btn: HTMLButtonElement | null, action: () => void) {
    if (btn) btn.onclick = action;
}
bindHistoryButtons(undoBtn, triggerUndo);
bindHistoryButtons(redoBtn, triggerRedo);
bindHistoryButtons(undoBtnFlyout, triggerUndo);
bindHistoryButtons(redoBtnFlyout, triggerRedo);
bindHistoryButtons(quickUndo, triggerUndo);
bindHistoryButtons(quickRedo, triggerRedo);

const player = {
    worldX: 50 * TILE_SIZE_SCREEN,
    worldY: 50 * TILE_SIZE_SCREEN,
    worldZ: 0,
    tileX: 50,
    tileY: 50,
};

const camera = { x: 0, y: 0, offsetX: 0, offsetY: 0, zoom: 1.0 };
let isSpacePressed = false;
let isMiddleDragging = false;
let isDraggingMap = false;
let dragStartX = 0;
let dragStartY = 0;
let initialCameraOffsetX = 0;
let initialCameraOffsetY = 0;

const keys: Record<string, boolean> = {};
const gridMovement = createGridMovementController();

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
        const shortId = getActiveInstanceShortLabel();
        statusMapNameEl.textContent = `${baseName} · #${shortId}`;
        statusMapNameEl.title = `Dungeon instanciada (RAM)\nMapId: ${currentMapId}\nInstância: ${shortId}\nAlterações não afetam o JSON em public/maps/ até você salvar o template.`;
    } else {
        statusMapNameEl.textContent = baseName;
        statusMapNameEl.title = currentMapId
            ? `Mapa público · ID: ${currentMapId}`
            : 'Nenhum mapa carregado';
    }
}

function setActiveMapSize(size: number): void {
    activeMapSize = Math.min(
        ENGINE_CONFIG.MAP_SIZE,
        Math.max(8, Math.floor(size))
    );
    const maxCoord = activeMapSize - 1;
    if (player.tileX > maxCoord) player.tileX = maxCoord;
    if (player.tileY > maxCoord) player.tileY = maxCoord;
    if (player.tileX < 0) player.tileX = 0;
    if (player.tileY < 0) player.tileY = 0;
    player.worldX = player.tileX * TILE_SIZE_SCREEN;
    player.worldY = player.tileY * TILE_SIZE_SCREEN;
    syncGridPlayerVisual(player, TILE_SIZE_SCREEN);
}

/** Stats persistentes — `character/movementSpeed.ts`. */
const characterSpeed: CharacterSpeedState = createDefaultCharacterSpeed();
const playerEquipment: EquipmentState = createDefaultEquipment();
const speedBuffs = new SpeedBuffManager();

// Tenta carregar o preset do localStorage se existir (desativado no GM Studio)
function getSavedOrInitialCharacterConfig() {
    if (getStudioBoot()?.skipCharacterPreset) {
        return createDefaultCharacterConfig();
    }
    try {
        const saved = localStorage.getItem('game2d_active_character_config');
        if (saved) {
            const parsed = JSON.parse(saved);
            // Valida se o formato está minimamente correto
            if (parsed.name && typeof parsed.frameWidth === 'number' && typeof parsed.frameHeight === 'number' && parsed.animations) {
                console.log('[Character Storage] Carregando personagem salvo anteriormente do localStorage:', parsed.name);
                return parsed;
            }
        }
    } catch (e) {
        console.error('[Character Storage] Erro ao carregar do localStorage:', e);
    }
    return createDefaultCharacterConfig();
}

export const activeCharacterController = new SpriteAnimationController(
    getSavedOrInitialCharacterConfig(),
    { autoLoad: !getStudioBoot()?.skipCharacterPreset }
);

function resolveGameServerUrl(): string | null {
    const env = import.meta.env.VITE_GAME_SERVER_WS;
    if (env === 'false' || env === '0') return null;
    if (env && env.length > 0) return env;
    if (import.meta.env.DEV) return `ws://localhost:${DEFAULT_WS_PORT}`;
    return null;
}

const gameServerUrl =
    getStudioBoot()?.skipGameNet ? null : resolveGameServerUrl();
const gameNet: GameNetClient | null = gameServerUrl
    ? new GameNetClient({
          url: gameServerUrl,
          getLocalState: () => ({
              name: activeCharacterController.config.name || 'Jogador',
              mapId: currentMapId ?? 'mainland',
              /** Sala de rede: servidor atribui em dungeons; não envia clone local. */
              instanceId: gameNet?.getNetworkInstanceId(),
              tileX: player.tileX,
              tileY: player.tileY,
              z: player.worldZ,
          }),
          onStatusChange: (status) => {
              console.log(`[GameNet] status: ${status}`);
          },
          onServerInstanceId: (id) => {
              if (id) {
                  console.log(`[GameNet] sala instanciada do servidor: …${id.slice(-8)}`);
              }
          },
      })
    : null;

if (gameNet) {
    gameNet.connect();
}

// Instanciação de NPCs de teste para validar o sistema de Outfits/Multi-entidades
export const npcs: GameEntity[] = [];

// Reconstrói as entidades ativas no jogo com base nos spawns pintados
export function respawnEntities() {
    respawnEntitiesFromSpawns({
        spawns: worldSpawns,
        npcs,
        mapSize: activeMapSize,
        tileSize: TILE_SIZE_SCREEN,
    });
}

function triggerPlayerAttack() {
    activeCharacterController.setState('attack');
    activeCharacterController.onAnimationEndCallback = () => {
        activeCharacterController.setState('idle');
    };
}

function syncEquipmentToStats(): void {
    characterSpeed.equipmentBonus =
        calculateEquipmentSpeedBonus(playerEquipment);
}

function getTileSpeedModifierAt(
    tileX: number,
    tileY: number,
    z: number
): number {
    return getTerrainSpeedModifierAt(
        createCollisionContext(),
        tileX,
        tileY,
        z
    );
}

function getMovementContextAtTile(tileX: number, tileY: number, z: number) {
    const terrainModifier = getTileSpeedModifierAt(tileX, tileY, z);
    const buffTotals = speedBuffs.getTotals();
    return { terrainModifier, buffTotals };
}

function getStepDurationForTile(tileX: number, tileY: number, z: number): number {
    const { terrainModifier, buffTotals } = getMovementContextAtTile(tileX, tileY, z);
    return resolveFullStepDuration({
        stats: characterSpeed,
        role: currentRole,
        buffTotals,
        terrainModifier,
    }).stepDurationMs;
}

function captureMovementSnapshot(label: string) {
    const { terrainModifier, buffTotals } = getMovementContextAtTile(
        player.tileX,
        player.tileY,
        player.worldZ
    );
    return buildMovementSnapshot(
        label,
        characterSpeed,
        currentRole,
        buffTotals,
        terrainModifier
    );
}

function refreshPlayerMovementSpeed(nowMs: number = performance.now()): void {
    speedBuffs.tick(nowMs);
    syncEquipmentToStats();

    const { terrainModifier, buffTotals } = getMovementContextAtTile(
        player.tileX,
        player.tileY,
        player.worldZ
    );
    const resolved = resolveFullStepDuration({
        stats: characterSpeed,
        role: currentRole,
        buffTotals,
        terrainModifier,
    });

    const baselineMs = resolveFullStepDuration({
        stats: characterSpeed,
        role: currentRole,
        buffTotals: { bonus: 0, penalty: 0 },
        terrainModifier,
    }).stepDurationMs;

    if (!gridMovement.stepping) {
        setGridStepDuration(gridMovement, resolved.stepDurationMs);
    }

    const tps = stepDurationToTilesPerSecond(resolved.stepDurationMs);
    const deltaMs = baselineMs - resolved.stepDurationMs;

    if (posSpeedEl) posSpeedEl.innerText = resolved.speed.toString();
    if (posStepMsEl) posStepMsEl.innerText = resolved.stepDurationMs.toString();
    if (posStepBaseMsEl) posStepBaseMsEl.innerText = resolved.baseStepDurationMs.toString();
    if (posTerrainModEl) posTerrainModEl.innerText = resolved.terrainModifier.toFixed(2);
    if (posTilesPerSecEl) posTilesPerSecEl.innerText = tps.toString();
    if (posStepDeltaEl) {
        if (deltaMs === 0) {
            posStepDeltaEl.innerText = 'igual ao base (sem buff)';
        } else if (deltaMs > 0) {
            posStepDeltaEl.innerText = `+${deltaMs}ms mais rápido vs base`;
        } else {
            posStepDeltaEl.innerText = `${deltaMs}ms mais lento vs base`;
        }
    }

    const equipLines = describeEquipment(playerEquipment);
    if (posEquipEl) {
        posEquipEl.innerText = equipLines.length ? equipLines.join(', ') : '—';
    }

    const buffNames = speedBuffs.getActiveNames(nowMs);
    if (posBuffsEl) {
        posBuffsEl.innerText = buffNames.length ? buffNames.join(', ') : '—';
    }

    if (statusSpeedEl) statusSpeedEl.innerText = resolved.speed.toString();
    if (statusStepMsEl) statusStepMsEl.innerText = resolved.stepDurationMs.toString();
}

function setupMovementDevControls(): void {
    const applyDevChange = (label: string, action: () => void) => {
        const before = captureMovementSnapshot('antes');
        action();
        refreshPlayerMovementSpeed();
        const after = captureMovementSnapshot(label);
        logMovementCompare(before, after);
    };

    devEquipHasteBootsBtn?.addEventListener('click', () => {
        applyDevChange('Botas da Pressa', () => {
            speedBuffs.clearAll();
            equipItem(playerEquipment, 'boots_of_haste');
        });
    });
    devEquipLeatherBootsBtn?.addEventListener('click', () => {
        applyDevChange('Botas de Couro', () => {
            speedBuffs.clearAll();
            equipItem(playerEquipment, 'leather_boots');
        });
    });
    devBuffHasteBtn?.addEventListener('click', () => {
        applyDevChange('Haste', () => {
            speedBuffs.apply('haste', performance.now());
        });
    });
    devBuffSlowBtn?.addEventListener('click', () => {
        applyDevChange('Slow', () => {
            speedBuffs.apply('slow', performance.now());
        });
    });
    devClearBuffsBtn?.addEventListener('click', () => {
        applyDevChange('Sem buffs', () => speedBuffs.clearAll());
    });
}

async function refreshCreatureCatalog(): Promise<void> {
    await loadCreaturePresets();
    spawnEditorController?.refresh();
    respawnEntities();
}

function parseSpriteProfile(value: string | undefined): SpriteProfileId {
    if (value === 'npc' || value === 'monster') return value;
    return 'player';
}

editorShell = initEditorShell();
editorShell.setPanelOpenHook((id, trigger) => {
    if (id !== 'character') return;
    const profile = parseSpriteProfile(trigger?.dataset.spriteProfile);
    setSpriteEditorProfile(profile);
    const titleEl = document.getElementById('flyoutTitle');
    if (titleEl) titleEl.textContent = getSpriteEditorFlyoutTitle(profile);
});
initGridPlayerPosition(player, TILE_SIZE_SCREEN);
initFloorControls();
syncEquipmentToStats();
refreshPlayerMovementSpeed();
setupMovementDevControls();
updateRoleUI();
initCharacterEditor({ onCatalogChanged: refreshCreatureCatalog });
initMapSpriteEditor();

// --- SISTEMA PREMIUM DE TELETRANSPORTE (IR PARA POSIÇÃO) ---
const teleportModal = document.getElementById('teleportModal') as HTMLDivElement;
const openTeleportBtn = document.getElementById('openTeleportBtn');
const teleportCloseBtn = document.getElementById('teleportCloseBtn');
const teleportCancelBtn = document.getElementById('teleportCancelBtn');
const teleportConfirmBtn = document.getElementById('teleportConfirmBtn');

const tXInput = document.getElementById('teleportX') as HTMLInputElement;
const tYInput = document.getElementById('teleportY') as HTMLInputElement;
const tZInput = document.getElementById('teleportZ') as HTMLInputElement;

openTeleportBtn?.addEventListener('click', () => {
    if (teleportModal) {
        if (tXInput) tXInput.value = player.tileX.toString();
        if (tYInput) tYInput.value = player.tileY.toString();
        if (tZInput) tZInput.value = player.worldZ.toString();
        teleportModal.style.display = 'flex';
        // Needs a small delay to allow display: flex to apply before transitioning opacity
        requestAnimationFrame(() => {
            teleportModal.classList.add('is-open');
            tXInput?.focus();
        });
    }
});

const closeTeleportModal = () => {
    if (teleportModal) {
        teleportModal.classList.remove('is-open');
        setTimeout(() => {
            teleportModal.style.display = 'none';
        }, 250);
    }
};

teleportCloseBtn?.addEventListener('click', closeTeleportModal);
teleportCancelBtn?.addEventListener('click', closeTeleportModal);

teleportConfirmBtn?.addEventListener('click', () => {
    const tx = parseInt(tXInput.value);
    const ty = parseInt(tYInput.value);
    const tz = parseInt(tZInput.value);

    if (isNaN(tx) || isNaN(ty) || isNaN(tz)) {
        toast.error('Insira coordenadas numéricas válidas!');
        return;
    }

    if (tx < 0 || tx >= activeMapSize || ty < 0 || ty >= activeMapSize) {
        toast.error(`Coordenadas X e Y devem estar entre 0 e ${activeMapSize - 1}.`);
        return;
    }

    if (tz < ENGINE_CONFIG.MIN_FLOOR_Z || tz > ENGINE_CONFIG.MAX_FLOOR_Z) {
        toast.error(`Andar Z deve estar entre ${ENGINE_CONFIG.MIN_FLOOR_Z} e ${ENGINE_CONFIG.MAX_FLOOR_Z}.`);
        return;
    }

    saveState(); // Salva o histórico de alteração do mapa antes de viajar

    const result = PlayerMovement.teleportPlayer({
        player,
        camera,
        canvas,
        x: tx,
        y: ty,
        z: tz,
        TILE_SIZE_SCREEN,
        MAP_SIZE: activeMapSize,
        ENGINE_CONFIG,
        updateFloorButtons: () => updateFloorButtons(),
        posXEl: posXEl as HTMLElement,
        posYEl: posYEl as HTMLElement,
        posZEl: posZEl as HTMLElement
    });

    editingFloor = result.editingFloor;
    closeTeleportModal();
    toast.success(`Teletransportado para X:${tx} Y:${ty} Z:${tz} com sucesso!`);
});

// Inicializa os spinners customizados para campos numéricos
document.querySelectorAll('.custom-number-input').forEach(wrapper => {
    const input = wrapper.querySelector('input[type="number"]') as HTMLInputElement;
    const upBtn = wrapper.querySelector('.spinner-up') as HTMLButtonElement;
    const downBtn = wrapper.querySelector('.spinner-down') as HTMLButtonElement;
    
    if (input && upBtn && downBtn) {
        upBtn.addEventListener('click', () => {
            input.stepUp();
            input.dispatchEvent(new Event('input'));
            input.dispatchEvent(new Event('change'));
        });
        downBtn.addEventListener('click', () => {
            input.stepDown();
            input.dispatchEvent(new Event('input'));
            input.dispatchEvent(new Event('change'));
        });
    }
});

// Inicialização modular do Editor de Mapa
function updateTileBrushStatus(selectedId: number): void {
    const statusEl = document.getElementById('statusTileBrush');
    if (!statusEl) return;
    const summary = getVariantSelectionSummary(selectedId, TILE_TYPES);
    if (summary.isRandomBrush) {
        statusEl.textContent = `🎲 ${summary.groupLabel} (${summary.memberCount} var.)`;
        statusEl.title = summary.tileName;
    } else if (summary.groupKey && summary.groupLabel) {
        statusEl.textContent = `🧱 ${summary.tileName} · grupo ${summary.groupLabel}`;
        statusEl.title = 'Variante fixa de grupo';
    } else {
        statusEl.textContent = `🧱 ${summary.tileName}`;
        statusEl.title = 'Tile selecionado';
    }
}

function updateVariantBrushHint(selectedId: number): void {
    const hint = document.getElementById('paintVariantBrushHint');
    const labelEl = document.getElementById('paintVariantBrushHintLabel');
    if (!hint || !labelEl) return;

    if (isVariantBrush(selectedId)) {
        const summary = getVariantSelectionSummary(selectedId, TILE_TYPES);
        const count = summary.memberCount ?? 0;
        labelEl.textContent = `${summary.groupLabel} aleatório (${count} variantes)`;
        hint.style.display = 'block';
    } else {
        hint.style.display = 'none';
    }
}

function resolvePaintSelectionId(selectedId: number): number {
    if (isVariantBrush(selectedId)) return selectedId;

    const tile = TILE_TYPES[selectedId];
    if (!tile) return selectedId;

    // Frame fixo de variant strip — sempre pinta exatamente este tile (sem sorteio).
    if (tile.variantStripIndex !== undefined) return selectedId;

    const brushId = findVariantBrushForTileId(selectedId);
    if (brushId === undefined) return selectedId;

    const label = `${tile.name || ''} ${tile.fileKey || ''}`.toLowerCase();
    if (
        label.includes('random') ||
        label.includes('randon') ||
        label.includes('aleat')
    ) {
        return brushId;
    }

    return selectedId;
}

function initPaintBrushSizeBar(): void {
    const container = document.getElementById('paintBrushSizeOptions');
    if (!container) return;

    container.innerHTML = '';
    for (const size of PAINT_BRUSH_SIZE_OPTIONS) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `paint-brush-size-btn${size === paintBrushSize ? ' active' : ''}`;
        btn.textContent = String(size);
        btn.title = `${size}×${size} tiles por clique`;
        btn.dataset.brushSize = String(size);
        btn.onclick = () => {
            paintBrushSize = size;
            container.querySelectorAll('.paint-brush-size-btn').forEach((el) => {
                el.classList.toggle(
                    'active',
                    (el as HTMLElement).dataset.brushSize === String(size)
                );
            });
        };
        container.appendChild(btn);
    }
}

function shouldShowPaintBrushSizeBar(): boolean {
    if (!getRolePermissions(currentRole).canEditMap) return false;
    if (!['paint', 'tileset'].includes(activeMapEditorTab)) return false;
    if (!mapEditorController) return false;

    const tool = mapEditorController.currentTool;
    if (tool === 'eraser') return true;
    if (tool !== 'pencil') return false;

    const id = mapEditorController.selectedTileType;
    return id >= 0 && TILE_TYPES[id] !== undefined;
}

function updatePaintBrushSizeBarVisibility(): void {
    const bar = document.getElementById('paintBrushSizeBar');
    if (!bar) return;
    const show = shouldShowPaintBrushSizeBar();
    bar.hidden = !show;
    bar.setAttribute('aria-hidden', show ? 'false' : 'true');
    if (!show) {
        paintBrushPreview = null;
    }
}

function clientToMapTile(e: MouseEvent): { tx: number; ty: number } | null {
    const rect = canvas.getBoundingClientRect();
    const zoom = camera.zoom || 1.0;
    const tx = Math.floor(((e.clientX - rect.left) / zoom + camera.x) / TILE_SIZE_SCREEN);
    const ty = Math.floor(((e.clientY - rect.top) / zoom + camera.y) / TILE_SIZE_SCREEN);
    if (tx < 0 || tx >= activeMapSize || ty < 0 || ty >= activeMapSize) return null;
    return { tx, ty };
}

function drawPaintBrushPreview(
    ctx: CanvasRenderingContext2D,
    camX: number,
    camY: number,
    centerX: number,
    centerY: number
): void {
    const { w, h } = getBrushFootprint(paintBrushSize);
    const startX = centerX - Math.floor(w / 2);
    const startY = centerY - Math.floor(h / 2);
    const endX = startX + w - 1;
    const endY = startY + h - 1;

    const blockX = Math.max(0, startX) * TILE_SIZE_SCREEN - camX;
    const blockY = Math.max(0, startY) * TILE_SIZE_SCREEN - camY;
    const blockW =
        (Math.min(activeMapSize - 1, endX) - Math.max(0, startX) + 1) * TILE_SIZE_SCREEN;
    const blockH =
        (Math.min(activeMapSize - 1, endY) - Math.max(0, startY) + 1) * TILE_SIZE_SCREEN;

    if (blockW > 0 && blockH > 0) {
        ctx.fillStyle = 'rgba(250, 204, 21, 0.28)';
        ctx.fillRect(blockX, blockY, blockW, blockH);
        ctx.strokeStyle = 'rgba(245, 158, 11, 0.95)';
        ctx.lineWidth = 2;
        ctx.strokeRect(blockX + 1, blockY + 1, blockW - 2, blockH - 2);
    }

    for (const { x, y } of iterBrushCells(centerX, centerY, paintBrushSize, activeMapSize)) {
        const sx = x * TILE_SIZE_SCREEN - camX;
        const sy = y * TILE_SIZE_SCREEN - camY;
        ctx.strokeStyle = 'rgba(253, 224, 71, 0.55)';
        ctx.lineWidth = 1;
        ctx.strokeRect(sx + 0.5, sy + 0.5, TILE_SIZE_SCREEN - 1, TILE_SIZE_SCREEN - 1);
    }
}

function updatePaintBrushPreviewFromEvent(e: MouseEvent): void {
    if (!shouldShowPaintBrushSizeBar()) {
        paintBrushPreview = null;
        return;
    }
    if (isDraggingMap || isSpacePressed || isMiddleDragging) {
        paintBrushPreview = null;
        return;
    }
    const activePanel = editorShell?.getActivePanel();
    if (activePanel !== 'map_editor') {
        paintBrushPreview = null;
        return;
    }
    paintBrushPreview = clientToMapTile(e);
}

function placeTileAt(z: number, x: number, y: number, selectedId: number): void {
    const paintId = resolvePaintSelectionId(selectedId);
    for (const { x: px, y: py } of iterBrushCells(x, y, paintBrushSize, activeMapSize)) {
        worldMap[z][py][px] = resolvePaintTileId(paintId, TILE_TYPES);
    }
}

function eraseTileAt(z: number, x: number, y: number): void {
    const emptyId = ENGINE_CONFIG.EMPTY_TILE_ID;
    for (const { x: px, y: py } of iterBrushCells(x, y, paintBrushSize, activeMapSize)) {
        worldMap[z][py][px] = emptyId;
    }
}

mapEditorController = initMapEditor({
    getTileRegistry: () => TILE_TYPES,
    onSelectedTileChanged: (id) => {
        const brushId = findVariantBrushForTileId(id);
        if (brushId !== undefined && !isVariantBrush(id)) {
            const tile = TILE_TYPES[id];
            const label = `${tile?.name || ''}`.toLowerCase();
            if (label.includes('random') || label.includes('randon') || label.includes('aleat')) {
                mapEditorController.setSelectedTileType(brushId);
                toast.info('Pincel aleatório ativado — cada célula sorteia uma variante.');
                return;
            }
            toast.info(
                'Dica: use o pincel 🎲 «Grama aleatório» na aba Tile para sortear variantes.',
                5000
            );
        } else if (brushId === undefined && TILE_TYPES[id]?.variantGroup) {
            toast.info(
                'Este sprite ainda tem só 1 variante. Re-exporte com ✅ Exportar selecionados (strip de 20 frames).',
                6000
            );
        }
        updateTileBrushStatus(mapEditorController.selectedTileType);
        updateVariantBrushHint(mapEditorController.selectedTileType);
        updatePaintBrushSizeBarVisibility();
    },
    onToolChanged: () => {
        updatePaintBrushSizeBarVisibility();
    },
    getEditingFloor: () => editingFloor,
    setEditingFloor: (z) => {
        editingFloor = z;
    },
    saveHistoryState: () => saveState(),
    getWorldMap: () => worldMap,
    getMapSize: () => activeMapSize,
});

updateTileBrushStatus(mapEditorController.selectedTileType);
updateVariantBrushHint(mapEditorController.selectedTileType);
initPaintBrushSizeBar();
updatePaintBrushSizeBarVisibility();

let highlightedPortalId: string | null = null;
let highlightedSpawnId: string | null = null;

// Inicialização do Spawn Editor
spawnEditorController = initSpawnEditor({
    spawns: worldSpawns,
    onSpawnsChanged: () => {
        respawnEntities();
    },
    onSpawnHighlight: (spawn) => {
        highlightedSpawnId = spawn?.id ?? null;
        document.querySelectorAll('.spawn-list-row').forEach((el) => {
            el.classList.toggle(
                'is-highlighted',
                spawn !== null && (el as HTMLElement).dataset.sid === spawn.id
            );
        });
        if (spawn && spawn.z !== editingFloor) {
            editingFloor = clampFloorZ(spawn.z);
            updateFloorButtons();
        }
    },
    onSpawnFocus: (spawn) => {
        focusEditorOnTile(spawn.x, spawn.y, spawn.z);
        toast.info(`Indo para spawn "${spawn.name}" em (${spawn.x}, ${spawn.y}, ${spawn.z})`);
    },
    setEditorTool: (tool) => mapEditorController.setTool(tool),
    getEditorTool: () => mapEditorController.currentTool,
});

function focusEditorOnTile(tileX: number, tileY: number, tileZ: number): void {
    const result = PlayerMovement.teleportPlayer({
        player,
        camera,
        canvas,
        x: tileX,
        y: tileY,
        z: tileZ,
        TILE_SIZE_SCREEN,
        MAP_SIZE: activeMapSize,
        ENGINE_CONFIG,
        updateFloorButtons,
        posXEl,
        posYEl,
        posZEl,
    });
    editingFloor = result.editingFloor;
    syncGridPlayerVisual(player, TILE_SIZE_SCREEN);
    resetPortalTriggerState();
}

// Inicialização do Portal Editor
portalEditorController = initPortalEditor({
    portals: worldPortals,
    getCurrentMapId: () => currentMapId,
    onPortalsChanged: () => {
        // Portals atualizados — persiste-os junto ao próximo save/export
    },
    onPortalHighlight: (portal) => {
        highlightedPortalId = portal?.id ?? null;
        document.querySelectorAll('.portal-list-row').forEach((el) => {
            el.classList.toggle('is-highlighted', portal !== null && (el as HTMLElement).dataset.pid === portal.id);
        });
        if (portal && portal.tileZ !== editingFloor) {
            editingFloor = clampFloorZ(portal.tileZ);
            updateFloorButtons();
        }
    },
    onPortalFocus: (portal) => {
        focusEditorOnTile(portal.tileX, portal.tileY, portal.tileZ);
        toast.info(`Indo para portal em (${portal.tileX}, ${portal.tileY}, ${portal.tileZ})`);
    },
});

// Gerenciador de mapas (modal) — wiring após transitionToMap (ver final do arquivo)

async function reloadTileRegistry(): Promise<void> {
    const hadPaintedTiles = collectSparseTiles(worldMap, activeMapSize).length > 0;
    const mapSnapshot = hadPaintedTiles
        ? serializeMapDocument(worldMap, {
              size: activeMapSize,
              spawn: mapSpawn,
              metadata: worldMetadata,
              houses: worldHouses,
              spawns: worldSpawns,
              portals: worldPortals,
              tileRegistry: TILE_TYPES,
              mapId: currentMapId,
          })
        : null;

    TILE_TYPES = await buildTileRegistryAsync();
    const manifest = await loadVariantGroupManifest();
    attachVariantBrushes(TILE_TYPES, undefined, manifest);

    if (mapSnapshot) {
        const remapped = loadMapFromJson(mapSnapshot, mapSpawn, TILE_TYPES);
        worldMap = ensureAllFloors(remapped.worldMap, activeMapSize);
    }

    for (const mismatch of takeVariantStripMismatches()) {
        toast.error(
            `«${mismatch.fileName}»: PNG tem 1 frame (${mismatch.imageWidth}px), mas metadados pedem ${mismatch.expectedFrames}. ` +
                'No calibrador use ✅ Exportar selecionados (strip horizontal) e recarregue a página.',
            12000
        );
    }

    if (mapEditorController) {
        mapEditorController.initEditorUI();
        updateTileBrushStatus(mapEditorController.selectedTileType);
        updateVariantBrushHint(mapEditorController.selectedTileType);
    }

    if (import.meta.env.DEV) {
        void saveTileCatalogToDevPublic(TILE_TYPES);
    }
}

async function loadCustomTileProperties() {
    try {
        const response = await fetch('/api/list-tile-properties');
        if (response.ok) {
            const result = await response.json();
            if (result.properties) {
                mergeCustomTileProperties(result.properties);
                mergeRuntimeTileProperties(result.properties);
            }
        }
    } catch (err) {
        console.error('[Engine] Erro ao carregar propriedades customizadas dos tiles:', err);
    }
    await reloadTileRegistry();
}

const tileRegistryReady: Promise<void> = loadCustomTileProperties();

setMapSpriteAfterSaveHandler(() => reloadTileRegistry());

// --- SISTEMA DE ENTRADA E DESENHO ---
let startX = 0;
let startY = 0;
let previewOverlay: {type: string, x1: number, y1: number, x2: number, y2: number} | null = null;

function paint(e: MouseEvent) {
    const rect = canvas.getBoundingClientRect();
    const zoom = camera.zoom || 1.0;
    const tx = Math.floor(((e.clientX - rect.left) / zoom + camera.x) / TILE_SIZE_SCREEN);
    const ty = Math.floor(((e.clientY - rect.top) / zoom + camera.y) / TILE_SIZE_SCREEN);
    
    if (tx >= 0 && tx < activeMapSize && ty >= 0 && ty < activeMapSize) {
        const currentTool = mapEditorController.currentTool;

        if (activeMapEditorTab === 'zones') {
            const key = `${editingFloor}_${ty}_${tx}`;
            
            // Se usar a borracha ou selecionar Limpar Zona (NORMAL)
            if (currentTool === 'eraser' || selectedZoneType === ZoneType.NORMAL) {
                if (worldMetadata[key]) {
                    delete worldMetadata[key].zoneId;
                    delete worldMetadata[key].houseId;
                    if (Object.keys(worldMetadata[key]).length === 0) {
                        delete worldMetadata[key];
                    }
                }
            } else if (currentTool === 'pencil') {
                if (!worldMetadata[key]) {
                    worldMetadata[key] = {};
                }
                worldMetadata[key].zoneId = selectedZoneType;
                if (selectedZoneType === ZoneType.HOUSE) {
                    worldMetadata[key].houseId = selectedHouseId;
                } else {
                    delete worldMetadata[key].houseId;
                }
            }
            return;
        } else if (activeMapEditorTab === 'spawns') {
            if (currentTool === 'pencil') {
                spawnEditorController.addSpawnAt(tx, ty, editingFloor);
            } else if (currentTool === 'eraser') {
                spawnEditorController.removeSpawnAt(tx, ty, editingFloor);
            }
            return;
        } else if (activeMapEditorTab === 'portals') {
            if (currentTool === 'pencil') {
                portalEditorController.addPortalAt(tx, ty, editingFloor);
            } else if (currentTool === 'eraser') {
                portalEditorController.removePortalAt(tx, ty, editingFloor);
            }
            return;
        }

        const selectedTileType = mapEditorController.selectedTileType;

        if (currentTool === 'eyedropper') {
            const picked = worldMap[editingFloor][ty][tx];
            if (picked !== -1) {
                const brushId = findVariantBrushForTileId(picked);
                if (brushId !== undefined) {
                    mapEditorController.setSelectedTileType(brushId);
                    const groupKey = getVariantGroupForBrush(brushId);
                    if (groupKey) {
                        mapEditorController.scrollToVariantGroup(groupKey);
                        toast.info(
                            `Grupo ${formatVariantGroupLabel(groupKey)} — pincel aleatório selecionado`
                        );
                    }
                } else {
                    mapEditorController.setSelectedTileType(picked);
                }
                mapEditorController.setTool('pencil');
            }
        } else if (currentTool === 'pencil') {
            placeTileAt(editingFloor, tx, ty, selectedTileType);
        } else if (currentTool === 'eraser') {
            eraseTileAt(editingFloor, tx, ty);
        } else if (currentTool === 'bucket') {
            const target = worldMap[editingFloor][ty][tx];
            const paintId = resolvePaintSelectionId(selectedTileType);
            if (isVariantBrush(paintId)) {
                floodFillRandom(
                    worldMap,
                    editingFloor,
                    tx,
                    ty,
                    target,
                    () => resolvePaintTileId(paintId, TILE_TYPES),
                    activeMapSize
                );
            } else {
                const resolved = resolvePaintTileId(paintId, TILE_TYPES);
                floodFill(worldMap, editingFloor, tx, ty, target, resolved, activeMapSize);
            }
        }
    }
}

function updateCursor() {
    const activePanel = editorShell?.getActivePanel();
    const isMapEditPanelActive = activePanel === 'map_editor';
    if (!isMapEditPanelActive) {
        canvas.style.cursor = 'default';
        return;
    }
    if (isSpacePressed || isMiddleDragging) {
        canvas.style.cursor = isDraggingMap ? 'grabbing' : 'grab';
    } else {
        canvas.style.cursor = 'crosshair';
    }
}

canvas.addEventListener('mouseenter', () => {
    updateCursor();
});

canvas.addEventListener('mousemove', (e) => {
    updatePaintBrushPreviewFromEvent(e);
});

canvas.addEventListener('mouseleave', () => {
    paintBrushPreview = null;
});

canvas.addEventListener('mousedown', e => {
    // Permite pintar ou arrastar o mapa APENAS quando o painel unificado de edição de mapa (map_editor) está ativo
    const activePanel = editorShell?.getActivePanel();
    const isMapEditPanelActive = activePanel === 'map_editor';
    if (!isMapEditPanelActive) {
        return;
    }

    // Suporte para Arrasto (Spacebar + Click ou Botão do Meio)
    const isMiddleClick = e.button === 1;
    if (isSpacePressed || isMiddleClick) {
        e.preventDefault();
        isDraggingMap = true;
        if (isMiddleClick) {
            isMiddleDragging = true;
        }
        dragStartX = e.clientX;
        dragStartY = e.clientY;
        initialCameraOffsetX = camera.offsetX;
        initialCameraOffsetY = camera.offsetY;
        updateCursor();

        const onDragMove = (me: MouseEvent) => {
            if (!isDraggingMap) return;
            const dx = me.clientX - dragStartX;
            const dy = me.clientY - dragStartY;
            camera.offsetX = initialCameraOffsetX - dx;
            camera.offsetY = initialCameraOffsetY - dy;
        };

        const onDragUp = (me: MouseEvent) => {
            if (me.button === 1 || !isSpacePressed) {
                isMiddleDragging = false;
            }
            isDraggingMap = false;
            window.removeEventListener('mousemove', onDragMove);
            window.removeEventListener('mouseup', onDragUp);
            updateCursor();
        };

        window.addEventListener('mousemove', onDragMove);
        window.addEventListener('mouseup', onDragUp);
        return;
    }

    if (!getRolePermissions(currentRole).canEditMap) {
        return;
    }
    const rect = canvas.getBoundingClientRect();
    const zoom = camera.zoom || 1.0;
    const tx = Math.floor(((e.clientX - rect.left) / zoom + camera.x) / TILE_SIZE_SCREEN);
    const ty = Math.floor(((e.clientY - rect.top) / zoom + camera.y) / TILE_SIZE_SCREEN);
    
    const currentTool = mapEditorController.currentTool;

    if (currentTool === 'rectangle' || currentTool === 'line') {
        startX = tx;
        startY = ty;
        previewOverlay = { type: currentTool, x1: tx, y1: ty, x2: tx, y2: ty };
        
        const onMove = (me: MouseEvent) => {
            const zoom = camera.zoom || 1.0;
            const cx = Math.floor(((me.clientX - rect.left) / zoom + camera.x) / TILE_SIZE_SCREEN);
            const cy = Math.floor(((me.clientY - rect.top) / zoom + camera.y) / TILE_SIZE_SCREEN);
            previewOverlay = { type: currentTool, x1: startX, y1: startY, x2: cx, y2: cy };
        };
        const onUp = (me: MouseEvent) => {
            const zoom = camera.zoom || 1.0;
            const cx = Math.floor(((me.clientX - rect.left) / zoom + camera.x) / TILE_SIZE_SCREEN);
            const cy = Math.floor(((me.clientY - rect.top) / zoom + camera.y) / TILE_SIZE_SCREEN);
            saveState(); // Salva o estado antes de aplicar a forma
            applyShape(currentTool, startX, startY, cx, cy);
            previewOverlay = null;
            canvas.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
        };
        canvas.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
    } else {
        if (currentTool !== 'eyedropper') {
            saveState(); // Salva o estado antes de iniciar a pintura (Pencil, Bucket, Eraser)
        }
        paint(e);
        if(currentTool === 'pencil' || currentTool === 'eraser') {
            const onMove = (me: MouseEvent) => paint(me);
            const onStrokeEnd = () => {
                canvas.removeEventListener('mousemove', onMove);
            };
            canvas.addEventListener('mousemove', onMove);
            window.addEventListener('mouseup', onStrokeEnd, { once: true });
        }
    }
});

// Modal de Propriedades de Tile (ActionID / UniqueID)
const tilePropModal = document.getElementById('tilePropertiesModal')!;
const tilePropCloseBtn = document.getElementById('tilePropCloseBtn')!;
const tilePropCancelBtn = document.getElementById('tilePropCancelBtn')!;
const tilePropConfirmBtn = document.getElementById('tilePropConfirmBtn')!;
const tilePropCoord = document.getElementById('tilePropCoord')!;
const tilePropActionId = document.getElementById('tilePropActionId') as HTMLInputElement;
const tilePropUniqueId = document.getElementById('tilePropUniqueId') as HTMLInputElement;
let editingTileKey: string | null = null;

const closeTilePropModal = () => {
    if (tilePropModal) {
        tilePropModal.classList.remove('is-open');
        setTimeout(() => {
            tilePropModal.style.display = 'none';
        }, 250);
    }
    editingTileKey = null;
};

tilePropCloseBtn?.addEventListener('click', closeTilePropModal);
tilePropCancelBtn?.addEventListener('click', closeTilePropModal);

tilePropConfirmBtn?.addEventListener('click', async () => {
    if (editingTileKey) {
        const aId = parseInt(tilePropActionId.value);
        const uId = parseInt(tilePropUniqueId.value);
        
        // Validações de duplicação
        if (!isNaN(aId) && aId > 0) {
            const existingCoord = Object.keys(worldMetadata).find(k => k !== editingTileKey && worldMetadata[k].actionId === aId);
            if (existingCoord) {
                const confirmed = await popup.confirm(`Esse Action ID (${aId}) já está sendo usado na coordenada ${existingCoord.replace(/_/g, ',')}. Deseja usá-lo como repetição?`, 'Action ID Duplicado');
                if (!confirmed) return;
            }
        }

        if (!isNaN(uId) && uId > 0) {
            const existingCoord = Object.keys(worldMetadata).find(k => k !== editingTileKey && worldMetadata[k].uniqueId === uId);
            if (existingCoord) {
                const confirmed = await popup.confirm(`ATENÇÃO: Unique IDs devem ser únicos! O ID ${uId} já existe na coordenada ${existingCoord.replace(/_/g, ',')}. Deseja MOVER ele para cá?`, 'Unique ID Duplicado');
                if (!confirmed) return;
                
                // Remove from the old coordinate
                delete worldMetadata[existingCoord].uniqueId;
                if (Object.keys(worldMetadata[existingCoord]).length === 0) {
                    delete worldMetadata[existingCoord];
                }
            }
        }
        
        if (!worldMetadata[editingTileKey]) {
            worldMetadata[editingTileKey] = {};
        }
        
        if (!isNaN(aId) && aId > 0) {
            worldMetadata[editingTileKey].actionId = aId;
        } else {
            delete worldMetadata[editingTileKey].actionId;
        }
        
        if (!isNaN(uId) && uId > 0) {
            worldMetadata[editingTileKey].uniqueId = uId;
        } else {
            delete worldMetadata[editingTileKey].uniqueId;
        }

        // Limpa se ficou vazio
        if (Object.keys(worldMetadata[editingTileKey]).length === 0) {
            delete worldMetadata[editingTileKey];
        }

        toast.success(`Propriedades salvas!`);
        closeTilePropModal();
    }
});

canvas.addEventListener('contextmenu', e => {
    if (!getRolePermissions(currentRole).canEditMap) return;
    const activePanel = editorShell?.getActivePanel();
    if (activePanel !== 'map_editor') return;

    e.preventDefault(); // Impede o menu padrão do navegador

    const rect = canvas.getBoundingClientRect();
    const zoom = camera.zoom || 1.0;
    const tx = Math.floor(((e.clientX - rect.left) / zoom + camera.x) / TILE_SIZE_SCREEN);
    const ty = Math.floor(((e.clientY - rect.top) / zoom + camera.y) / TILE_SIZE_SCREEN);

    if (tx >= 0 && tx < activeMapSize && ty >= 0 && ty < activeMapSize) {
        editingTileKey = `${editingFloor}_${ty}_${tx}`;
        
        // Find last IDs
        let maxActionId = 0;
        let maxUniqueId = 0;
        for (const data of Object.values(worldMetadata)) {
            if (data.actionId && data.actionId > maxActionId) maxActionId = data.actionId;
            if (data.uniqueId && data.uniqueId > maxUniqueId) maxUniqueId = data.uniqueId;
        }
        const lastActionEl = document.getElementById('tilePropLastActionId');
        const lastUniqueEl = document.getElementById('tilePropLastUniqueId');
        if (lastActionEl) lastActionEl.innerText = `Último: ${maxActionId > 0 ? maxActionId : '-'}`;
        if (lastUniqueEl) lastUniqueEl.innerText = `Último: ${maxUniqueId > 0 ? maxUniqueId : '-'}`;

        const currentData = worldMetadata[editingTileKey];
        tilePropActionId.value = currentData?.actionId?.toString() || '0';
        tilePropUniqueId.value = currentData?.uniqueId?.toString() || '0';
        tilePropCoord.innerHTML = `X:${tx} Y:${ty} Z:${editingFloor}`;
        
        tilePropModal.style.display = 'flex';
        requestAnimationFrame(() => {
            tilePropModal.classList.add('is-open');
        });
    }
});

function applyShape(type: string, x1: number, y1: number, x2: number, y2: number) {
    const minX = Math.max(0, Math.min(x1, x2));
    const maxX = Math.min(activeMapSize - 1, Math.max(x1, x2));
    const minY = Math.max(0, Math.min(y1, y2));
    const maxY = Math.min(activeMapSize - 1, Math.max(y1, y2));
    
    const selectedTileType = mapEditorController.selectedTileType;

    if (type === 'rectangle') {
        for (let y = minY; y <= maxY; y++) {
            for (let x = minX; x <= maxX; x++) {
                placeTileAt(editingFloor, x, y, selectedTileType);
            }
        }
    } else if (type === 'line') {
        let dx = Math.abs(x2 - x1);
        let dy = Math.abs(y2 - y1);
        let sx = (x1 < x2) ? 1 : -1;
        let sy = (y1 < y2) ? 1 : -1;
        let err = dx - dy;
        let cx = x1, cy = y1;
        
        while (true) {
            if (cx >= 0 && cx < activeMapSize && cy >= 0 && cy < activeMapSize) {
                placeTileAt(editingFloor, cx, cy, selectedTileType);
            }
            if (cx === x2 && cy === y2) break;
            let e2 = 2 * err;
            if (e2 > -dy) { err -= dy; cx += sx; }
            if (e2 < dx) { err += dx; cy += sy; }
        }
    }
}

window.addEventListener('keydown', e => {
    // Evita conflitos de teclas de atalho (como WASD, P, B, E, Espaço) enquanto o usuário digita nos inputs
    const activeEl = document.activeElement;
    const isTyping = activeEl && (
        activeEl.tagName === 'INPUT' || 
        activeEl.tagName === 'SELECT' || 
        activeEl.tagName === 'TEXTAREA' || 
        activeEl.getAttribute('contenteditable') === 'true'
    );
    if (isTyping) {
        return;
    }

    const key = e.key.toLowerCase();
    keys[key] = true;
    
    if (key === ' ' || key === 'spacebar') {
        e.preventDefault();
        const activePanel = editorShell?.getActivePanel();
        const isMapEditPanelActive = activePanel === 'map_editor';
        if (isMapEditPanelActive) {
            if (!isSpacePressed) {
                isSpacePressed = true;
                updateCursor();
            }
        } else {
            triggerPlayerAttack();
        }
    }
    
    // Novos atalhos para os novos estados de animação
    if (key === 'x') {
        e.preventDefault();
        if (activeCharacterController.currentState === 'sit') {
            activeCharacterController.setState('idle');
        } else {
            activeCharacterController.setState('sit');
        }
    }
    if (key === 'h') {
        e.preventDefault();
        if (activeCharacterController.currentState === 'dead') {
            activeCharacterController.setState('idle');
        } else {
            activeCharacterController.setState('dead');
        }
    }
    if (key === 'c') {
        e.preventDefault();
        activeCharacterController.setState('cast');
        activeCharacterController.onAnimationEndCallback = () => {
            activeCharacterController.setState('idle');
        };
    }
    
    // Atalhos de Histórico (Desfazer/Refazer)
    if (e.ctrlKey) {
        if (key === 'z') {
            e.preventDefault();
            if (e.shiftKey) {
                triggerRedo();
            } else {
                triggerUndo();
            }
            return;
        } else if (key === 'y' || key === 'x') {
            // Suporta Ctrl+Y (padrão) e Ctrl+X (alternativo do usuário para seguir em frente)
            e.preventDefault();
            triggerRedo();
            return;
        } else if (key === 'g' && e.shiftKey) {
            e.preventDefault();
            const openTeleportBtn = document.getElementById('openTeleportBtn');
            openTeleportBtn?.click();
            return;
        }
    }
    
    if (key === 'pageup') {
        player.worldZ = clampFloorZ(player.worldZ + 1);
        editingFloor = player.worldZ;
        syncGridPlayerVisual(player, TILE_SIZE_SCREEN);
        updateFloorButtons();
    }
    if (key === 'pagedown') {
        player.worldZ = clampFloorZ(player.worldZ - 1);
        editingFloor = player.worldZ;
        syncGridPlayerVisual(player, TILE_SIZE_SCREEN);
        updateFloorButtons();
    }
    
    if (key === 'p') mapEditorController.setTool('pencil');
    if (key === 'b') mapEditorController.setTool('bucket');
    if (key === 'e') mapEditorController.setTool('eraser');
    if (key === 'i') mapEditorController.setTool('eyedropper');
    if (key === 'u') mapEditorController.setTool('rectangle');
    if (key === 'l') mapEditorController.setTool('line');
});
window.addEventListener('keyup', e => {
    const key = e.key.toLowerCase();
    keys[key] = false;
    if (key === ' ' || key === 'spacebar') {
        isSpacePressed = false;
        updateCursor();
    }
});

function updateFloorButtons(): void {
    floorSelector?.setActive(editingFloor);
}

function initFloorControls(): void {
    floorSelector = initFloorSelector('floorSelector', editingFloor, (z) => {
        editingFloor = z;
        player.worldZ = z;
        syncGridPlayerVisual(player, TILE_SIZE_SCREEN);
        updateFloorButtons();
    });
}

function buildCurrentMapDocument() {
    const entry = MAP_REGISTRY.find((m) => m.id === currentMapId);
    return serializeMapDocument(worldMap, {
        name: entry?.name ?? currentMapId ?? 'mapa',
        mapId: currentMapId,
        size: activeMapSize,
        spawn: {
            x: player.tileX,
            y: player.tileY,
            z: player.worldZ,
        },
        metadata: worldMetadata,
        houses: worldHouses,
        spawns: worldSpawns,
        portals: worldPortals,
        tileRegistry: TILE_TYPES,
    });
}

function getCurrentMapExportFilename(): string {
    const entry = MAP_REGISTRY.find((m) => m.id === currentMapId);
    return entry?.file.replace(/^.*\//, '') ?? `${currentMapId ?? 'meu_mapa'}.json`;
}

function exportCurrentToDownload(filename: string) {
    const doc = buildCurrentMapDocument();
    const safeName = filename.endsWith('.json') ? filename : `${filename}.json`;
    const dataStr =
        'data:text/json;charset=utf-8,' +
        encodeURIComponent(formatMapDocumentJson(doc));
    const a = document.createElement('a');
    a.setAttribute('href', dataStr);
    a.setAttribute('download', safeName);
    document.body.appendChild(a);
    a.click();
    a.remove();
    toast.success(`Download iniciado: ${safeName}`);
}

async function saveCurrentMapToPublicDev(filename?: string) {
    if (isInsideMapInstance()) {
        const proceed = await popup.confirm(
            'Você está dentro de uma dungeon INSTANCIADA (cópia em memória). Salvar em public/maps/ vai sobrescrever o TEMPLATE no disco para todos os jogadores, não só esta run. Continuar?',
            'Salvar template'
        );
        if (!proceed) return;
    }

    const entry = await ensureMapEntryForSave(currentMapId, activeMapSize);
    if (!entry) {
        toast.info('Salvar cancelado. Use Mapas → Novo mapa para registrar um ID antes de pintar.');
        return;
    }

    if (currentMapId !== entry.id) {
        currentMapId = entry.id;
        updateActiveMapHud();
    }

    const file =
        filename ??
        entry.file.replace(/^.*\//, '') ??
        `${entry.id}.json`;
    const doc = buildCurrentMapDocument();
    const result = await saveMapDocumentToDevPublic(file, doc);
    if (result.ok) {
        writeStudioLastMapId(entry.id);
        void saveTileCatalogToDevPublic(TILE_TYPES);
        toast.success(`Mapa "${entry.name}" salvo em ${result.path}. Ao atualizar, o studio reabre este mapa.`);
        console.log(`[Map Dev Save] ${result.path} (mapId=${entry.id})`);
    } else {
        toast.error(result.error);
    }
}

// Exportar / importar mapa (formato engine MapDocument v1)
document.getElementById('exportBtn')!.onclick = () => {
    exportCurrentToDownload(getCurrentMapExportFilename());
};

const saveMapDevBtn = document.getElementById('saveMapDevBtn');
if (!import.meta.env.DEV) {
    saveMapDevBtn?.remove();
} else {
    saveMapDevBtn?.addEventListener('click', () => {
        void saveCurrentMapToPublicDev();
    });
}

const importMapInput = document.getElementById('importMapInput') as HTMLInputElement | null;
document.getElementById('importMapBtn')?.addEventListener('click', () => {
    importMapInput?.click();
});
importMapInput?.addEventListener('change', () => {
    const file = importMapInput.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
        try {
            const raw = JSON.parse(reader.result as string);
            const loaded = loadMapFromJson(raw, mapSpawn, TILE_TYPES);
            saveState();
            applyLoadedMap(loaded);
            console.log('[Engine] Mapa carregado:', loaded.name, loaded.spawn);
            toast.success(`Mapa "${loaded.name}" carregado com sucesso!`);
        } catch (err) {
            console.error('[Engine] Falha ao importar mapa:', err);
            popup.alert('JSON de mapa inválido. Use export v1 ou formato legado.', 'Falha na Importação');
        }
        importMapInput.value = '';
    };
    reader.readAsText(file);
});

/**
 * Aplica um mapa já carregado (resultado de loadMapFromJson) ao estado global.
 * Centraliza a lógica que antes estava duplicada no importMapInput e no futuro transitionToMap.
 */
function applyLoadedMap(loaded: ReturnType<typeof loadMapFromJson>) {
    const mapEntry = loaded.mapId ? MAP_REGISTRY.find((m) => m.id === loaded.mapId) : undefined;
    if (!mapEntry?.instanced) {
        disposeActiveMapInstance();
        clearOverworldReturnContext();
    }

    const mapSize = loaded.size ?? activeMapSize;
    worldMap = ensureAllFloors(loaded.worldMap, mapSize);
    setActiveMapSize(mapSize);
    worldMetadata = loaded.metadata || {};
    worldHouses = loaded.houses || {};
    worldSpawns.length = 0;
    worldSpawns.push(...(loaded.spawns || []));
    worldPortals.length = 0;
    worldPortals.push(...(loaded.portals || []));
    currentMapId = loaded.mapId;
    if (loaded.mapId && isStudioMode()) {
        writeStudioLastMapId(loaded.mapId);
    }
    mapSpawn = {
        ...loaded.spawn,
        z: clampFloorZ(loaded.spawn.z),
    };
    player.tileX = loaded.spawn.x;
    player.tileY = loaded.spawn.y;
    player.worldZ = mapSpawn.z;
    syncGridPlayerVisual(player, TILE_SIZE_SCREEN);
    editingFloor = player.worldZ;
    updateFloorButtons();
    refreshPlayerMovementSpeed();
    respawnEntities();
    portalEditorController?.refresh();
    spawnEditorController?.refresh();
    history.clear();
    updateHistoryButtons();
    resetPortalTriggerState();
    updateActiveMapHud();
}

function createBlankMap(entry: MapEntry) {
    const size = Math.min(ENGINE_CONFIG.MAP_SIZE, Math.max(8, Math.floor(entry.size)));
    const empty = ensureAllFloors(createEmptyWorldMap(size), size);
    applyLoadedMap({
        worldMap: empty,
        spawn: { x: Math.floor(size / 2), y: Math.floor(size / 2), z: 0 },
        name: entry.name,
        mapId: entry.id,
        size,
        metadata: {},
        houses: {},
        spawns: [],
        portals: [],
    });
}

function duplicateFromCurrent(entry: MapEntry) {
    const doc = serializeMapDocument(worldMap, {
        name: entry.name,
        mapId: entry.id,
        size: activeMapSize,
        spawn: mapSpawn,
        metadata: worldMetadata,
        houses: worldHouses,
        spawns: worldSpawns,
        portals: worldPortals,
        tileRegistry: TILE_TYPES,
    });
    const loaded = loadMapFromJson(doc, mapSpawn, TILE_TYPES);
    registerMap(entry);
    applyLoadedMap(loaded);
    exportCurrentToDownload(`${entry.id}.json`);
    toast.success(`Cópia "${entry.name}" pronta. Salve o JSON em public/maps/.`);
}

/**
 * Faz a transição do mundo ativo para outro mapa do MAP_REGISTRY.
 * Exibe tela de carregamento, busca o JSON e aplica o mapa.
 */
async function transitionToMap(targetMapId: string, overrideSpawn?: { x: number; y: number; z: number }) {
    if (isTransitioningMap) return;
    const entry = MAP_REGISTRY.find(m => m.id === targetMapId);
    if (!entry) {
        console.warn('[Multi-Map] Mapa não encontrado no registry:', targetMapId);
        toast.success(`Mapa destino "${targetMapId}" não encontrado no registry.`);
        return;
    }
    isTransitioningMap = true;
    const loadingLabel = entry.instanced
        ? `Instanciando ${entry.name}…`
        : `Carregando ${entry.name}…`;
    showLoadingOverlay(loadingLabel);
    try {
        if (entry.instanced) {
            captureOverworldReturnIfNeeded(currentMapId, {
                x: player.tileX,
                y: player.tileY,
                z: player.worldZ,
            });
            disposeActiveMapInstance();

            const template = await loadMapFile(entry, TILE_TYPES);
            const { instanceId, data } = createMapInstanceFromTemplate(entry.id, template);

            applyLoadedMap({
                ...data,
                mapId: entry.id,
                spawn: overrideSpawn ?? data.spawn,
            });
            if (overrideSpawn) {
                player.tileX = overrideSpawn.x;
                player.tileY = overrideSpawn.y;
                player.worldZ = clampFloorZ(overrideSpawn.z);
                syncGridPlayerVisual(player, TILE_SIZE_SCREEN);
            }
            toast.success(
                `Dungeon "${entry.name}" — nova instância (#${instanceId.slice(-8)})`
            );
        } else {
            disposeActiveMapInstance();
            clearOverworldReturnContext();

            const loaded = await loadMapFile(entry, TILE_TYPES);
            applyLoadedMap({
                ...loaded,
                mapId: loaded.mapId ?? entry.id,
                spawn: overrideSpawn ?? loaded.spawn,
            });
            if (overrideSpawn) {
                player.tileX = overrideSpawn.x;
                player.tileY = overrideSpawn.y;
                player.worldZ = clampFloorZ(overrideSpawn.z);
                syncGridPlayerVisual(player, TILE_SIZE_SCREEN);
            }
            toast.success(`Mapa "${entry.name}" carregado!`);
        }
    } catch (err) {
        console.error('[Multi-Map] Falha ao carregar mapa:', err);
        popup.alert(`Falha ao carregar mapa "${entry.name}". Verifique se o arquivo existe em public/maps/.`, 'Erro');
    } finally {
        isTransitioningMap = false;
        hideLoadingOverlay();
    }
}

/** Mostra overlay de carregamento com mensagem. */
function showLoadingOverlay(message = 'Carregando…') {
    let overlay = document.getElementById('mapLoadingOverlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'mapLoadingOverlay';
        overlay.style.cssText = [
            'position:fixed;inset:0;z-index:9999;display:flex;flex-direction:column;',
            'align-items:center;justify-content:center;gap:16px;',
            'background:rgba(10,11,15,0.95);backdrop-filter:blur(8px);',
            'color:#e6edf3;font-family:Inter,sans-serif;',
        ].join('');
        overlay.innerHTML = `
            <div id="mapLoadingSpinner" style="width:48px;height:48px;border:3px solid #2d3139;border-top-color:#6366f1;border-radius:50%;animation:spin 0.8s linear infinite;"></div>
            <div id="mapLoadingMsg" style="font-size:14px;opacity:0.8;"></div>
            <style>@keyframes spin{to{transform:rotate(360deg)}}</style>
        `;
        document.body.appendChild(overlay);
    }
    const msgEl = overlay.querySelector('#mapLoadingMsg');
    if (msgEl) msgEl.textContent = message;
    overlay.style.display = 'flex';
}

/** Esconde o overlay de carregamento. */
function hideLoadingOverlay() {
    const overlay = document.getElementById('mapLoadingOverlay');
    if (overlay) overlay.style.display = 'none';
}

const mapManagerUI = initMapManagerUI({
    getCurrentMapId: () => currentMapId,
    loadMapById: (mapId) => transitionToMap(mapId),
    createBlankMap,
    duplicateFromCurrent,
    exportCurrentToDownload,
    saveToPublicDev: (filename) => saveCurrentMapToPublicDev(filename),
});

document.getElementById('openMapManagerBtn')?.addEventListener('click', () => mapManagerUI.open());
document.getElementById('openMapManagerMenubarBtn')?.addEventListener('click', () => mapManagerUI.open());
document.getElementById('switchMapMenubarBtn')?.addEventListener('click', () => mapManagerUI.open());
document.getElementById('newMapBtn')?.addEventListener('click', () => {
    void promptCreateNewMap({ createBlankMap });
});

function isEntityAtTile(tx: number, ty: number, z: number, excludeId?: string): boolean {
    // Se for Administrador (GM) com Noclip ligado, ignora colisão
    const permissions = getRolePermissions(currentRole);
    const noclip = permissions.canToggleCollision && collisionToggle && !collisionToggle.checked;
    if (noclip && excludeId === 'player') return false;

    // 1. Verifica se o jogador está nesse tile
    if (excludeId !== 'player' && player.tileX === tx && player.tileY === ty && player.worldZ === z) {
        return true;
    }
    
    // 2. Verifica se algum NPC está nesse tile
    for (const npc of npcs) {
        if (npc.id !== excludeId && npc.tileX === tx && npc.tileY === ty && npc.worldZ === z) {
            return true;
        }
    }
    
    return false;
}

function isWalkable(
    worldX: number,
    worldY: number,
    z: number
): {
    walkable: boolean;
    speed: number;
    isStair: boolean;
    stairDir?: 'up' | 'down';
} {
    try {
        const result = queryWalkable(createCollisionContext(), worldX, worldY, z);
        if (!result.walkable) return result;
        
        // Impede o jogador de passar por cima de NPCs
        const tx = Math.floor(worldX / TILE_SIZE_SCREEN);
        const ty = Math.floor(worldY / TILE_SIZE_SCREEN);
        if (isEntityAtTile(tx, ty, z, 'player')) {
            return { walkable: false, speed: 0, isStair: false };
        }
        
        return result;
    } catch (err) {
        console.error('Erro em isWalkable:', err);
        return { walkable: false, speed: 0, isStair: false };
    }
}

function isStairHoleAtTile(tx: number, ty: number, z: number): boolean {
    return engineIsStairHoleAtTile(createCollisionContext(), tx, ty, z);
}

// --- LOOP PRINCIPAL ---

function update() {
    const nowMs = performance.now();
    
    // Atualização de Inteligência Artificial de NPCs e monstros modularizada
    NpcAI.tickNpcAI({
        nowMs,
        npcs,
        player,
        TILE_SIZE_SCREEN,
        MAP_SIZE: activeMapSize,
        isEntityAtTile: (tx, ty, z, excludeId) => isEntityAtTile(tx, ty, z, excludeId),
        queryWalkable: (context, px, py, z) => queryWalkable(context, px, py, z),
        createCollisionContext: () => createCollisionContext()
    });

    speedBuffs.tick(nowMs);

    // Delegação da movimentação física, animação de passos e câmera para o módulo modular PlayerMovement
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
        isStairHoleAtTile: (tx, ty, z) => isStairHoleAtTile(tx, ty, z),
        getStepDurationForTile: (tx, ty, z) => getStepDurationForTile(tx, ty, z),
        updateFloorButtons: () => updateFloorButtons(),
        refreshPlayerMovementSpeed: (timeMs) => refreshPlayerMovementSpeed(timeMs),
        posXEl: posXEl as HTMLElement,
        posYEl: posYEl as HTMLElement,
        posZEl: posZEl as HTMLElement
    });

    editingFloor = result.editingFloor;

    // Portal: só dispara ao ENTRAR no tile (não enquanto parado em cima dele)
    const currentTileKey = getPlayerTileKey();
    const enteredNewTile = currentTileKey !== previousPlayerTileKey;
    if (enteredNewTile) {
        previousPlayerTileKey = currentTileKey;
    }

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

    if (statusPosEl) statusPosEl.innerText = `${player.tileX}, ${player.tileY}`;
    if (statusZEl) statusZEl.innerText = player.worldZ.toString();

    gameNet?.syncPositionIfChanged();
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
    const normalized = hex.replace('#', '').trim();
    if (normalized.length !== 6) return null;
    const n = parseInt(normalized, 16);
    if (Number.isNaN(n)) return null;
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function draw() {
    ctx.fillStyle = '#0a0b0e';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const zoom = camera.zoom || 1.0;
    ctx.save();
    ctx.scale(zoom, zoom);
    ctx.imageSmoothingEnabled = false;

    // Arredonda a câmera na escala física para evitar frestas/linhas pretas de subpixel em qualquer zoom
    const camX = Math.round(camera.x * zoom) / zoom;
    const camY = Math.round(camera.y * zoom) / zoom;

    getAllFloorZs().forEach(z => {
        const isAbove = z > player.worldZ;
        let playerUnder = false;
        if (isAbove) {
            if (worldMap[z][player.tileY] && worldMap[z][player.tileY][player.tileX] !== -1) playerUnder = true;
        }
        ctx.globalAlpha = (isAbove && playerUnder) ? 0.3 : 1.0;

        const startX = Math.max(0, Math.floor(camX / TILE_SIZE_SCREEN));
        const endX = Math.min(activeMapSize - 1, Math.floor((camX + canvas.width / zoom) / TILE_SIZE_SCREEN));
        const startY = Math.max(0, Math.floor(camY / TILE_SIZE_SCREEN));
        const endY = Math.min(activeMapSize - 1, Math.floor((camY + canvas.height / zoom) / TILE_SIZE_SCREEN));

        for (let y = startY; y <= endY; y++) {
            for (let x = startX; x <= endX; x++) {
                const tid = worldMap[z][y][x];
                if (tid !== -1) {
                    if (isVariantBrush(tid)) continue;
                    const tile = TILE_TYPES[tid];
                    if (tile && tile.image && tile.image.complete) {
                        drawRegistryTile(
                            ctx,
                            tile,
                            x * TILE_SIZE_SCREEN - camX,
                            y * TILE_SIZE_SCREEN - camY,
                            TILE_SIZE_SCREEN
                        );
                    }
                }
                
                if (activeMapEditorTab === 'zones') {
                    const meta = worldMetadata[`${z}_${y}_${x}`];
                    if (meta && meta.zoneId && meta.zoneId > 0) {
                        ctx.fillStyle = ZONE_COLORS[meta.zoneId] || 'rgba(255,255,255,0.2)';
                        ctx.fillRect(x * TILE_SIZE_SCREEN - camX, y * TILE_SIZE_SCREEN - camY, TILE_SIZE_SCREEN, TILE_SIZE_SCREEN);
                        if (meta.zoneId === ZoneType.HOUSE && meta.houseId) {
                            ctx.fillStyle = 'white';
                            ctx.font = 'bold 10px sans-serif';
                            ctx.textAlign = 'center';
                            ctx.fillText(meta.houseId.toString(), x * TILE_SIZE_SCREEN - camX + TILE_SIZE_SCREEN / 2, y * TILE_SIZE_SCREEN - camY + TILE_SIZE_SCREEN / 2 + 4);
                        }
                    }
                }

                // Portais na aba Portais (andar de edição ativo)
                if (activeMapEditorTab === 'portals') {
                    const portal = worldPortals.find(p => p.tileX === x && p.tileY === y && p.tileZ === z);
                    if (portal && z === editingFloor) {
                        const isHighlighted = portal.id === highlightedPortalId;
                        const pulse = (Math.sin(Date.now() / (isHighlighted ? 100 : 400)) + 1) / 2;
                        if (isHighlighted) {
                            ctx.fillStyle = `rgba(251, 191, 36, ${0.35 + pulse * 0.35})`;
                            ctx.fillRect(x * TILE_SIZE_SCREEN - camX, y * TILE_SIZE_SCREEN - camY, TILE_SIZE_SCREEN, TILE_SIZE_SCREEN);
                            ctx.strokeStyle = `rgba(245, 158, 11, ${0.85 + pulse * 0.15})`;
                            ctx.lineWidth = 3;
                            ctx.strokeRect(x * TILE_SIZE_SCREEN - camX + 1, y * TILE_SIZE_SCREEN - camY + 1, TILE_SIZE_SCREEN - 2, TILE_SIZE_SCREEN - 2);
                        } else {
                            ctx.fillStyle = `rgba(99, 102, 241, ${0.25 + pulse * 0.2})`;
                            ctx.fillRect(x * TILE_SIZE_SCREEN - camX, y * TILE_SIZE_SCREEN - camY, TILE_SIZE_SCREEN, TILE_SIZE_SCREEN);
                            ctx.strokeStyle = `rgba(129, 140, 248, ${0.6 + pulse * 0.3})`;
                            ctx.lineWidth = 2;
                            ctx.strokeRect(x * TILE_SIZE_SCREEN - camX + 1, y * TILE_SIZE_SCREEN - camY + 1, TILE_SIZE_SCREEN - 2, TILE_SIZE_SCREEN - 2);
                        }
                        ctx.fillStyle = isHighlighted ? 'rgba(255,251,235,0.95)' : 'rgba(200,210,255,0.9)';
                        ctx.font = `${Math.round(TILE_SIZE_SCREEN * 0.4)}px sans-serif`;
                        ctx.textAlign = 'center';
                        ctx.fillText('🚪', x * TILE_SIZE_SCREEN - camX + TILE_SIZE_SCREEN / 2, y * TILE_SIZE_SCREEN - camY + TILE_SIZE_SCREEN / 2 + TILE_SIZE_SCREEN * 0.14);
                    }
                }

                if (activeMapEditorTab === 'spawns') {
                    const spawn = worldSpawns.find((s) => s.x === x && s.y === y && s.z === z);
                    if (spawn && z === editingFloor) {
                        const isHighlighted = spawn.id === highlightedSpawnId;
                        const pulse = (Math.sin(Date.now() / (isHighlighted ? 100 : 400)) + 1) / 2;
                        const baseColor = getSpawnDisplayColor(spawn);
                        const rgb = hexToRgb(baseColor);
                        if (isHighlighted) {
                            ctx.fillStyle = `rgba(251, 191, 36, ${0.35 + pulse * 0.35})`;
                            ctx.fillRect(x * TILE_SIZE_SCREEN - camX, y * TILE_SIZE_SCREEN - camY, TILE_SIZE_SCREEN, TILE_SIZE_SCREEN);
                            ctx.strokeStyle = `rgba(245, 158, 11, ${0.9 + pulse * 0.1})`;
                            ctx.lineWidth = 3;
                        } else if (rgb) {
                            ctx.fillStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${0.2 + pulse * 0.15})`;
                            ctx.fillRect(x * TILE_SIZE_SCREEN - camX, y * TILE_SIZE_SCREEN - camY, TILE_SIZE_SCREEN, TILE_SIZE_SCREEN);
                            ctx.strokeStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${0.65 + pulse * 0.25})`;
                            ctx.lineWidth = 2;
                        }
                        ctx.strokeRect(x * TILE_SIZE_SCREEN - camX + 1, y * TILE_SIZE_SCREEN - camY + 1, TILE_SIZE_SCREEN - 2, TILE_SIZE_SCREEN - 2);
                        ctx.fillStyle = isHighlighted ? 'rgba(255,251,235,0.95)' : 'rgba(255,255,255,0.92)';
                        ctx.font = `${Math.round(TILE_SIZE_SCREEN * 0.38)}px sans-serif`;
                        ctx.textAlign = 'center';
                        ctx.fillText(spawn.type === 'monster' ? '👾' : '👤', x * TILE_SIZE_SCREEN - camX + TILE_SIZE_SCREEN / 2, y * TILE_SIZE_SCREEN - camY + TILE_SIZE_SCREEN / 2 + TILE_SIZE_SCREEN * 0.14);
                    }
                }
                
                if (worldMetadata[`${z}_${y}_${x}`] && (worldMetadata[`${z}_${y}_${x}`].actionId || worldMetadata[`${z}_${y}_${x}`].uniqueId)) {
                    ctx.fillStyle = 'rgba(234, 179, 8, 0.8)';
                    ctx.beginPath();
                    ctx.arc(x * TILE_SIZE_SCREEN - camX + TILE_SIZE_SCREEN - 6, y * TILE_SIZE_SCREEN - camY + 6, 3, 0, Math.PI * 2);
                    ctx.fill();
                }

                if (editingTileKey === `${z}_${y}_${x}`) {
                    const glow = (Math.sin(Date.now() / 150) + 1) / 2;
                    ctx.strokeStyle = `rgba(234, 179, 8, ${0.4 + glow * 0.6})`;
                    ctx.lineWidth = 2;
                    ctx.strokeRect(x * TILE_SIZE_SCREEN - camX + 1, y * TILE_SIZE_SCREEN - camY + 1, TILE_SIZE_SCREEN - 2, TILE_SIZE_SCREEN - 2);
                }
            }
        }
        
        // Desenha a visualização fantasma (preview) da ferramenta (Linha ou Retângulo)
        if (player.worldZ === z && previewOverlay) {
            ctx.globalAlpha = 0.5;
            const previewTile = TILE_TYPES[mapEditorController.selectedTileType];
            if (previewTile && previewTile.image && previewTile.image.complete) {
                if (previewOverlay.type === 'rectangle') {
                    const minX = Math.min(previewOverlay.x1, previewOverlay.x2);
                    const maxX = Math.max(previewOverlay.x1, previewOverlay.x2);
                    const minY = Math.min(previewOverlay.y1, previewOverlay.y2);
                    const maxY = Math.max(previewOverlay.y1, previewOverlay.y2);
                    for (let py = minY; py <= maxY; py++) {
                        for (let px = minX; px <= maxX; px++) {
                            ctx.drawImage(previewTile.image, px * TILE_SIZE_SCREEN - camX, py * TILE_SIZE_SCREEN - camY, TILE_SIZE_SCREEN, TILE_SIZE_SCREEN);
                        }
                    }
                } else if (previewOverlay.type === 'line') {
                    let px1 = previewOverlay.x1, py1 = previewOverlay.y1;
                    let px2 = previewOverlay.x2, py2 = previewOverlay.y2;
                    let pdx = Math.abs(px2 - px1), pdy = Math.abs(py2 - py1);
                    let psx = (px1 < px2) ? 1 : -1, psy = (py1 < py2) ? 1 : -1;
                    let perr = pdx - pdy;
                    while (true) {
                        ctx.drawImage(previewTile.image, px1 * TILE_SIZE_SCREEN - camX, py1 * TILE_SIZE_SCREEN - camY, TILE_SIZE_SCREEN, TILE_SIZE_SCREEN);
                        if (px1 === px2 && py1 === py2) break;
                        let pe2 = 2 * perr;
                        if (pe2 > -pdy) { perr -= pdy; px1 += psx; }
                        if (pe2 < pdx) { perr += pdx; py1 += psy; }
                    }
                }
            }
            ctx.globalAlpha = 1.0;
        }

        if (z === editingFloor && paintBrushPreview && shouldShowPaintBrushSizeBar()) {
            drawPaintBrushPreview(ctx, camX, camY, paintBrushPreview.tx, paintBrushPreview.ty);
        }

        // Desenha todos os NPCs no andar atual
        npcs.forEach(npc => {
            if (npc.worldZ === z) {
                npc.draw(ctx, { ...camera, x: camX, y: camY } as any, TILE_SIZE_SCREEN);
                
                // Desenha o nome do NPC baseado no topo real do sprite (cabeça)
                const placement = npc.getDrawPlacement({ ...camera, x: camX, y: camY, zoom }, TILE_SIZE_SCREEN);
                const nameX = placement.drawX + placement.drawW / 2 - 10;
                const nameY = placement.drawY - 6;

                ctx.font = "bold 11px 'Outfit', 'Courier New', monospace";
                ctx.textAlign = 'center';
                
                // Borda preta estilo jogo retro de Tibia/RPG
                ctx.strokeStyle = '#000000';
                ctx.lineWidth = 2.5;
                ctx.strokeText(npc.name, nameX, nameY);
                
                // Preenchimento verde
                ctx.fillStyle = '#4ade80';
                ctx.fillText(npc.name, nameX, nameY);
            }
        });

        if (currentMapId && gameNet) {
            for (const remote of gameNet.getRemotePlayers(
                currentMapId,
                gameNet.getNetworkInstanceId()
            )) {
                if (remote.z !== z) continue;
                const rx = remote.tileX * TILE_SIZE_SCREEN - camX;
                const ry = remote.tileY * TILE_SIZE_SCREEN - camY;
                
                // Desenha o corpo do player remoto
                ctx.fillStyle = 'rgba(244, 114, 182, 0.85)';
                ctx.fillRect(rx + 10, ry + 10, TILE_SIZE_SCREEN - 20, TILE_SIZE_SCREEN - 20);
                ctx.strokeStyle = '#fda4af';
                ctx.lineWidth = 2;
                ctx.strokeRect(rx + 10, ry + 10, TILE_SIZE_SCREEN - 20, TILE_SIZE_SCREEN - 20);
                
                // Nome com borda preta estilo retro RPG
                ctx.font = "bold 11px 'Outfit', 'Courier New', monospace";
                ctx.textAlign = 'center';
                
                ctx.strokeStyle = '#000000';
                ctx.lineWidth = 2.5;
                ctx.strokeText(remote.name, rx + TILE_SIZE_SCREEN / 2 - 10, ry - 6);
                
                ctx.fillStyle = '#fda4af';
                ctx.fillText(remote.name, rx + TILE_SIZE_SCREEN / 2 - 10, ry - 6);
            }
        }

        if (player.worldZ === z) {
            const hidePlayer = getStudioBoot()?.hidePlayerSprite === true;
            if (!hidePlayer && activeCharacterController.isLoaded && activeCharacterController.image) {
                const rect = activeCharacterController.getSourceRect();
                const sw = rect.sw;
                const sh = rect.sh;
                // Alinhamento Centro-Inferior (Bottom-Center)
                const rawX = player.worldX - camX + (TILE_SIZE_SCREEN - sw) / 2 + rect.ax;
                const rawY = player.worldY - camY + (TILE_SIZE_SCREEN - sh) + rect.ay;
                const drawX = Math.round(rawX * zoom) / zoom;
                const drawY = Math.round(rawY * zoom) / zoom;
                
                ctx.drawImage(
                    activeCharacterController.image,
                    rect.sx, rect.sy, sw, sh - 0.5,
                    drawX, drawY,
                    sw, sh
                );
            } else if (!hidePlayer) {
                const knight = TILE_TYPES[6];
                if (knight && knight.image && knight.image.complete) {
                    ctx.drawImage(knight.image, player.worldX - camX, player.worldY - camY, TILE_SIZE_SCREEN, TILE_SIZE_SCREEN);
                }
            }

            if (!hidePlayer) {
            // Desenha o nome do jogador acima dele (com borda preta retro estilo RPG/Tibia)
            const pRect = activeCharacterController.getSourceRect();
            const pSw = pRect.sw;
            const pSh = pRect.sh;
            const pRawX = player.worldX - camX + (TILE_SIZE_SCREEN - pSw) / 2 + pRect.ax;
            const pRawY = player.worldY - camY + (TILE_SIZE_SCREEN - pSh) + pRect.ay;
            const pDrawX = Math.round(pRawX * zoom) / zoom;
            const pDrawY = Math.round(pRawY * zoom) / zoom;
            const pNameX = pDrawX + pSw / 2 - 10;
            const pNameY = pDrawY - 6;

            ctx.font = "bold 11px 'Outfit', 'Courier New', monospace";
            ctx.textAlign = 'center';
            
            // Borda preta
            ctx.strokeStyle = '#000000';
            ctx.lineWidth = 2.5;
            ctx.strokeText(activeCharacterController.config.name, pNameX, pNameY);
            
            // Preenchimento azul claro
            ctx.fillStyle = '#38bdf8';
            ctx.fillText(activeCharacterController.config.name, pNameX, pNameY);
            }
        }
    });

    ctx.restore();
}

function drawMinimap() {
    mCtx.fillStyle = '#000';
    mCtx.fillRect(0, 0, 150, 150);
    const step = 150 / activeMapSize;
    const floor = worldMap[player.worldZ];
    for (let y = 0; y < activeMapSize; y++) {
        for (let x = 0; x < activeMapSize; x++) {
            if (floor[y][x] !== -1) {
                const colors = ['#2d5a27', '#374151', '#1e3a8a', '#78350f', '#1f2937', '#064e3b', '#7f1d1d'];
                mCtx.fillStyle = colors[floor[y][x]] || '#333';
                mCtx.fillRect(x * step, y * step, step, step);
            }
        }
    }
    mCtx.fillStyle = '#fff';
    mCtx.fillRect(player.tileX * step, player.tileY * step, 2, 2);
}

let lastLogged = 0;
function loop() {
    update();
    draw();
    drawMinimap();
    
    if (Date.now() - lastLogged > 2000) {
        const lx = player.tileX * TILE_SIZE_SCREEN;
        const ly = player.tileY * TILE_SIZE_SCREEN;
        console.log("PLAYER tile:", player.tileX, player.tileY, "visual:", player.worldX, player.worldY, "Z:", player.worldZ);
        console.log("IS WALKABLE AT TILE:", isWalkable(lx, ly, player.worldZ));
        lastLogged = Date.now();
    }
    
    requestAnimationFrame(loop);
}

function resize() {
    const container = document.getElementById('canvasContainer')!;
    canvas.width = container.clientWidth;
    canvas.height = container.clientHeight;
    ctx.imageSmoothingEnabled = false;
}

function initMapEditorTabSwitching() {
    const tabsContainer = document.getElementById('mapEditorTabs');
    if (!tabsContainer) return;

    tabsContainer.addEventListener('click', (e) => {
        const btn = (e.target as Element).closest('[data-map-tab]');
        if (!btn) return;

        const targetTab = btn.getAttribute('data-map-tab');
        if (!targetTab) return;

        // Atualiza botões de abas ativas
        tabsContainer.querySelectorAll('[data-map-tab]').forEach(b => {
            b.classList.toggle('active', b === btn);
        });

        activeMapEditorTab = targetTab;

        if (targetTab === 'spawns') {
            spawnEditorController?.syncToolButtons();
        }

        // Mostra/oculta os conteúdos internos
        document.querySelectorAll('.map-tab-content').forEach(content => {
            const isTarget = content.id === `mapTabContent_${targetTab}`;
            (content as HTMLElement).style.display = isTarget ? 'block' : 'none';
        });

        updatePaintBrushSizeBarVisibility();
    });
}

window.addEventListener('resize', resize);
resize();
initMapEditorTabSwitching();

const gameZoomSelect = document.getElementById('gameZoomSelect') as HTMLSelectElement | null;
if (gameZoomSelect) {
    try {
        const savedZoom = localStorage.getItem('game2d_camera_zoom');
        if (savedZoom) {
            camera.zoom = parseFloat(savedZoom) || 1.0;
            gameZoomSelect.value = savedZoom;
        }
    } catch (e) {
        console.error(e);
    }

    gameZoomSelect.addEventListener('change', () => {
        const val = parseFloat(gameZoomSelect.value);
        if (!Number.isNaN(val) && val > 0) {
            camera.zoom = val;
            try {
                localStorage.setItem('game2d_camera_zoom', val.toString());
            } catch (e) {
                console.error(e);
            }
        }
    });
}

// Oculta a tela de carregamento após o boot do editor (window.load pode já ter disparado)
function dismissLoadingScreen(): void {
    const loadingScreen = document.getElementById('loadingScreen');
    if (!loadingScreen) return;
    loadingScreen.classList.add('fade-out');
    setTimeout(() => {
        loadingScreen.remove();
    }, 500);
}

function initBlankStudioWorld(): void {
    currentMapId = undefined;
    worldMetadata = {};
    worldHouses = {};
    worldSpawns.length = 0;
    worldPortals.length = 0;
    mapSpawn = { x: player.tileX, y: player.tileY, z: player.worldZ };
    respawnEntities();
    resetPortalTriggerState();
    updateActiveMapHud();
    updateFloorButtons();
    history.clear();
    updateHistoryButtons();
}

async function tryRestoreStudioSession(): Promise<boolean> {
    const mapId = await resolveStudioMapIdToLoad();
    if (!mapId) return false;

    try {
        await transitionToMap(mapId);
        return true;
    } catch (err) {
        console.warn('[Studio] Falha ao restaurar mapa:', mapId, err);
        return false;
    }
}

async function bootstrapApp(): Promise<void> {
    try {
        await tileRegistryReady;
        await refreshCreatureCatalog();

        if (isStudioMode() && getStudioBoot()?.blankMap) {
            const restored = await tryRestoreStudioSession();
            if (!restored) {
                initBlankStudioWorld();
            }
        } else {
            await initDefaultWorld();
        }
    } finally {
        dismissLoadingScreen();
    }
}

async function initDefaultWorld() {
    const entry = MAP_REGISTRY.find((m) => m.id === 'mainland') ?? MAP_REGISTRY[0];
    if (!entry) return;
    try {
        const loaded = await loadMapFile(entry, TILE_TYPES);
        applyLoadedMap({
            ...loaded,
            mapId: loaded.mapId ?? entry.id,
        });
    } catch (err) {
        console.warn('[Multi-Map] Mapa inicial não carregado:', err);
    }
}

void bootstrapApp();
loop();

// --- SISTEMA DE CASAS (HOUSE MANAGER) ---
initHouseManager({
    worldHouses,
    player,
    tileSizeScreen: TILE_SIZE_SCREEN,
    setEditingFloor: (z) => { editingFloor = z; },
    updateFloorButtons
});
