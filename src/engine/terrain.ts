import { getTileFromRegistry, createStairHoleTile } from './tileRegistry';
import type { CollisionQueryContext } from './types';
import { ENGINE_CONFIG } from './config';

const { EMPTY_TILE_ID } = ENGINE_CONFIG;

export function getTerrainSpeedModifierAt(
    ctx: CollisionQueryContext,
    tileX: number,
    tileY: number,
    z: number
): number {
    const floor = ctx.worldMap[z];
    if (!floor?.[tileY]) return 1;

    const tid = floor[tileY][tileX];
    let tile = getTileFromRegistry(ctx.tileRegistry, tid);

    if (tid === EMPTY_TILE_ID && z > ctx.minFloorZ) {
        const floorBelow = ctx.worldMap[z - 1];
        const tidBelow = floorBelow?.[tileY]?.[tileX];
        const below =
            tidBelow !== undefined
                ? getTileFromRegistry(ctx.tileRegistry, tidBelow)
                : undefined;
        if (below?.isStair) {
            tile = createStairHoleTile();
        }
    }

    return tile?.speedModifier ?? 1;
}
