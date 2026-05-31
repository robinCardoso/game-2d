import type { RegistryTile } from './types';

/** Desenha tile do registro (suporta fatia de variant strip). */
export function drawRegistryTile(
    ctx: CanvasRenderingContext2D,
    tile: RegistryTile,
    dx: number,
    dy: number,
    size: number
): void {
    const img = tile.image;
    if (!img?.complete) return;

    const sr = tile.sourceRect;
    if (sr) {
        ctx.drawImage(img, sr.x, sr.y, sr.w, sr.h, dx, dy, size, size);
    } else {
        ctx.drawImage(img, dx, dy, size, size);
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
