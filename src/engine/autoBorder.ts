import type { WorldMap } from './types';
import type { TileRegistry } from './types';
import type { ResolvedAutoBorderSet } from './autoBorderManifest';
import { ENGINE_CONFIG } from './config';

const NEIGHBOR_OFFSETS: [number, number, number][] = [
    [0, -1, 1],
    [1, 0, 2],
    [0, 1, 4],
    [-1, 0, 8],
];

export function getTerrainGroup(tileId: number, registry: TileRegistry): string | undefined {
    if (tileId === ENGINE_CONFIG.EMPTY_TILE_ID) return undefined;
    const tile = registry[tileId];
    return tile?.terrainGroup;
}

export function computeNeighborMask(
    worldMap: WorldMap,
    x: number,
    y: number,
    z: number,
    neighborTerrain: string,
    registry: TileRegistry,
    mapSize: number
): number {
    let mask = 0;
    for (const [dx, dy, bit] of NEIGHBOR_OFFSETS) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= mapSize || ny >= mapSize) continue;
        const nid = worldMap[z]?.[ny]?.[nx];
        if (nid === undefined || nid === ENGINE_CONFIG.EMPTY_TILE_ID) continue;
        if (getTerrainGroup(nid, registry) === neighborTerrain) {
            mask |= bit;
        }
    }
    return mask;
}

function resolveTileForMask(set: ResolvedAutoBorderSet, mask: number): number {
    return set.maskToTileId.get(mask) ?? set.maskToTileId.get(0) ?? set.fillTileId;
}

/** Recalcula auto-borda na célula e nos 4 vizinhos cardinais. */
export function applyAutoBorderAt(
    worldMap: WorldMap,
    x: number,
    y: number,
    z: number,
    set: ResolvedAutoBorderSet,
    registry: TileRegistry,
    mapSize: number
): number {
    const cells: [number, number][] = [
        [x, y],
        [x, y - 1],
        [x + 1, y],
        [x, y + 1],
        [x - 1, y],
    ];
    let changed = 0;

    for (const [cx, cy] of cells) {
        if (cx < 0 || cy < 0 || cx >= mapSize || cy >= mapSize) continue;
        const cellId = worldMap[z][cy][cx];
        if (cellId === ENGINE_CONFIG.EMPTY_TILE_ID) continue;
        if (getTerrainGroup(cellId, registry) !== set.fillTerrain) continue;

        const mask = computeNeighborMask(worldMap, cx, cy, z, set.neighborTerrain, registry, mapSize);
        const nextId = resolveTileForMask(set, mask);
        if (worldMap[z][cy][cx] !== nextId) {
            worldMap[z][cy][cx] = nextId;
            changed++;
        }
    }
    return changed;
}

export function applyAutoBorderRegion(
    worldMap: WorldMap,
    minX: number,
    minY: number,
    maxX: number,
    maxY: number,
    z: number,
    set: ResolvedAutoBorderSet,
    registry: TileRegistry,
    mapSize: number
): number {
    let changed = 0;
    const pad = 1;
    const x0 = Math.max(0, minX - pad);
    const y0 = Math.max(0, minY - pad);
    const x1 = Math.min(mapSize - 1, maxX + pad);
    const y1 = Math.min(mapSize - 1, maxY + pad);

    for (let cy = y0; cy <= y1; cy++) {
        for (let cx = x0; cx <= x1; cx++) {
            const cellId = worldMap[z][cy][cx];
            if (cellId === ENGINE_CONFIG.EMPTY_TILE_ID) continue;
            if (getTerrainGroup(cellId, registry) !== set.fillTerrain) continue;

            const mask = computeNeighborMask(worldMap, cx, cy, z, set.neighborTerrain, registry, mapSize);
            const nextId = resolveTileForMask(set, mask);
            if (worldMap[z][cy][cx] !== nextId) {
                worldMap[z][cy][cx] = nextId;
                changed++;
            }
        }
    }
    return changed;
}

export function findFillTileIdForTerrain(
    terrain: string,
    registry: TileRegistry
): number | undefined {
    for (const tile of Object.values(registry)) {
        if (tile.tileRole === 'fill' && tile.terrainGroup === terrain) {
            return tile.id;
        }
    }
    return undefined;
}
