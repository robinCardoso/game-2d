/**
 * Movimento por grid (tileSize da engine, ex. 64×64) com deslize visual entre tiles.
 *
 * - `tileX` / `tileY`: célula lógica (colisão, escadas, UI).
 * - `worldX` / `worldY`: posição desenhada (interpolação durante o passo).
 *
 * Enquanto `stepping === true`, nenhum novo passo começa.
 * Ao terminar o deslize, se a tecla ainda estiver pressionada, o próximo passo
 * inicia no mesmo frame (sem pausa extra entre tiles).
 */

export type CardinalDirection = 'north' | 'south' | 'east' | 'west';

/** Duração do deslize entre dois tiles (ms). Menor = mais rápido. */
export const DEFAULT_GRID_STEP_DURATION_MS = 100;

export interface GridPlayerMotion {
    worldX: number;
    worldY: number;
    worldZ: number;
    tileX: number;
    tileY: number;
}

export interface GridMovementController {
    stepping: boolean;
    fromX: number;
    fromY: number;
    toX: number;
    toY: number;
    stepStartMs: number;
    stepDurationMs: number;
}

export function createGridMovementController(
    stepDurationMs: number = DEFAULT_GRID_STEP_DURATION_MS
): GridMovementController {
    return {
        stepping: false,
        fromX: 0,
        fromY: 0,
        toX: 0,
        toY: 0,
        stepStartMs: 0,
        stepDurationMs,
    };
}

/** Atualiza a duração do deslize (ex.: quando SPEED do personagem muda). */
export function setGridStepDuration(
    ctrl: GridMovementController,
    stepDurationMs: number
): void {
    ctrl.stepDurationMs = Math.max(16, stepDurationMs);
}

export interface TileGridDeps {
    tileSize: number;
    mapSize: number;
    minFloorZ: number;
    maxFloorZ: number;
    isWalkablePixels: (
        worldX: number,
        worldY: number,
        z: number
    ) => { walkable: boolean; isStair: boolean; stairDir?: 'up' | 'down' };
    isStairHoleAtTile: (tileX: number, tileY: number, z: number) => boolean;
    /** Duração do deslize para o tile de destino (stat + buffs + terreno). */
    getStepDurationMs: (tileX: number, tileY: number, z: number) => number;
}

export function syncGridPlayerVisual(
    player: GridPlayerMotion,
    tileSize: number,
    tileX?: number,
    tileY?: number
): void {
    if (tileX !== undefined) player.tileX = tileX;
    if (tileY !== undefined) player.tileY = tileY;
    player.worldX = player.tileX * tileSize;
    player.worldY = player.tileY * tileSize;
}

export function initGridPlayerPosition(
    player: GridPlayerMotion,
    tileSize: number
): void {
    const tx = Math.floor((player.worldX + tileSize / 2) / tileSize);
    const ty = Math.floor((player.worldY + tileSize / 2) / tileSize);
    syncGridPlayerVisual(player, tileSize, tx, ty);
}

function tileToWorld(tx: number, ty: number, tileSize: number) {
    return { x: tx * tileSize, y: ty * tileSize };
}

function resolveDirection(keys: {
    north: boolean;
    south: boolean;
    east: boolean;
    west: boolean;
}): CardinalDirection | null {
    const { north, south, east, west } = keys;
    if (!north && !south && !east && !west) return null;
    if (north && south) return null;
    if (east && west) return null;

    const vert: CardinalDirection | null = north
        ? 'north'
        : south
          ? 'south'
          : null;
    const horiz: CardinalDirection | null = west
        ? 'west'
        : east
          ? 'east'
          : null;

    if (vert && horiz) return vert;
    return vert ?? horiz;
}

function clampTile(v: number, mapSize: number): number {
    return Math.max(0, Math.min(mapSize - 1, v));
}

function beginStep(
    ctrl: GridMovementController,
    player: GridPlayerMotion,
    tileSize: number,
    ntx: number,
    nty: number,
    nowMs: number,
    instant: boolean,
    stepDurationMs: number
): void {
    const dest = tileToWorld(ntx, nty, tileSize);
    player.tileX = ntx;
    player.tileY = nty;

    if (instant) {
        ctrl.stepping = false;
        player.worldX = dest.x;
        player.worldY = dest.y;
        return;
    }

    ctrl.stepping = true;
    ctrl.stepDurationMs = Math.max(16, stepDurationMs);
    ctrl.fromX = player.worldX;
    ctrl.fromY = player.worldY;
    ctrl.toX = dest.x;
    ctrl.toY = dest.y;
    ctrl.stepStartMs = nowMs;
}

