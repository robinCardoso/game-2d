import { getTileProperties, normalizeTileFileName, type TileProperties } from '../functions/tileConfig';
import type { PaletteCategory, RegistryTile, TileRegistry } from './types';
import { ENGINE_CONFIG, tileAssetSizeSuffix } from './config';
import customTileProperties from '../../tiles/tile_properties.json';

/** Mapeia pasta do PNG para as abas da paleta (Pisos, Natureza, Paredes, Itens). */
export function resolvePaletteCategory(
    globPath: string,
    folderCategory: string
): PaletteCategory {
    const pathLower = globPath.replace(/\\/g, '/').toLowerCase();
    const folder = folderCategory.toLowerCase();

    if (pathLower.includes('/items/') || folder === 'items') {
        return 'items';
    }
    if (
        folder.includes('wall') ||
        pathLower.includes('/walls/') ||
        pathLower.includes('stone_wall')
    ) {
        return 'walls';
    }
    if (
        folder === 'nature' ||
        folder.includes('tree') ||
        folder.includes('bush') ||
        pathLower.includes('/nature/')
    ) {
        return 'nature';
    }
    return 'ground';
}

const OLD_ID_MAP: Record<string, number> = {
    grass: 0,
    stone_floor: 1,
    water: 2,
    wood: 3,
    wall: 4,
    tree: 5,
    knight: 6,
};

/**
 * Carrega todos os PNG em `tiles/**` e monta o registro id → tile.
 * Usado pelo editor e, no futuro, pelo cliente (sem knight no mapa de jogo).
 */
export function buildTileRegistry(): TileRegistry {
    const registry: TileRegistry = {
        [ENGINE_CONFIG.EMPTY_TILE_ID]: {
            id: ENGINE_CONFIG.EMPTY_TILE_ID,
            name: 'Vazio',
            walkable: false,
            category: 'all',
        },
    };

    let nextId = 7;
    const tileImagesRaw = (import.meta as any).glob('../../tiles/**/*.png', {
        eager: true,
        query: '?url',
        import: 'default',
    });

    const sizeSuffix = tileAssetSizeSuffix();

    Object.keys(tileImagesRaw).forEach((path) => {
        const url = tileImagesRaw[path] as string;
        const parts = path.split('/');
        const fileName = parts.pop()!.replace('.png', '');
        const category = parts.pop()!;
        const baseName = normalizeTileFileName(fileName);

        if (
            (!fileName.endsWith(sizeSuffix) && path.includes('stone_stairs_up')) ||
            (!fileName.endsWith(sizeSuffix) && path.includes('wood_stairs_up')) ||
            (!fileName.endsWith(sizeSuffix) && path.includes('marble_stairs_up'))
        ) {
            return;
        }

        let id = OLD_ID_MAP[baseName];
        if (id === undefined) {
            id = nextId++;
        }

        const img = new Image();
        img.src = url;
        const props = getTileProperties(fileName);
        const custom = (customTileProperties as Record<string, TileProperties>)[fileName]
            ?? (customTileProperties as Record<string, TileProperties>)[baseName];

        const paletteCategory = resolvePaletteCategory(path, category);

        registry[id] = {
            id,
            name:
                custom?.nameOverride ||
                props.nameOverride ||
                baseName.replace(/_/g, ' '),
            image: img,
            category,
            paletteCategory,
            fileKey: fileName,
            ...props,
            ...custom,
        };
    });

    return registry;
}

export function getTileFromRegistry(
    registry: TileRegistry,
    tileId: number
): RegistryTile | undefined {
    return registry[tileId];
}

/** Tile virtual: vão de escada (não existe no tileset). */
export function createStairHoleTile(): RegistryTile {
    return {
        id: -2,
        name: 'Vão de Escada',
        walkable: true,
        category: 'stairs',
        speedModifier: 1.0,
    };
}
