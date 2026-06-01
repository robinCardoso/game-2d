import { getBaseTerrainTileAt, getSpeedTerrainTileAt } from './terrain';
import type { CollisionQueryContext, WalkProbeResult } from './types';
import { collisionHitboxSize, ENGINE_CONFIG } from './config';

const { EMPTY_TILE_ID } = ENGINE_CONFIG;

export function queryWalkable(
    ctx: CollisionQueryContext,
    worldX: number,
    worldY: number,
    z: number
): WalkProbeResult {
    if (!ctx.collisionEnabled) {
        return { walkable: true, speed: 1.0, isStair: false };
    }

    const size = collisionHitboxSize(ctx.tileSize);
    const padding = (ctx.tileSize - size) / 2;
    const px1 = worldX + padding;
    const py1 = worldY + padding;
    const px2 = worldX + ctx.tileSize - padding;
    const py2 = worldY + ctx.tileSize - padding;

    const tx1 = Math.floor(px1 / ctx.tileSize);
    const ty1 = Math.floor(py1 / ctx.tileSize);
    const tx2 = Math.floor(px2 / ctx.tileSize);
    const ty2 = Math.floor(py2 / ctx.tileSize);

    let speedModSum = 0;
    let count = 0;
    let waterCollision = false;
    let wallCollision = false;
    let stairFound = false;
    let stairDir: 'up' | 'down' | undefined;

    for (let ty = ty1; ty <= ty2; ty++) {
        for (let tx = tx1; tx <= tx2; tx++) {
            if (
                tx < 0 ||
                tx >= ctx.mapSize ||
                ty < 0 ||
                ty >= ctx.mapSize
            ) {
                return { walkable: false, speed: 0, isStair: false };
            }

            const floor = ctx.worldMap[z];
            if (!floor?.[ty]) {
                return { walkable: false, speed: 0, isStair: false };
            }

            const tile = getBaseTerrainTileAt(ctx, tx, ty, z);
            const speedTile = getSpeedTerrainTileAt(ctx, tx, ty, z);

            if (tile) {
                speedModSum += speedTile?.speedModifier ?? tile.speedModifier ?? 1.0;
                count++;

                if (tile.swimable) {
                    if (!ctx.hasBoatEquipped) {
                        waterCollision = true;
                    }
                } else if (tile.walkable === false) {
                    wallCollision = true;
                }

                if (tile.isStair) {
                    stairFound = true;
                    stairDir = tile.stairDirection;
                }
            } else {
                wallCollision = true;
            }
        }
    }

    if (wallCollision || waterCollision) {
        return { walkable: false, speed: 0, isStair: false };
    }

    return {
        walkable: true,
        speed: count > 0 ? speedModSum / count : 1.0,
        isStair: stairFound,
        stairDir,
    };
}

export function isStairHoleAtTile(
    ctx: CollisionQueryContext,
    tileX: number,
    tileY: number,
    z: number
): boolean {
    if (z <= ctx.minFloorZ) return false;
    if (
        tileX < 0 ||
        tileX >= ctx.mapSize ||
        tileY < 0 ||
        tileY >= ctx.mapSize
    ) {
        return false;
    }

    const floor = ctx.worldMap[z];
    if (!floor?.[tileY] || floor[tileY][tileX] !== EMPTY_TILE_ID) {
        return false;
    }

    const floorBelow = ctx.worldMap[z - 1];
    if (!floorBelow?.[tileY]) return false;

    const below = ctx.tileRegistry[floorBelow[tileY][tileX]];
    return !!below?.isStair;
}
