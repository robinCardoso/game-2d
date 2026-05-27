import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isTileWalkable, type WorldMapGrids } from '../../shared/tileWalkable.js';
import { SERVER_MAP_SIZE } from '../../shared/protocol.js';
import { getServerMapEntry } from './mapRegistry.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MAPS_DIR = join(__dirname, '../../public/maps');

interface LoadedCollisionMap {
    mapId: string;
    size: number;
    worldMap: WorldMapGrids;
}

export class MapCollisionStore {
    private templates = new Map<string, LoadedCollisionMap>();

    async loadAll(): Promise<void> {
        for (const entry of [getServerMapEntry('mainland'), getServerMapEntry('rookgaard'), getServerMapEntry('orc_cave')]) {
            if (!entry) continue;
            await this.loadTemplate(entry.id, entry.file);
        }
        console.log(`[MapCollisionStore] ${this.templates.size} template(s) carregado(s)`);
    }

    private async loadTemplate(mapId: string, file: string): Promise<void> {
        const path = join(MAPS_DIR, file.replace(/^maps\//, ''));
        const raw = JSON.parse(await readFile(path, 'utf8')) as {
            mapId?: string;
            size?: number;
            floors?: Record<string, number[][]>;
        };

        const size = Math.min(raw.size ?? SERVER_MAP_SIZE, SERVER_MAP_SIZE);
        const worldMap: WorldMapGrids = {};

        if (raw.floors) {
            for (const [zKey, grid] of Object.entries(raw.floors)) {
                worldMap[Number(zKey)] = grid;
            }
        }

        this.templates.set(mapId, {
            mapId,
            size,
            worldMap,
        });
    }

    hasTemplate(mapId: string): boolean {
        return this.templates.has(mapId);
    }

    isWalkable(mapId: string, tileX: number, tileY: number, z: number): boolean {
        const tpl = this.templates.get(mapId);
        if (!tpl) return true;
        return isTileWalkable(tpl.worldMap, tpl.size, tileX, tileY, z);
    }
}
