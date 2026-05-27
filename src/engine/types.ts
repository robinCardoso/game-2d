import type { TileProperties } from '../functions/tileConfig';

/** Grade de ids por andar: `floors[z][y][x]`. */
export type WorldMap = Record<number, number[][]>;

export interface SpawnPoint {
    x: number;
    y: number;
    z: number;
}

export interface TileMetadata {
    actionId?: number;
    uniqueId?: number;
    zoneId?: number;
    houseId?: number;
}

export interface HouseData {
    id: number;
    name: string;
    rent: number;
    entryX: number;
    entryY: number;
    entryZ: number;
    owner?: string;
}

export interface CreatureSpawn {
    id: string;          // ID único gerado automaticamente
    name: string;        // Nome da criatura (ex: "Wolf", "Demon", "Guard Knight")
    x: number;           // Coordenada X
    y: number;           // Coordenada Y
    z: number;           // Coordenada Z
    type: 'monster' | 'npc';
}

export interface PortalData {
    /** ID único do portal neste mapa. */
    id: string;
    /** ID do mapa de destino, conforme registrado no MAP_REGISTRY. */
    targetMapId: string;
    /** Coordenada X de chegada no mapa destino. */
    targetX: number;
    /** Coordenada Y de chegada no mapa destino. */
    targetY: number;
    /** Coordenada Z de chegada no mapa destino. */
    targetZ: number;
    /** Coordenada X do portal neste mapa (tile que o ativa). */
    tileX: number;
    /** Coordenada Y do portal neste mapa. */
    tileY: number;
    /** Coordenada Z do portal neste mapa. */
    tileZ: number;
}

/** Formato exportável / carregável (cliente e ADM usam o mesmo). */
export interface MapDocument {
    version: 1;
    name: string;
    size: number;
    /** ID que referencia este mapa no MAP_REGISTRY. */
    mapId?: string;
    /** Tamanho do tile em pixels (64). Mapas antigos sem campo assumem o da engine. */
    tileSize?: number;
    floors: Record<string, number[][]>;
    /** Metadados esparsos indexados por "z_y_x". Ex: "0_50_50" -> { actionId: 2001 } */
    metadata?: Record<string, TileMetadata>;
    houses?: Record<number, HouseData>;
    spawns?: CreatureSpawn[];
    /** Portais que conectam este mapa a outros mapas do registry. */
    portals?: PortalData[];
    spawn: SpawnPoint;
}

export type PaletteCategory = 'ground' | 'nature' | 'walls' | 'items';

export interface RegistryTile extends TileProperties {
    id: number;
    name: string;
    image?: HTMLImageElement;
    /** Pasta imediata do PNG (ex. grass, grass_water) */
    category: string;
    /** Categoria da aba Tile no editor: ground | nature | walls | items */
    paletteCategory?: PaletteCategory | string;
    /** Nome do arquivo PNG (sem extensão), para resolver manifest de auto-borda */
    fileKey?: string;
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