/** @returns `true` quando o deslize terminou neste frame. */
function advanceStepVisual(
    ctrl: GridMovementController,
    player: GridPlayerMotion,
    nowMs: number
): boolean {
    if (!ctrl.stepping) return true;

    const elapsed = nowMs - ctrl.stepStartMs;
    const t = Math.min(1, elapsed / ctrl.stepDurationMs);

    player.worldX = ctrl.fromX + (ctrl.toX - ctrl.fromX) * t;
    player.worldY = ctrl.fromY + (ctrl.toY - ctrl.fromY) * t;

    if (t >= 1) {
        player.worldX = ctrl.toX;
        player.worldY = ctrl.toY;
        ctrl.stepping = false;
        return true;
    }
    return false;
}

export interface TickGridMovementParams {
    player: GridPlayerMotion;
    controller: GridMovementController;
    keys: {
        north: boolean;
        south: boolean;
        east: boolean;
        west: boolean;
    };
    nowMs: number;
    deps: TileGridDeps;
}

function tryStartStep(
    ctrl: GridMovementController,
    player: GridPlayerMotion,
    dir: CardinalDirection,
    nowMs: number,
    deps: TileGridDeps
): boolean {
    const { tileSize, mapSize, minFloorZ, maxFloorZ } = deps;
    let { tileX: tx, tileY: ty } = player;
    player.worldZ = Math.max(minFloorZ, Math.min(maxFloorZ, player.worldZ));

    if (
        dir === 'south' &&
        player.worldZ > minFloorZ &&
        deps.isStairHoleAtTile(tx, ty, player.worldZ)
    ) {
        player.worldZ -= 1;
        const nty = clampTile(ty + 1, mapSize);
        const stepMs = deps.getStepDurationMs(tx, nty, player.worldZ);
        beginStep(ctrl, player, tileSize, tx, nty, nowMs, true, stepMs);
        return true;
    }

    let ntx = tx;
    let nty = ty;
    if (dir === 'north') {
        if (ty <= 0) return false;
        nty -= 1;
    } else if (dir === 'south') {
        if (ty >= mapSize - 1) return false;
        nty += 1;
    } else if (dir === 'west') {
        if (tx <= 0) return false;
        ntx -= 1;
    } else if (dir === 'east') {
        if (tx >= mapSize - 1) return false;
        ntx += 1;
    }

    ntx = clampTile(ntx, mapSize);
    nty = clampTile(nty, mapSize);
    if (ntx === tx && nty === ty) return false;

    const dest = tileToWorld(ntx, nty, tileSize);
    if (!deps.isWalkablePixels(dest.x, dest.y, player.worldZ).walkable) {
        return false;
    }

    const stepMs = deps.getStepDurationMs(ntx, nty, player.worldZ);
    beginStep(ctrl, player, tileSize, ntx, nty, nowMs, false, stepMs);

    const landed = deps.isWalkablePixels(dest.x, dest.y, player.worldZ);
    if (
        landed.isStair &&
        landed.stairDir === 'up' &&
        player.worldZ < maxFloorZ &&
        nty > 0
    ) {
        const deckTy = nty - 1;
        const upperZ = player.worldZ + 1;
        const upper = deps.isWalkablePixels(
            ntx * tileSize,
            deckTy * tileSize,
            upperZ
        );
        if (upper.walkable) {
            player.worldZ = upperZ;
            ctrl.stepping = false;
            syncGridPlayerVisual(player, tileSize, ntx, deckTy);
        }
    }

    return true;
}

/**
 * Atualiza movimento por frame.
 * Se o deslize acabou e a tecla segue pressionada, inicia o próximo passo no mesmo frame.
 */
export function tickGridMovement(params: TickGridMovementParams): boolean {
    const { player, controller: ctrl, keys: k, nowMs, deps } = params;

    if (ctrl.stepping) {
        const done = advanceStepVisual(ctrl, player, nowMs);
        if (!done) return false;
    }

    const dir = resolveDirection(k);
    if (!dir) return false;

    return tryStartStep(ctrl, player, dir, nowMs, deps);
}
