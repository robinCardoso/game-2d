import { ENGINE_CONFIG } from './config';
import type { MapDocument, SpawnPoint, WorldMap } from './types';

const { MAP_SIZE, MIN_FLOOR_Z, MAX_FLOOR_Z, EMPTY_TILE_ID } = ENGINE_CONFIG;

export function createEmptyWorldMap(size: number = MAP_SIZE): WorldMap {
    const map: WorldMap = {};
    for (let z = MIN_FLOOR_Z; z <= MAX_FLOOR_Z; z++) {
        map[z] = Array(size)
            .fill(0)
            .map(() => Array(size).fill(EMPTY_TILE_ID));
    }
    return map;
}

/** Mapa inicial do editor: sala de pedra no centro do andar 0. */
export function createDefaultStarterMap(
    size: number = MAP_SIZE
): WorldMap {
    const map = createEmptyWorldMap(size);
    const floor0 = map[0];

    for (let x = 45; x < 55; x++) {
        for (let y = 45; y < 55; y++) {
            floor0[y][x] = 1;
            if (x === 45 || x === 54 || y === 45 || y === 54) {
                floor0[y][x] = 4;
            }
        }
    }

    for (let x = 0; x < size; x++) {
        for (let y = 0; y < size; y++) {
            if (floor0[y][x] === EMPTY_TILE_ID) {
                floor0[y][x] = 0;
            }
        }
    }

    return map;
}

export function cloneWorldMap(source: WorldMap): WorldMap {
    const clone: WorldMap = {};
    for (const z of Object.keys(source).map(Number)) {
        clone[z] = source[z].map((row) => row.slice());
    }
    return clone;
}

export function serializeMapDocument(
    worldMap: WorldMap,
    options: { name?: string; spawn?: SpawnPoint; size?: number } = {}
): MapDocument {
    const size = options.size ?? MAP_SIZE;
    const floors: Record<string, number[][]> = {};
    for (const z of Object.keys(worldMap).map(Number)) {
        floors[String(z)] = worldMap[z];
    }
    return {
        version: 1,
        name: options.name ?? 'sem_nome',
        size,
        tileSize: ENGINE_CONFIG.TILE_SIZE,
        floors,
        spawn: options.spawn ?? { x: 50, y: 50, z: 0 },
    };
}

export function deserializeMapDocument(doc: MapDocument): WorldMap {
    if (doc.version !== 1) {
        throw new Error(`Versão de mapa não suportada: ${doc.version}`);
    }
    const map: WorldMap = {};
    for (const [zKey, grid] of Object.entries(doc.floors)) {
        map[Number(zKey)] = grid;
    }
    return ensureAllFloors(map, doc.size);
}

/**
 * Garante que todos os andares MIN…MAX existem (tiles vazios onde faltarem).
 * Mapas antigos só com -1/0/1 continuam válidos após import.
 */
export function ensureAllFloors(
    worldMap: WorldMap,
    size: number = MAP_SIZE
): WorldMap {
    for (let z = MIN_FLOOR_Z; z <= MAX_FLOOR_Z; z++) {
        if (!worldMap[z]) {
            worldMap[z] = Array(size)
                .fill(0)
                .map(() => Array(size).fill(EMPTY_TILE_ID));
        }
    }
    return worldMap;
}

/** Aceita JSON legado (só floors) ou MapDocument v1. */
export function loadMapFromJson(
    raw: unknown,
    fallbackSpawn?: SpawnPoint
): { worldMap: WorldMap; spawn: SpawnPoint; name: string } {
    if (!raw || typeof raw !== 'object') {
        throw new Error('JSON de mapa inválido');
    }

    const obj = raw as Record<string, unknown>;

    if (obj.version === 1 && obj.floors) {
        const doc = obj as unknown as MapDocument;
        if (
            doc.tileSize !== undefined &&
            doc.tileSize !== ENGINE_CONFIG.TILE_SIZE
        ) {
            console.warn(
                `[Engine] Mapa exportado com tileSize=${doc.tileSize}, engine usa ${ENGINE_CONFIG.TILE_SIZE}.`
            );
        }
        return {
            worldMap: deserializeMapDocument(doc),
            spawn: doc.spawn,
            name: doc.name,
        };
    }

    const legacy = raw as WorldMap;
    return {
        worldMap: ensureAllFloors(cloneWorldMap(legacy)),
        spawn: fallbackSpawn ?? { x: 50, y: 50, z: 0 },
        name: 'importado',
    };
}
