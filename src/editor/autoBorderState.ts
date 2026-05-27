import {
    getAutoBorderSetById,
    getResolvedAutoBorderSets,
    loadAutoBorderManifest,
    resolveAutoBorderSets,
    type ResolvedAutoBorderSet,
} from '../engine/autoBorderManifest';
import { applyAutoBorderAt, applyAutoBorderRegion } from '../engine/autoBorder';
import type { TileRegistry, WorldMap } from '../engine/types';

let _autoBorderEnabled = false;
let _activeAutoBorderSetId = 'grass_water';

export function isAutoBorderEnabled(): boolean {
    return _autoBorderEnabled;
}

export function setAutoBorderEnabled(value: boolean): void {
    _autoBorderEnabled = value;
}

export function getActiveAutoBorderSetId(): string {
    return _activeAutoBorderSetId;
}

export function setActiveAutoBorderSetId(id: string): void {
    _activeAutoBorderSetId = id;
}
let lastBorderCellsChanged = 0;

export function getActiveAutoBorderSet(): ResolvedAutoBorderSet | undefined {
    return getAutoBorderSetById(_activeAutoBorderSetId);
}

export function getLastBorderCellsChanged(): number {
    return lastBorderCellsChanged;
}

export function resetLastBorderCellsChanged(): void {
    lastBorderCellsChanged = 0;
}

export async function refreshAutoBorderManifest(registry: TileRegistry): Promise<void> {
    const manifest = await loadAutoBorderManifest();
    resolveAutoBorderSets(manifest, registry);
}

export function populateAutoBorderSetSelect(select: HTMLSelectElement): void {
    const sets = getResolvedAutoBorderSets();
    const prev = select.value;
    select.innerHTML = '';
    for (const set of sets) {
        const opt = document.createElement('option');
        opt.value = set.id;
        opt.textContent = set.label;
        select.appendChild(opt);
    }
    if (sets.some((s) => s.id === prev)) {
        select.value = prev;
        _activeAutoBorderSetId = prev;
    } else if (sets.length > 0) {
        select.value = sets[0].id;
        _activeAutoBorderSetId = sets[0].id;
    }
}

export interface FillBrushCandidate {
    id: number;
    name: string;
}

/** Tiles que o ADM pode usar como pincel de preenchimento para o conjunto ativo. */
export function getFillBrushCandidates(
    set: ResolvedAutoBorderSet,
    registry: TileRegistry
): FillBrushCandidate[] {
    const seen = new Set<number>();
    const out: FillBrushCandidate[] = [];

    const add = (id: number | undefined) => {
        if (id === undefined || id < 0 || seen.has(id)) return;
        const tile = registry[id];
        if (!tile || tile.terrainGroup !== set.fillTerrain) return;
        seen.add(id);
        out.push({ id, name: tile.name });
    };

    for (const tile of Object.values(registry)) {
        if (tile.tileRole === 'fill' && tile.terrainGroup === set.fillTerrain) {
            add(tile.id);
        }
    }

    add(set.maskToTileId.get(0));
    if (set.fillTileId >= 0) add(set.fillTileId);

    for (const tile of Object.values(registry)) {
        if (
            tile.tileRole === 'border' &&
            tile.terrainGroup === set.fillTerrain &&
            tile.borderSetId === set.id &&
            tile.borderMask === 0
        ) {
            add(tile.id);
        }
    }

    return out;
}

export function populateAutoBorderBrushSelect(
    select: HTMLSelectElement,
    registry: TileRegistry
): void {
    const set = getActiveAutoBorderSet();
    const prev = select.value;
    select.innerHTML = '';
    if (!set) return;

    const candidates = getFillBrushCandidates(set, registry);

    if (candidates.length === 0) {
        const empty = document.createElement('option');
        empty.value = '';
        empty.textContent = '— Nenhum tile de preenchimento —';
        empty.disabled = true;
        empty.selected = true;
        select.appendChild(empty);
        return;
    }

    for (const { id, name } of candidates) {
        const opt = document.createElement('option');
        opt.value = String(id);
        opt.textContent = name;
        select.appendChild(opt);
    }

    if (candidates.some((c) => String(c.id) === prev)) {
        select.value = prev;
    } else {
        select.value = String(candidates[0].id);
    }
}

export function getAutoBorderPaintTileId(registry: TileRegistry): number | undefined {
    if (!_autoBorderEnabled) return undefined;
    const set = getActiveAutoBorderSet();
    if (!set) return undefined;

    const candidates = getFillBrushCandidates(set, registry);
    if (candidates.length === 0) return undefined;

    const brushSelect = document.getElementById('autoBorderBrushSelect') as HTMLSelectElement | null;
    if (brushSelect?.value) {
        const id = parseInt(brushSelect.value, 10);
        if (!Number.isNaN(id) && candidates.some((c) => c.id === id)) return id;
    }
    return candidates[0]?.id;
}

export function runAutoBorderAt(
    worldMap: WorldMap,
    x: number,
    y: number,
    z: number,
    registry: TileRegistry,
    mapSize: number
): void {
    if (!_autoBorderEnabled) return;
    const set = getActiveAutoBorderSet();
    if (!set) return;
    lastBorderCellsChanged += applyAutoBorderAt(worldMap, x, y, z, set, registry, mapSize);
}

export function runAutoBorderRegion(
    worldMap: WorldMap,
    minX: number,
    minY: number,
    maxX: number,
    maxY: number,
    z: number,
    registry: TileRegistry,
    mapSize: number
): number {
    if (!_autoBorderEnabled) return 0;
    const set = getActiveAutoBorderSet();
    if (!set) return 0;
    const n = applyAutoBorderRegion(
        worldMap,
        minX,
        minY,
        maxX,
        maxY,
        z,
        set,
        registry,
        mapSize
    );
    lastBorderCellsChanged += n;
    return n;
}
