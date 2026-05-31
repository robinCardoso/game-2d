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
};

/** PNGs de personagem/outfit não entram na paleta de pintura do mapa. */
function isCharacterTilePath(path: string): boolean {
    const pathNorm = path.replace(/\\/g, '/').toLowerCase();
    return pathNorm.includes('/characters/') || pathNorm.includes('/character/');
}

/** Lê tile_properties.json em runtime (dev server) para pegar strip recém-salvo. */
let runtimeTileProperties: Record<string, TileProperties> | null = null;

export function mergeRuntimeTileProperties(props: Record<string, TileProperties>): void {
    runtimeTileProperties = { ...props };
}

function getCustomProperties(fileName: string, baseName: string): TileProperties | undefined {
    const fromRuntime = runtimeTileProperties?.[fileName] ?? runtimeTileProperties?.[baseName];
    const fromFile =
        (customTileProperties as Record<string, TileProperties>)[fileName]
        ?? (customTileProperties as Record<string, TileProperties>)[baseName];
    return fromRuntime ? { ...fromFile, ...fromRuntime } : fromFile;
}

export interface VariantStripMismatch {
    fileName: string;
    expectedFrames: number;
    imageWidth: number;
}

const variantStripMismatches: VariantStripMismatch[] = [];

export function takeVariantStripMismatches(): VariantStripMismatch[] {
    const out = [...variantStripMismatches];
    variantStripMismatches.length = 0;
    return out;
}

/** Detecta strip horizontal N×TILE_SIZE a partir da largura do PNG (metadados só se baterem). */
export function inferVariantStripFrameCount(
    img: HTMLImageElement,
    custom?: TileProperties,
    fileName?: string
): number {
    const tileSize = ENGINE_CONFIG.TILE_SIZE;
    const w = img.naturalWidth || img.width || 0;
    const h = img.naturalHeight || img.height || 0;
    const explicit = Math.max(0, Math.floor(Number(custom?.variantStripFrames) || 0));

    const fromImage =
        h === tileSize && w > tileSize && w % tileSize === 0
            ? Math.floor(w / tileSize)
            : 0;

    if (fromImage >= 2 && fromImage <= 256) {
        if (explicit > 1 && explicit !== fromImage && fileName) {
            console.warn(
                `[TileRegistry] ${fileName}: variantStripFrames=${explicit}, PNG tem ${fromImage} frames — usando ${fromImage}.`
            );
        }
        return fromImage;
    }

    if (explicit > 1 && w === tileSize && fileName) {
        variantStripMismatches.push({
            fileName,
            expectedFrames: explicit,
            imageWidth: w,
        });
    }

    return 0;
}

type NextIdAllocator = { next: number; take(): number };

function createNextIdAllocator(start = 7): NextIdAllocator {
    let next = start;
    return {
        get next() {
            return next;
        },
        set next(v: number) {
            next = v;
        },
        take() {
            return next++;
        },
    };
}

function registerVariantStrip(
    registry: TileRegistry,
    ids: NextIdAllocator,
    options: {
        fileName: string;
        img: HTMLImageElement;
        category: string;
        paletteCategory: PaletteCategory;
        props: TileProperties;
        custom?: TileProperties;
        stripFrames: number;
    }
): void {
    const { fileName, img, category, paletteCategory, props, custom, stripFrames } = options;
    const tileSize = ENGINE_CONFIG.TILE_SIZE;
    const baseLabel =
        custom?.nameOverride ||
        props.nameOverride ||
        fileName.replace(/_/g, ' ');
    const { variantStripFrames: _stripMeta, ...customWithoutStrip } = custom ?? {};

    for (let i = 0; i < stripFrames; i++) {
        const frameId = ids.take();
        registry[frameId] = {
            id: frameId,
            name: `${baseLabel} · ${i + 1}`,
            image: img,
            category,
            paletteCategory,
            fileKey: `${fileName}#${i}`,
            sourceRect: {
                x: i * tileSize,
                y: 0,
                w: tileSize,
                h: tileSize,
            },
            variantStripIndex: i,
            variantStripFrames: stripFrames,
            ...props,
            ...customWithoutStrip,
        };
    }
}

