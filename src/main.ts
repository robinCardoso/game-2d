import './style.css';
import { HistoryManager } from './functions/history';
import { AccountType, getRolePermissions } from './functions/roles';
import { toast, popup } from './utils/popup';
import { SpriteAnimationController } from './character/spriteAnimation';
import { createDefaultCharacterConfig } from './character/characterSerializer';
import { GameEntity } from './character/entity';
import { initCharacterEditor } from './editor/characterEditor';
import { initMapSpriteEditor } from './editor/mapSpriteEditor';
import {
    ENGINE_CONFIG,
    buildTileRegistry,
    clampFloorZ,
    createDefaultStarterMap,
    ensureAllFloors,
    getAllFloorZs,
    getTerrainSpeedModifierAt,
    isStairHoleAtTile as engineIsStairHoleAtTile,
    loadMapFromJson,
    queryWalkable,
    serializeMapDocument,
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
    tickGridMovement,
} from './movement/gridMovement';

// --- ENGINE ---
const TILE_SIZE_SCREEN = ENGINE_CONFIG.TILE_SIZE;
const MAP_SIZE = ENGINE_CONFIG.MAP_SIZE;
export let TILE_TYPES = buildTileRegistry();

let worldMap: WorldMap = ensureAllFloors(createDefaultStarterMap());
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
        mapSize: MAP_SIZE,
        tileSize: TILE_SIZE_SCREEN,
        minFloorZ: ENGINE_CONFIG.MIN_FLOOR_Z,
        maxFloorZ: ENGINE_CONFIG.MAX_FLOOR_Z,
        collisionEnabled: !noclip,
        hasBoatEquipped: !!(boatToggle && boatToggle.checked),
    };
}

// --- VARIÁVEIS DE CONTROLE ---
let selectedTileType = 0;
let editingFloor = 0;
let currentTool: 'pencil' | 'bucket' | 'eraser' | 'eyedropper' | 'rectangle' | 'line' = 'pencil';
let currentCategory: string = 'all';

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
const collisionToggle = document.getElementById('collisionToggle') as HTMLInputElement;
const boatToggle = document.getElementById('boatToggle') as HTMLInputElement;
const roleSelector = document.getElementById('roleSelector') as HTMLSelectElement;
const roleBadge = document.getElementById('roleBadge') as HTMLSpanElement;
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
const camera = { x: 0, y: 0 };
const keys: Record<string, boolean> = {};
const gridMovement = createGridMovementController();

/** Stats persistentes — `character/movementSpeed.ts`. */
const characterSpeed: CharacterSpeedState = createDefaultCharacterSpeed();
const playerEquipment: EquipmentState = createDefaultEquipment();
const speedBuffs = new SpeedBuffManager();

