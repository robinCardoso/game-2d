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
    MapDocument,
    RegistryTile,
    SpawnPoint,
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
