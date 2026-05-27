import { normalizeTileFileName } from '../functions/tileConfig';
import { ENGINE_CONFIG } from './config';
import type { TileRegistry } from './types';

export interface AutoBorderSetRaw {
    id: string;
    label: string;
    fillTerrain: string;
    neighborTerrain: string;
    tiles: Record<string, string>;
}

export interface AutoBorderManifestFile {
    version: number;
    sets: AutoBorderSetRaw[];
}

export interface ResolvedAutoBorderSet {
    id: string;
    label: string;
    fillTerrain: string;
    neighborTerrain: string;
    /** máscara 0–15 → tileId */
    maskToTileId: Map<number, number>;
    fillTileId: number;
}

let cachedManifest: AutoBorderManifestFile | null = null;
let resolvedSets: ResolvedAutoBorderSet[] = [];

export async function loadAutoBorderManifest(): Promise<AutoBorderManifestFile> {
    if (cachedManifest) return cachedManifest;
    const res = await fetch('/auto_border_sets.json');
    if (!res.ok) throw new Error('Falha ao carregar auto_border_sets.json');
    cachedManifest = (await res.json()) as AutoBorderManifestFile;
    return cachedManifest;
}

function resolveFileKeyToId(
    fileKey: string,
    registry: TileRegistry,
    nameIndex: Map<string, number>
): number | undefined {
    const normalized = normalizeTileFileName(fileKey);
    if (nameIndex.has(fileKey)) return nameIndex.get(fileKey);
    if (nameIndex.has(normalized)) return nameIndex.get(normalized);
    for (const tile of Object.values(registry)) {
        if (tile.id < 0) continue;
        if (tile.fileKey === fileKey || tile.fileKey === normalized) return tile.id;
        if (normalizeTileFileName(tile.fileKey ?? '') === normalized) return tile.id;
    }
    return undefined;
}

export function buildNameToTileIdIndex(registry: TileRegistry): Map<string, number> {
    const index = new Map<string, number>();
    for (const tile of Object.values(registry)) {
        if (tile.id < 0 || !tile.fileKey) continue;
        index.set(tile.fileKey, tile.id);
        index.set(normalizeTileFileName(tile.fileKey), tile.id);
    }
    return index;
}

export function resolveAutoBorderSets(
    manifest: AutoBorderManifestFile,
    registry: TileRegistry
): ResolvedAutoBorderSet[] {
    const nameIndex = buildNameToTileIdIndex(registry);
    resolvedSets = manifest.sets.map((set) => {
        const maskToTileId = new Map<number, number>();
        let fillTileId: number | undefined;

        for (const [maskStr, fileKey] of Object.entries(set.tiles)) {
            const mask = parseInt(maskStr, 10);
            const tileId = resolveFileKeyToId(fileKey, registry, nameIndex);
            if (tileId === undefined) {
                console.warn(`[AutoBorder] Tile "${fileKey}" não encontrado no registro (conjunto ${set.id})`);
                continue;
            }
            maskToTileId.set(mask, tileId);
            if (mask === 0) fillTileId = tileId;
        }

        if (!maskToTileId.has(0)) {
            for (const tile of Object.values(registry)) {
                if (tile.terrainGroup === set.fillTerrain && tile.tileRole === 'fill') {
                    fillTileId = tile.id;
                    maskToTileId.set(0, tile.id);
                    break;
                }
            }
        }

        if (!maskToTileId.has(0)) {
            for (const tile of Object.values(registry)) {
                if (
                    tile.terrainGroup === set.fillTerrain &&
                    tile.tileRole === 'border' &&
                    tile.borderSetId === set.id &&
                    tile.borderMask === 0
                ) {
                    fillTileId = tile.id;
                    maskToTileId.set(0, tile.id);
                    break;
                }
            }
        }

        const resolvedFill =
            fillTileId ?? maskToTileId.get(0) ?? ENGINE_CONFIG.EMPTY_TILE_ID;

        return {
            id: set.id,
            label: set.label,
            fillTerrain: set.fillTerrain,
            neighborTerrain: set.neighborTerrain,
            maskToTileId,
            fillTileId: resolvedFill,
        };
    });
    return resolvedSets;
}

export function getResolvedAutoBorderSets(): ResolvedAutoBorderSet[] {
    return resolvedSets;
}

export function getAutoBorderSetById(id: string): ResolvedAutoBorderSet | undefined {
    return resolvedSets.find((s) => s.id === id);
}

export function invalidateAutoBorderManifestCache(): void {
    cachedManifest = null;
    resolvedSets = [];
}