// Tenta carregar o preset do localStorage se existir
function getSavedOrInitialCharacterConfig() {
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

export const activeCharacterController = new SpriteAnimationController(getSavedOrInitialCharacterConfig());

// Instanciação de NPCs de teste para validar o sistema de Outfits/Multi-entidades
export const npcs: GameEntity[] = [
    new GameEntity('npc_1', 'Trainer Knight', createDefaultCharacterConfig(), 52, 50, 0),
    new GameEntity('npc_2', 'Guard Knight', createDefaultCharacterConfig(), 48, 52, 0),
    new GameEntity('npc_3', 'Wizard Apprentice', createDefaultCharacterConfig(), 50, 48, 0)
];

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

editorShell = initEditorShell();
initGridPlayerPosition(player, TILE_SIZE_SCREEN);
initFloorControls();
syncEquipmentToStats();
refreshPlayerMovementSpeed();
setupMovementDevControls();
updateRoleUI();
initCharacterEditor();
initMapSpriteEditor();

async function loadCustomTileProperties() {
    try {
        const response = await fetch('/api/list-tile-properties');
        if (response.ok) {
            const result = await response.json();
            if (result.properties) {
                const { mergeCustomTileProperties } = await import('./functions/tileConfig');
                mergeCustomTileProperties(result.properties);
                TILE_TYPES = buildTileRegistry();
                initEditorUI();
            }
        }
    } catch (err) {
        console.error('[Engine] Erro ao carregar propriedades customizadas dos tiles:', err);
    }
}
loadCustomTileProperties();

// --- LÓGICA DE INICIALIZAÇÃO ---

function initEditorUI() {
    const selector = document.getElementById('tileSelector')!;
    selector.innerHTML = '';

    Object.values(TILE_TYPES).forEach(tile => {
        if (tile.id === -1) return;
        if (currentCategory !== 'all' && tile.category !== currentCategory) return;

        const div = document.createElement('div');
        div.className = `tile-option ${selectedTileType === tile.id ? 'active' : ''}`;

        const previewStyles = `background-image: url('${tile.image?.src}'); background-size: cover; background-position: center; image-rendering: pixelated;`;

        div.innerHTML = `
            <div class="tile-preview" style="${previewStyles}"></div>
            <span style="text-transform: capitalize;">${tile.name}</span>
        `;
        div.onclick = () => {
            document.querySelectorAll('.tile-option').forEach(el => el.classList.remove('active'));
            div.classList.add('active');
            selectedTileType = tile.id;
            if(currentTool === 'eraser' || currentTool === 'eyedropper') setTool('pencil');
        };
        selector.appendChild(div);
    });
}

initEditorUI();

// --- FERRAMENTAS DO EDITOR ---

function setTool(tool: any) {
    currentTool = tool;
    document.querySelectorAll('.tool-btn').forEach(btn => {
        btn.classList.toggle('active', (btn as HTMLElement).dataset.tool === tool);
    });
}

document.querySelectorAll('.tool-btn').forEach(btn => {
    (btn as HTMLElement).onclick = () => setTool((btn as HTMLElement).dataset.tool);
});

// CATEGORIAS
document.querySelectorAll('.cat-btn').forEach(btn => {
    (btn as HTMLElement).onclick = () => {
        document.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentCategory = (btn as HTMLElement).dataset.cat!;
        initEditorUI();
    };
});

function floodFill(z: number, x: number, y: number, targetId: number, replacementId: number) {
    if (targetId === replacementId) return;
    if (worldMap[z][y][x] !== targetId) return;
    
    const stack = [[x, y]];
    while (stack.length > 0) {
        const [cx, cy] = stack.pop()!;
        if (worldMap[z][cy][cx] === targetId) {
            worldMap[z][cy][cx] = replacementId;
            if (cx > 0) stack.push([cx - 1, cy]);
            if (cx < MAP_SIZE - 1) stack.push([cx + 1, cy]);
            if (cy > 0) stack.push([cx, cy - 1]);
            if (cy < MAP_SIZE - 1) stack.push([cx, cy + 1]);
        }
    }
}

// --- SISTEMA DE ENTRADA E DESENHO ---
let startX = 0;
let startY = 0;
let previewOverlay: {type: string, x1: number, y1: number, x2: number, y2: number} | null = null;

function paint(e: MouseEvent) {
    const rect = canvas.getBoundingClientRect();
    const tx = Math.floor((e.clientX - rect.left + camera.x) / TILE_SIZE_SCREEN);
    const ty = Math.floor((e.clientY - rect.top + camera.y) / TILE_SIZE_SCREEN);
    
    if (tx >= 0 && tx < MAP_SIZE && ty >= 0 && ty < MAP_SIZE) {
        if (currentTool === 'eyedropper') {
            const picked = worldMap[editingFloor][ty][tx];
            if (picked !== -1) {
                selectedTileType = picked;
                initEditorUI();
                setTool('pencil');
            }
        } else if (currentTool === 'pencil') {
            worldMap[editingFloor][ty][tx] = selectedTileType;
        } else if (currentTool === 'eraser') {
            worldMap[editingFloor][ty][tx] = -1;
        } else if (currentTool === 'bucket') {
            const target = worldMap[editingFloor][ty][tx];
            floodFill(editingFloor, tx, ty, target, selectedTileType);
        }
    }
}

canvas.addEventListener('mousedown', e => {
    if (!getRolePermissions(currentRole).canEditMap) {
        return;
    }
    // Permite pintar o mapa APENAS quando o painel unificado de edição de mapa (map_editor) está ativo
    const activePanel = editorShell?.getActivePanel();
    const isMapEditPanelActive = activePanel === 'map_editor';
    if (!isMapEditPanelActive) {
        return;
    }
    const rect = canvas.getBoundingClientRect();
    const tx = Math.floor((e.clientX - rect.left + camera.x) / TILE_SIZE_SCREEN);
    const ty = Math.floor((e.clientY - rect.top + camera.y) / TILE_SIZE_SCREEN);
    
    if (currentTool === 'rectangle' || currentTool === 'line') {
        startX = tx;
        startY = ty;
        previewOverlay = { type: currentTool, x1: tx, y1: ty, x2: tx, y2: ty };
        
        const onMove = (me: MouseEvent) => {
            const cx = Math.floor((me.clientX - rect.left + camera.x) / TILE_SIZE_SCREEN);
            const cy = Math.floor((me.clientY - rect.top + camera.y) / TILE_SIZE_SCREEN);
            previewOverlay = { type: currentTool, x1: startX, y1: startY, x2: cx, y2: cy };
        };
        const onUp = (me: MouseEvent) => {
            const cx = Math.floor((me.clientX - rect.left + camera.x) / TILE_SIZE_SCREEN);
            const cy = Math.floor((me.clientY - rect.top + camera.y) / TILE_SIZE_SCREEN);
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
            canvas.addEventListener('mousemove', onMove);
            window.addEventListener('mouseup', () => canvas.removeEventListener('mousemove', onMove), { once: true });
        }
    }
});

function applyShape(type: string, x1: number, y1: number, x2: number, y2: number) {
    const minX = Math.max(0, Math.min(x1, x2));
    const maxX = Math.min(MAP_SIZE - 1, Math.max(x1, x2));
    const minY = Math.max(0, Math.min(y1, y2));
    const maxY = Math.min(MAP_SIZE - 1, Math.max(y1, y2));

    if (type === 'rectangle') {
        for (let y = minY; y <= maxY; y++) {
            for (let x = minX; x <= maxX; x++) {
                worldMap[editingFloor][y][x] = selectedTileType;
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
            if (cx >= 0 && cx < MAP_SIZE && cy >= 0 && cy < MAP_SIZE) {
                worldMap[editingFloor][cy][cx] = selectedTileType;
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
        triggerPlayerAttack();
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
    
    if (key === 'p') setTool('pencil');
    if (key === 'b') setTool('bucket');
    if (key === 'e') setTool('eraser');
    if (key === 'i') setTool('eyedropper');
    if (key === 'u') setTool('rectangle');
    if (key === 'l') setTool('line');
});
window.addEventListener('keyup', e => keys[e.key.toLowerCase()] = false);

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

// Exportar / importar mapa (formato engine MapDocument v1)
document.getElementById('exportBtn')!.onclick = () => {
    const doc = serializeMapDocument(worldMap, {
        name: 'meu_mapa',
        spawn: {
            x: player.tileX,
            y: player.tileY,
            z: player.worldZ,
        },
    });
    const dataStr =
        'data:text/json;charset=utf-8,' +
        encodeURIComponent(JSON.stringify(doc, null, 2));
    const a = document.createElement('a');
    a.setAttribute('href', dataStr);
    a.setAttribute('download', 'meu_mapa.json');
    document.body.appendChild(a);
    a.click();
    a.remove();
};

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
            const loaded = loadMapFromJson(raw, mapSpawn);
            saveState();
            worldMap = ensureAllFloors(loaded.worldMap);
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
let lastNpcMoveTime = 0;
function tickNpcAI(nowMs: number) {
    npcs.forEach(npc => {
        // 1. VERIFICAÇÃO DE PROXIMIDADE DO JOGADOR (Interação)
        const dxToPlayer = player.tileX - npc.tileX;
        const dyToPlayer = player.tileY - npc.tileY;
        const distToPlayer = Math.abs(dxToPlayer) + Math.abs(dyToPlayer);
        
        const isNearPlayer = (distToPlayer <= 1.5 && player.worldZ === npc.worldZ);

        if (isNearPlayer) {
            // Se o jogador estiver muito perto, o NPC para e olha na direção dele!
            if (npc.animController.currentState === 'walk') {
                npc.setState('idle');
            }
            
            // Determina a direção olhando para o jogador
            if (Math.abs(dxToPlayer) > Math.abs(dyToPlayer)) {
                npc.setDirection(dxToPlayer > 0 ? 'right' : 'left');
            } else {
                npc.setDirection(dyToPlayer > 0 ? 'down' : 'up');
            }

            // Fala aleatoriamente se ainda não estiver falando
            if (!npc.dialogueText && Math.random() < 0.005) {
                const phrases = [
                    "Olá, aventureiro!",
                    "Belo dia para explorar!",
                    "Precisa de ajuda?",
                    "Aperte Espaço para atacar!",
                    "Aperte X para sentar!",
                    "Aperte H para morrer!"
                ];
                npc.speak(phrases[Math.floor(Math.random() * phrases.length)]);
            }
            return; // Interrompe o movimento aleatório enquanto interage
        }

        // 2. MOVIMENTAÇÃO ALEATÓRIA DENTRO DO SPAWN RADIUS
        if (nowMs - lastNpcMoveTime > 3000) {
            if (Math.random() < 0.4) { // 40% de chance de decidir andar
                const dirs = ['up', 'down', 'left', 'right'] as const;
                const randomDir = dirs[Math.floor(Math.random() * dirs.length)];
                npc.setDirection(randomDir);
                
                let dx = 0;
                let dy = 0;
                if (randomDir === 'up') dy = -1;
                else if (randomDir === 'down') dy = 1;
                else if (randomDir === 'left') dx = -1;
                else if (randomDir === 'right') dx = 1;
                
                const newTileX = npc.tileX + dx;
                const newTileY = npc.tileY + dy;
                
                // Valida se a nova coordenada está dentro do Raio Máximo (maxRadius) em relação ao Spawn Original!
                const isWithinRadius = Math.abs(newTileX - npc.spawnX) <= npc.maxRadius &&
                                       Math.abs(newTileY - npc.spawnY) <= npc.maxRadius;
                
                if (isWithinRadius && newTileX >= 0 && newTileX < MAP_SIZE && newTileY >= 0 && newTileY < MAP_SIZE) {
                    const targetPixelX = newTileX * TILE_SIZE_SCREEN;
                    const targetPixelY = newTileY * TILE_SIZE_SCREEN;
                    
                    // Valida colisão de cenário AND se o tile já está ocupado por outro NPC ou pelo Jogador!
                    const isOccupied = isEntityAtTile(newTileX, newTileY, npc.worldZ, npc.id);
                    const scenarioWalkable = queryWalkable(createCollisionContext(), targetPixelX, targetPixelY, npc.worldZ).walkable;
                    
                    if (scenarioWalkable && !isOccupied) {
                        npc.tileX = newTileX;
                        npc.tileY = newTileY;
                        npc.setState('walk');
                    }
                }
            }
        }
    });

    if (nowMs - lastNpcMoveTime > 3000) {
        lastNpcMoveTime = nowMs;
    }
    
    // Suaviza a posição física dos NPCs em direção ao tile alvo (interpolação simples)
    npcs.forEach(npc => {
        const targetWorldX = npc.tileX * TILE_SIZE_SCREEN;
        const targetWorldY = npc.tileY * TILE_SIZE_SCREEN;
        const speed = 2.5; // Pixels por frame para caminhar fluido
        
        if (npc.worldX < targetWorldX) npc.worldX = Math.min(targetWorldX, npc.worldX + speed);
        else if (npc.worldX > targetWorldX) npc.worldX = Math.max(targetWorldX, npc.worldX - speed);
        
        if (npc.worldY < targetWorldY) npc.worldY = Math.min(targetWorldY, npc.worldY + speed);
        else if (npc.worldY > targetWorldY) npc.worldY = Math.max(targetWorldY, npc.worldY - speed);
        
        if (npc.worldX === targetWorldX && npc.worldY === targetWorldY) {
            if (npc.animController.currentState === 'walk') {
                npc.setState('idle');
            }
        } else {
            npc.setState('walk');
        }
        
        npc.update(nowMs);
    });
}

function update() {
    const nowMs = performance.now();
    tickNpcAI(nowMs);

    speedBuffs.tick(nowMs);

    if (!gridMovement.stepping) {
        refreshPlayerMovementSpeed(nowMs);
    }

    let inputDir: 'north' | 'south' | 'east' | 'west' | null = null;
    if (keys['w'] || keys['arrowup']) inputDir = 'north';
    else if (keys['s'] || keys['arrowdown']) inputDir = 'south';
    else if (keys['a'] || keys['arrowleft']) inputDir = 'west';
    else if (keys['d'] || keys['arrowright']) inputDir = 'east';

    if (inputDir) {
        const animDirMap = {
            north: 'up',
            south: 'down',
            west: 'left',
            east: 'right'
        } as const;
        activeCharacterController.setDirection(animDirMap[inputDir]);
    }

    if (activeCharacterController.currentState !== 'attack' &&
        activeCharacterController.currentState !== 'cast' &&
        activeCharacterController.currentState !== 'sit' &&
        activeCharacterController.currentState !== 'dead') {
        if (gridMovement.stepping) {
            activeCharacterController.setState('walk');
        } else {
            activeCharacterController.setState('idle');
        }
    } else if (gridMovement.stepping) {
        // Se começar a andar, cancela os estados especiais e vai para caminhada!
        activeCharacterController.setState('walk');
    }

    activeCharacterController.update(nowMs, gridMovement.stepDurationMs);

    const zBefore = player.worldZ;
    tickGridMovement({
        player,
        controller: gridMovement,
        nowMs,
        keys: {
            north: !!(keys['w'] || keys['arrowup']),
            south: !!(keys['s'] || keys['arrowdown']),
            west: !!(keys['a'] || keys['arrowleft']),
            east: !!(keys['d'] || keys['arrowright']),
        },
        deps: {
            tileSize: TILE_SIZE_SCREEN,
            mapSize: MAP_SIZE,
            minFloorZ: ENGINE_CONFIG.MIN_FLOOR_Z,
            maxFloorZ: ENGINE_CONFIG.MAX_FLOOR_Z,
            isWalkablePixels: (x, y, z) => isWalkable(x, y, z),
            isStairHoleAtTile: (tx, ty, z) => isStairHoleAtTile(tx, ty, z),
            getStepDurationMs: (tx, ty, z) => getStepDurationForTile(tx, ty, z),
        },
    });
    if (player.worldZ !== zBefore) {
        editingFloor = player.worldZ;
        updateFloorButtons();
    }

    camera.x = player.worldX - canvas.width / 2;
    camera.y = player.worldY - canvas.height / 2;

    posXEl.innerText = player.tileX.toString();
    posYEl.innerText = player.tileY.toString();
    posZEl.innerText = player.worldZ.toString();

    if (statusPosEl) statusPosEl.innerText = `${player.tileX}, ${player.tileY}`;
    if (statusZEl) statusZEl.innerText = player.worldZ.toString();
}

function draw() {
    ctx.fillStyle = '#0a0b0e';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    getAllFloorZs().forEach(z => {
        const isAbove = z > player.worldZ;
        let playerUnder = false;
        if (isAbove) {
            if (worldMap[z][player.tileY] && worldMap[z][player.tileY][player.tileX] !== -1) playerUnder = true;
        }
        ctx.globalAlpha = (isAbove && playerUnder) ? 0.3 : 1.0;

        const startX = Math.max(0, Math.floor(camera.x / TILE_SIZE_SCREEN));
        const endX = Math.min(MAP_SIZE - 1, Math.floor((camera.x + canvas.width) / TILE_SIZE_SCREEN));
        const startY = Math.max(0, Math.floor(camera.y / TILE_SIZE_SCREEN));
        const endY = Math.min(MAP_SIZE - 1, Math.floor((camera.y + canvas.height) / TILE_SIZE_SCREEN));

        for (let y = startY; y <= endY; y++) {
            for (let x = startX; x <= endX; x++) {
                const tid = worldMap[z][y][x];
                if (tid === -1) continue;
                const tile = TILE_TYPES[tid];
                if (tile && tile.image && tile.image.complete) {
                    ctx.drawImage(tile.image, x * TILE_SIZE_SCREEN - camera.x, y * TILE_SIZE_SCREEN - camera.y, TILE_SIZE_SCREEN, TILE_SIZE_SCREEN);
                }
            }
        }
        
        // Desenha a visualização fantasma (preview) da ferramenta (Linha ou Retângulo)
        if (player.worldZ === z && previewOverlay) {
            ctx.globalAlpha = 0.5;
            const previewTile = TILE_TYPES[selectedTileType];
            if (previewTile && previewTile.image && previewTile.image.complete) {
                if (previewOverlay.type === 'rectangle') {
                    const minX = Math.min(previewOverlay.x1, previewOverlay.x2);
                    const maxX = Math.max(previewOverlay.x1, previewOverlay.x2);
                    const minY = Math.min(previewOverlay.y1, previewOverlay.y2);
                    const maxY = Math.max(previewOverlay.y1, previewOverlay.y2);
                    for (let py = minY; py <= maxY; py++) {
                        for (let px = minX; px <= maxX; px++) {
                            ctx.drawImage(previewTile.image, px * TILE_SIZE_SCREEN - camera.x, py * TILE_SIZE_SCREEN - camera.y, TILE_SIZE_SCREEN, TILE_SIZE_SCREEN);
                        }
                    }
                } else if (previewOverlay.type === 'line') {
                    let px1 = previewOverlay.x1, py1 = previewOverlay.y1;
                    let px2 = previewOverlay.x2, py2 = previewOverlay.y2;
                    let pdx = Math.abs(px2 - px1), pdy = Math.abs(py2 - py1);
                    let psx = (px1 < px2) ? 1 : -1, psy = (py1 < py2) ? 1 : -1;
                    let perr = pdx - pdy;
                    while (true) {
                        ctx.drawImage(previewTile.image, px1 * TILE_SIZE_SCREEN - camera.x, py1 * TILE_SIZE_SCREEN - camera.y, TILE_SIZE_SCREEN, TILE_SIZE_SCREEN);
                        if (px1 === px2 && py1 === py2) break;
                        let pe2 = 2 * perr;
                        if (pe2 > -pdy) { perr -= pdy; px1 += psx; }
                        if (pe2 < pdx) { perr += pdx; py1 += psy; }
                    }
                }
            }
            ctx.globalAlpha = 1.0;
        }

        // Desenha todos os NPCs no andar atual
        npcs.forEach(npc => {
            if (npc.worldZ === z) {
                npc.draw(ctx, camera, TILE_SIZE_SCREEN);
                
                // Desenha o nome do NPC acima dele
                ctx.fillStyle = '#4ade80';
                ctx.font = 'bold 8px sans-serif';
                ctx.textAlign = 'center';
                ctx.fillText(npc.name, npc.worldX - camera.x + TILE_SIZE_SCREEN / 2, npc.worldY - camera.y - 4);
            }
        });

        if (player.worldZ === z) {
            ctx.globalAlpha = 1.0;
            if (activeCharacterController.isLoaded && activeCharacterController.image) {
                const rect = activeCharacterController.getSourceRect();
                const sw = rect.sw;
                const sh = rect.sh;
                // Alinhamento Centro-Inferior (Bottom-Center)
                const drawX = player.worldX - camera.x + (TILE_SIZE_SCREEN - sw) / 2 + rect.ax;
                const drawY = player.worldY - camera.y + (TILE_SIZE_SCREEN - sh) + rect.ay;
                
                ctx.drawImage(
                    activeCharacterController.image,
                    rect.sx, rect.sy, sw, sh,
                    drawX, drawY,
                    sw, sh
                );
            } else {
                const knight = TILE_TYPES[6];
                if (knight && knight.image && knight.image.complete) {
                    ctx.drawImage(knight.image, player.worldX - camera.x, player.worldY - camera.y, TILE_SIZE_SCREEN, TILE_SIZE_SCREEN);
                }
            }
            
            // Desenha o nome do jogador acima dele
            ctx.fillStyle = '#38bdf8';
            ctx.font = 'bold 8px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(activeCharacterController.config.name, player.worldX - camera.x + TILE_SIZE_SCREEN / 2, player.worldY - camera.y - 4);
        }
    });
}

function drawMinimap() {
    mCtx.fillStyle = '#000';
    mCtx.fillRect(0, 0, 150, 150);
    const step = 150 / MAP_SIZE;
    const floor = worldMap[player.worldZ];
    for (let y = 0; y < MAP_SIZE; y++) {
        for (let x = 0; x < MAP_SIZE; x++) {
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

        // Mostra/oculta os conteúdos internos
        document.querySelectorAll('.map-tab-content').forEach(content => {
            const isTarget = content.id === `mapTabContent_${targetTab}`;
            (content as HTMLElement).style.display = isTarget ? 'block' : 'none';
        });
    });
}

window.addEventListener('resize', resize);
resize();
initMapEditorTabSwitching();
loop();
