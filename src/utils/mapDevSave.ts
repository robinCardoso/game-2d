/**
 * Salva MapDocument em public/maps/ via middleware do Vite (somente `npm run dev`).
 */

import { buildFullTileCatalog } from '../engine/tileCatalog';
import { formatMapDocumentJson } from '../engine/mapDocumentFormat';
import type { MapDocument, TileRegistry } from '../engine/types';

const MAX_FILENAME_LEN = 64;

export function sanitizeMapJsonFilename(filename: string): string | null {
    const base = filename.replace(/^.*[/\\]/, '').trim().toLowerCase();
    const withExt = base.endsWith('.json') ? base : `${base}.json`;
    const id = withExt.slice(0, -5);
    if (!id || !/^[a-z0-9_-]+$/.test(id)) return null;
    if (withExt.length > MAX_FILENAME_LEN + 5) return null;
    return withExt;
}

export function isMapDevSaveAvailable(): boolean {
    return import.meta.env.DEV;
}

export async function saveMapDocumentToDevPublic(
    filename: string,
    document: MapDocument
): Promise<{ ok: true; path: string } | { ok: false; error: string }> {
    if (!import.meta.env.DEV) {
        return {
            ok: false,
            error: 'Salvar em public/maps só está disponível com npm run dev.',
        };
    }

    const safeName = sanitizeMapJsonFilename(filename);
    if (!safeName) {
        return { ok: false, error: 'Nome de arquivo inválido. Use apenas a-z, 0-9, _ e -.' };
    }

    try {
        const response = await fetch('/api/save-map', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                filename: safeName,
                json: formatMapDocumentJson(document),
            }),
        });

        const payload = (await response.json()) as {
            success?: boolean;
            path?: string;
            error?: string;
        };

        if (!response.ok || !payload.success) {
            return {
                ok: false,
                error: payload.error ?? `HTTP ${response.status}`,
            };
        }

        return { ok: true, path: payload.path ?? `public/maps/${safeName}` };
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { ok: false, error: message };
    }
}

export async function saveTileCatalogToDevPublic(
    registry: TileRegistry
): Promise<{ ok: true; path: string } | { ok: false; error: string }> {
    if (!import.meta.env.DEV) {
        return { ok: false, error: 'Catálogo só é salvo em dev.' };
    }

    const catalog = buildFullTileCatalog(registry);

    try {
        const response = await fetch('/api/save-tile-catalog', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ catalog }),
        });

        const payload = (await response.json()) as {
            success?: boolean;
            path?: string;
            error?: string;
        };

        if (!response.ok || !payload.success) {
            return { ok: false, error: payload.error ?? `HTTP ${response.status}` };
        }

        return { ok: true, path: payload.path ?? 'public/tile_catalog.json' };
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { ok: false, error: message };
    }
}
