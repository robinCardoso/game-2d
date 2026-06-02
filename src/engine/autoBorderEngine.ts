import type { LayerMap } from './mapPaintLayers';
import { clearLayerCell, getLayerCell, setLayerCell } from './mapPaintLayers';
import {
    computeBorderMaskFromGrassNeighbors as computeMaskBits,
    isSupportedBorderMask,
    resolveBorderMaskForRegistry,
} from './borderMaskBits';
import type { RegistryTile, TileRegistry, WorldMap } from './types';
import { ENGINE_CONFIG } from './config';

const { EMPTY_TILE_ID } = ENGINE_CONFIG;

export interface AutoBorderContext {
    worldMap: WorldMap;
    grassOverlay: LayerMap;
    borderOverlay: LayerMap;
    registry: TileRegistry;
    mapSize: number;
    borderSetId: string;
    fillTerrain: string;
}

function isGrassTile(tile: RegistryTile | undefined, fillTerrain: string): boolean {
    if (!tile) return false;
    const group = tile.variantGroup?.toLowerCase();
    return group === fillTerrain || group === 'grass' || group === 'grama';
}

export function cellHasGrass(
    ctx: Pick<AutoBorderContext, 'worldMap' | 'grassOverlay' | 'registry' | 'fillTerrain'>,
    z: number,
    x: number,
    y: number
): boolean {
    const overlay = getLayerCell(ctx.grassOverlay, z, x, y);
    if (overlay !== EMPTY_TILE_ID) {
        // Qualquer tile presente no overlay "grass" conta como grama.
        // Isso evita desenhar borda por cima caso metadados do tile estejam inconsistentes.
        return true;
    }
    const baseId = ctx.worldMap[z]?.[y]?.[x] ?? EMPTY_TILE_ID;
    if (baseId === EMPTY_TILE_ID) return false;
    return isGrassTile(ctx.registry[baseId], ctx.fillTerrain);
}

function isGroundBaseTile(tile: RegistryTile | undefined): boolean {
    if (!tile) return false;
    if (isGrassTile(tile, 'grass')) return false;
    const paletteCat = String(tile.paletteCategory ?? tile.category ?? '').toLowerCase();
    return paletteCat === 'ground' && tile.walkable !== false;
}

export function isEligibleBorderFloorCell(
    ctx: Pick<AutoBorderContext, 'worldMap' | 'grassOverlay' | 'registry' | 'fillTerrain'>,
    z: number,
    x: number,
    y: number
): boolean {
    if (cellHasGrass(ctx, z, x, y)) return false;
    const baseId = ctx.worldMap[z]?.[y]?.[x] ?? EMPTY_TILE_ID;
    // Permite borda em vazio quando a grama foi pintada sem base (estilo Tibia).
    if (baseId === EMPTY_TILE_ID) return true;
    return isGroundBaseTile(ctx.registry[baseId]);
}

/** Cardinais (1–15) com prioridade; diagonais (16–128) se só canto encosta na grama. */
export function computeBorderMaskFromGrassNeighbors(
    ctx: Pick<AutoBorderContext, 'worldMap' | 'grassOverlay' | 'registry' | 'fillTerrain'>,
    z: number,
    x: number,
    y: number
): number {
    return computeMaskBits(
        {
            hasGrass: (floor, tx, ty) => cellHasGrass(ctx, floor, tx, ty),
        },
        z,
        x,
        y
    );
}

export function buildBorderMaskTileIndex(
    registry: TileRegistry,
    borderSetId: string
): Map<number, number> {
    const index = new Map<number, number>();
    for (const tile of Object.values(registry)) {
        if (tile.assetType !== 'border') continue;
        const setId = (tile as RegistryTile & { borderSetId?: string }).borderSetId;
        if (setId !== borderSetId) continue;
        const mask = (tile as RegistryTile & { borderMask?: number }).borderMask;
        if (typeof mask === 'number' && isSupportedBorderMask(mask)) {
            index.set(mask, tile.id);
        }
    }
    return index;
}

export function recalculateAutoBorderCell(
    ctx: AutoBorderContext,
    z: number,
    x: number,
    y: number,
    maskIndex: Map<number, number>
): void {
    if (!isEligibleBorderFloorCell(ctx, z, x, y)) {
        clearLayerCell(ctx.borderOverlay, z, x, y, ctx.mapSize);
        return;
    }
    const rawMask = computeBorderMaskFromGrassNeighbors(ctx, z, x, y);
    if (rawMask === 0) {
        clearLayerCell(ctx.borderOverlay, z, x, y, ctx.mapSize);
        return;
    }
    const availableMasks = new Set(maskIndex.keys());
    const mask = resolveBorderMaskForRegistry(rawMask, availableMasks);
    if (mask === 0) {
        clearLayerCell(ctx.borderOverlay, z, x, y, ctx.mapSize);
        return;
    }
    const tileId = maskIndex.get(mask);
    if (tileId === undefined) {
        clearLayerCell(ctx.borderOverlay, z, x, y, ctx.mapSize);
        return;
    }
    setLayerCell(ctx.borderOverlay, z, x, y, tileId, ctx.mapSize);
}

export function recalculateAutoBorderRegion(
    ctx: AutoBorderContext,
    z: number,
    minX: number,
    minY: number,
    maxX: number,
    maxY: number
): void {
    const maskIndex = buildBorderMaskTileIndex(ctx.registry, ctx.borderSetId);
    if (maskIndex.size === 0) return;

    /** Halo 2: pedra a 1 célula + cantos diagonais da área pintada. */
    const halo = 2;
    const x0 = Math.max(0, minX - halo);
    const y0 = Math.max(0, minY - halo);
    const x1 = Math.min(ctx.mapSize - 1, maxX + halo);
    const y1 = Math.min(ctx.mapSize - 1, maxY + halo);

    for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
            recalculateAutoBorderCell(ctx, z, x, y, maskIndex);
        }
    }
}

export function recalculateAutoBorderFloor(ctx: AutoBorderContext, z: number): void {
    recalculateAutoBorderRegion(ctx, z, 0, 0, ctx.mapSize - 1, ctx.mapSize - 1);
}

export function isGrassPaintSelection(
    selectedId: number,
    registry: TileRegistry,
    fillTerrain = 'grass'
): boolean {
    const tile = registry[selectedId];
    if (!tile) return false;
    if (tile.isVariantBrush) {
        return tile.variantGroup === fillTerrain || tile.variantGroup === 'grass';
    }
    return isGrassTile(tile, fillTerrain);
}

export function shouldUseGrassOverlayOnBase(
    baseId: number,
    registry: TileRegistry,
    fillTerrain: string
): boolean {
    if (baseId === EMPTY_TILE_ID) return false;
    const baseTile = registry[baseId];
    if (!baseTile) return false;
    if (isGrassTile(baseTile, fillTerrain)) return false;
    return isGroundBaseTile(baseTile);
}
