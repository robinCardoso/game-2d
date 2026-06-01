import { ENGINE_CONFIG } from '../engine/config';
import type { BorderSetCellAssignment } from './borderSetCalibratorUi';

export interface BorderSetCalibrationPayload {
    frameWidth: number;
    frameHeight: number;
    offsetX: number;
    offsetY: number;
    gapX: number;
    gapY: number;
    /** Grade de fatiamento da spritesheet (frames na imagem). */
    gridCols: number;
    gridRows: number;
    /** Grade lógica de slots de máscara (3×3, 4×4, …). */
    borderSlotCols: number;
    borderSlotRows: number;
    borderSetCells: BorderSetCellAssignment[];
}

/** Deduz tamanho da grade de slots a partir das células com máscara ativa. */
export function inferBorderSlotGrid(
    cells: BorderSetCellAssignment[]
): { cols: number; rows: number } {
    const active = cells.filter((c) => c.mask > 0);
    if (active.length === 0) {
        return { cols: 4, rows: 4 };
    }
    let maxCol = 0;
    let maxRow = 0;
    for (const c of active) {
        maxCol = Math.max(maxCol, c.col);
        maxRow = Math.max(maxRow, c.row);
    }
    return {
        cols: Math.max(maxCol + 1, 3),
        rows: Math.max(maxRow + 1, 1),
    };
}

/** Máscaras cardinais mínimas para um conjunto funcional. */
export const BORDER_CARDINAL_MASKS = [1, 2, 4, 8] as const;

export function getMissingCardinalBorderMasks(cells: BorderSetCellAssignment[]): number[] {
    const present = new Set(
        cells.filter((c) => c.mask > 0).map((c) => c.mask)
    );
    return BORDER_CARDINAL_MASKS.filter((m) => !present.has(m));
}

export interface BorderMaskExport {
    mask: number;
    filename: string;
    spriteBase64: string;
    sourceCol: number;
    sourceRow: number;
}

export function cropFrameToBase64(
    image: HTMLImageElement,
    sx: number,
    sy: number,
    frameWidth: number,
    frameHeight: number,
    targetSize = ENGINE_CONFIG.TILE_SIZE,
    options?: { chromaKeyBlack?: boolean }
): string {
    const canvas = document.createElement('canvas');
    canvas.width = targetSize;
    canvas.height = targetSize;
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(image, sx, sy, frameWidth, frameHeight, 0, 0, targetSize, targetSize);

    if (options?.chromaKeyBlack) {
        const imageData = ctx.getImageData(0, 0, targetSize, targetSize);
        const data = imageData.data;
        for (let i = 0; i < data.length; i += 4) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            if (r < 24 && g < 24 && b < 24) {
                data[i + 3] = 0;
            }
        }
        ctx.putImageData(imageData, 0, 0);
    }

    return canvas.toDataURL('image/png');
}

/** Extrai um PNG por máscara (1–15) a partir da sheet calibrada. */
export function buildBorderMaskExports(
    image: HTMLImageElement,
    cal: BorderSetCalibrationPayload,
    setId: string
): BorderMaskExport[] {
    const byMask = new Map<number, BorderSetCellAssignment>();
    for (const cell of cal.borderSetCells) {
        if (cell.mask <= 0) continue;
        if (!byMask.has(cell.mask)) {
            byMask.set(cell.mask, cell);
        }
    }

    const exports: BorderMaskExport[] = [];
    const sortedMasks = [...byMask.keys()].sort((a, b) => a - b);
    for (const mask of sortedMasks) {
        const cell = byMask.get(mask)!;
        const sx = cal.offsetX + cell.sourceCol * (cal.frameWidth + cal.gapX);
        const sy = cal.offsetY + cell.sourceRow * (cal.frameHeight + cal.gapY);
        const filename = `${setId}_mask_${mask}`;
        exports.push({
            mask,
            filename,
            spriteBase64: cropFrameToBase64(image, sx, sy, cal.frameWidth, cal.frameHeight, ENGINE_CONFIG.TILE_SIZE, {
                chromaKeyBlack: true,
            }),
            sourceCol: cell.sourceCol,
            sourceRow: cell.sourceRow,
        });
    }
    return exports;
}

export function calibrationFromCalibratorResult(result: {
    frameWidth: number;
    frameHeight: number;
    offsetX: number;
    offsetY: number;
    gapX?: number;
    gapY?: number;
    gridCols?: number;
    gridRows?: number;
    borderSlotCols?: number;
    borderSlotRows?: number;
    borderSetCells?: BorderSetCellAssignment[];
}): BorderSetCalibrationPayload {
    const borderSetCells = result.borderSetCells ?? [];
    const slotGrid =
        result.borderSlotCols && result.borderSlotRows
            ? { cols: result.borderSlotCols, rows: result.borderSlotRows }
            : inferBorderSlotGrid(borderSetCells);
    return {
        frameWidth: result.frameWidth,
        frameHeight: result.frameHeight,
        offsetX: result.offsetX,
        offsetY: result.offsetY,
        gapX: result.gapX ?? 0,
        gapY: result.gapY ?? 0,
        gridCols: result.gridCols ?? 1,
        gridRows: result.gridRows ?? 1,
        borderSlotCols: slotGrid.cols,
        borderSlotRows: slotGrid.rows,
        borderSetCells,
    };
}