function registerSingleTile(
    registry: TileRegistry,
    ids: NextIdAllocator,
    options: {
        fileName: string;
        baseName: string;
        img: HTMLImageElement;
        category: string;
        paletteCategory: PaletteCategory;
        props: TileProperties;
        custom?: TileProperties;
    }
): void {
    const { fileName, baseName, img, category, paletteCategory, props, custom } = options;

    let id = OLD_ID_MAP[baseName];
    if (id === undefined) {
        id = ids.take();
    }

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
}

function loadImageElement(url: string): Promise<HTMLImageElement> {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => resolve(img);
        img.src = url;
    });
}

function shouldSkipTilePath(path: string, fileName: string): boolean {
    const sizeSuffix = tileAssetSizeSuffix();
    if (
        (!fileName.endsWith(sizeSuffix) && path.includes('stone_stairs_up')) ||
        (!fileName.endsWith(sizeSuffix) && path.includes('wood_stairs_up')) ||
        (!fileName.endsWith(sizeSuffix) && path.includes('marble_stairs_up'))
    ) {
        return true;
    }
    const custom = getCustomProperties(
        fileName,
        normalizeTileFileName(fileName)
    );
    return (custom as { assetType?: string } | undefined)?.assetType === 'character';
}

function registerLoadedTile(
    registry: TileRegistry,
    ids: NextIdAllocator,
    path: string,
    img: HTMLImageElement
): void {
    const parts = path.split('/');
    const fileName = parts.pop()!.replace('.png', '');
    const category = parts.pop()!;
    const baseName = normalizeTileFileName(fileName);

    const props = getTileProperties(fileName);
    const custom = getCustomProperties(fileName, baseName);
    const paletteCategory = resolvePaletteCategory(path, category);

    const stripFrames = inferVariantStripFrameCount(img, custom, fileName);
    if (stripFrames > 1) {
        registerVariantStrip(registry, ids, {
            fileName,
            img,
            category,
            paletteCategory,
            props,
            custom,
            stripFrames,
        });
        return;
    }

    registerSingleTile(registry, ids, {
        fileName,
        baseName,
        img,
        category,
        paletteCategory,
        props,
        custom,
    });
}

function registerTileFromPath(
    registry: TileRegistry,
    ids: NextIdAllocator,
    path: string,
    url: string
): Promise<void> {
    const parts = path.split('/');
    const fileName = parts.pop()!.replace('.png', '');

    if (shouldSkipTilePath(path, fileName)) {
        return Promise.resolve();
    }

    return loadImageElement(url).then((img) => {
        registerLoadedTile(registry, ids, path, img);
    });
}

function createEmptyRegistry(): TileRegistry {
    return {
        [ENGINE_CONFIG.EMPTY_TILE_ID]: {
            id: ENGINE_CONFIG.EMPTY_TILE_ID,
            name: 'Vazio',
            walkable: false,
            category: 'all',
        },
    };
}

function getTileImageGlob(): Record<string, string> {
    return (import.meta as any).glob('../../tiles/**/*.png', {
        eager: true,
        query: '?url',
        import: 'default',
    }) as Record<string, string>;
}

/**
 * Carrega PNGs aguardando dimensões — necessário para detectar variant strips.
 */
export async function buildTileRegistryAsync(): Promise<TileRegistry> {
    variantStripMismatches.length = 0;
    const registry = createEmptyRegistry();
    const ids = createNextIdAllocator(7);
    const tileImagesRaw = getTileImageGlob();
    const paths = Object.keys(tileImagesRaw)
        .filter((path) => !isCharacterTilePath(path))
        .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));

    const imageByPath = new Map<string, HTMLImageElement>();
    await Promise.all(
        paths.map(async (path) => {
            imageByPath.set(path, await loadImageElement(tileImagesRaw[path]));
        })
    );

    for (const path of paths) {
        const img = imageByPath.get(path);
        if (!img) continue;
        registerLoadedTile(registry, ids, path, img);
    }

    return registry;
}

/**
 * Síncrono (legado). Pode falhar a detectar strips se a imagem ainda não carregou.
 */
export function buildTileRegistry(): TileRegistry {
    const registry = createEmptyRegistry();
    const ids = createNextIdAllocator(7);
    const tileImagesRaw = getTileImageGlob();
    const paths = Object.keys(tileImagesRaw)
        .filter((path) => !isCharacterTilePath(path))
        .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));

    for (const path of paths) {
        void registerTileFromPath(registry, ids, path, tileImagesRaw[path]);
    }

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
