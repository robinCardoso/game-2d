import type { TileProperties } from '../functions/tileConfig';

/** Grade de ids por andar: `floors[z][y][x]`. */
export type WorldMap = Record<number, number[][]>;

export interface SpawnPoint {
    x: number;
    y: number;
    z: number;
}

/** Formato exportável / carregável (cliente e ADM usam o mesmo). */
export interface MapDocument {
    version: 1;
    name: string;
    size: number;
    /** Tamanho do tile em pixels (64). Mapas antigos sem campo assumem o da engine. */
    tileSize?: number;
    floors: Record<string, number[][]>;
    spawn: SpawnPoint;
}

export interface RegistryTile extends TileProperties {
    id: number;
    name: string;
    image?: HTMLImageElement;
    category: string;
}

export type TileRegistry = Record<number, RegistryTile>;

export interface WalkProbeResult {
    walkable: boolean;
    speed: number;
    isStair: boolean;
    stairDir?: 'up' | 'down';
}

/** Contexto injetado — engine não conhece DOM nem cargo GM. */
export interface CollisionQueryContext {
    worldMap: WorldMap;
    tileRegistry: TileRegistry;
    mapSize: number;
    tileSize: number;
    minFloorZ: number;
    maxFloorZ: number;
    /** `false` = noclip (só quando o caller permitir, ex. GM). */
    collisionEnabled: boolean;
    hasBoatEquipped: boolean;
}
