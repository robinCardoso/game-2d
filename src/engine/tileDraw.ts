import type { RegistryTile } from './types';

const borderChromaCache = new WeakMap<HTMLImageElement, HTMLCanvasElement>();

function applyBlackChromaKey(ctx: CanvasRenderingContext2D, size: number): void {
    const imageData = ctx.getImageData(0, 0, size, size);
    const data = imageData.data;
    for (let i = 0; i < data.length; i += 4) {
        if (data[i] < 24 && data[i + 1] < 24 && data[i + 2] < 24) {
            data[i + 3] = 0;
        }
    }
    ctx.putImageData(imageData, 0, 0);
}

function getBorderTileCanvas(tile: RegistryTile, size: number): HTMLCanvasElement | null {
    const img = tile.image;
    if (!img?.complete) return null;

    const cached = borderChromaCache.get(img);
    if (cached) return cached;

    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.imageSmoothingEnabled = false;

    const sr = tile.sourceRect;
    if (sr) {
        ctx.drawImage(img, sr.x, sr.y, sr.w, sr.h, 0, 0, size, size);
    } else {
        ctx.drawImage(img, 0, 0, size, size);
    }
    applyBlackChromaKey(ctx, size);
    borderChromaCache.set(img, canvas);
    return canvas;
}

export function getTileDrawSize(tile: RegistryTile, defaultSize: number): { w: number; h: number } {
    if (tile.sourceRect) {
        return { w: tile.sourceRect.w, h: tile.sourceRect.h };
    }
    const fw = Number(tile.frameWidth || tile.width);
    const fh = Number(tile.frameHeight || tile.height);
    if (fw > 0 && fh > 0) {
        return { w: fw, h: fh };
    }
    const img = tile.image;
    if (img && img.complete) {
        const nw = img.naturalWidth || img.width;
        const nh = img.naturalHeight || img.height;
        if (nw > 0 && nh > 0) {
            return { w: nw, h: nh };
        }
    }
    return { w: defaultSize, h: defaultSize };
}

/** Desenha tile do registro (suporta fatia de variant strip). */
export function drawRegistryTile(
    ctx: CanvasRenderingContext2D,
    tile: RegistryTile,
    dx: number,
    dy: number,
    size: number
): void {
    const { w: tw, h: th } = getTileDrawSize(tile, size);
    const drawX = Math.round(dx + (size - tw) / 2);
    const drawY = Math.round(dy + (size - th));

    if (tile.assetType === 'border' || tile.paletteCategory === 'border') {
        const borderCanvas = getBorderTileCanvas(tile, size);
        if (borderCanvas) {
            ctx.drawImage(borderCanvas, drawX, drawY);
            return;
        }
    }

    const img = tile.image;
    if (!img?.complete) return;

    const sr = tile.sourceRect;
    if (sr) {
        ctx.drawImage(img, sr.x, sr.y, sr.w, sr.h, drawX, drawY, tw, th);
    } else {
        ctx.drawImage(img, drawX, drawY, tw, th);
    }
}

/** CSS inline para preview na paleta (inclui sub-retângulo de strip). */
export function tilePreviewStyleCss(tile: RegistryTile, previewPx = 24): string {
    const src = tile.image?.src ?? '';
    if (!src) return '';

    const sr = tile.sourceRect;
    if (sr && tile.variantStripFrames && tile.variantStripFrames > 1) {
        const idx = tile.variantStripIndex ?? Math.round(sr.x / sr.w);
        const total = tile.variantStripFrames;
        return [
            `background-image: url('${src}')`,
            `width: ${previewPx}px`,
            `height: ${previewPx}px`,
            `background-size: ${total * previewPx}px ${previewPx}px`,
            `background-position: ${-idx * previewPx}px 0`,
            'background-repeat: no-repeat',
            'image-rendering: pixelated',
        ].join('; ');
    }

    return `background-image: url('${src}'); background-size: cover; background-position: center; image-rendering: pixelated;`;
}
