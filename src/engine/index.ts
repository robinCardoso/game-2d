/**
 * API pública da engine — usar no editor ADM e, no futuro, no cliente jogador.
 */

export {
    ENGINE_CONFIG,
    clampFloorZ,
    collisionHitboxSize,
    formatFloorLabel,
    getAllFloorZs,
    tileAssetSizeSuffix,
} from './config';
export type {
    CollisionQueryContext,
    CreatureSpawn,
    HouseData,
    MapDocument,
    PortalData,
    RegistryTile,
    SpawnPoint,
    TileMetadata,
    TileRegistry,
    WalkProbeResult,
    WorldMap,
} from './types';
export {
    cloneWorldMap,
    createDefaultStarterMap,
    createEmptyWorldMap,
    deserializeMapDocument,
    ensureAllFloors,
    loadMapFromJson,
    serializeMapDocument,
} from './worldMap';
export { buildTileRegistry, getTileFromRegistry } from './tileRegistry';
export { isStairHoleAtTile, queryWalkable } from './collision';
export { getTerrainSpeedModifierAt } from './terrain';
export {
    MAP_REGISTRY,
    BUILTIN_MAP_IDS,
    getKnownMapIds,
    getMapEntry,
    registerMap,
    unregisterMap,
} from './mapRegistry';
export type { MapEntry } from './mapRegistry';
export { loadMapFile, loadMapFromObject } from './worldLoader';
export type { LoadedMapResult } from './worldLoader';
export {
    cloneLoadedMapResult,
    createMapInstanceFromTemplate,
    disposeActiveMapInstance,
    captureOverworldReturnIfNeeded,
    clearOverworldReturnContext,
    getOverworldReturnContext,
    getActiveMapInstanceId,
    getActiveInstanceShortLabel,
    isInsideMapInstance,
} from './mapInstance';
export type { OverworldReturnContext } from './mapInstance';

