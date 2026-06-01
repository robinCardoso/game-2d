/**
 * Máscaras 4-bit: indica de quais lados há GRAMA vizinha ao chão.
 * O tile de borda desenha filete de grama nas bordas correspondentes.
 * Bits: N=1, E=2, S=4, O=8.
 */
export const BORDER_MASK_LABELS: Record<number, string> = {
    0: '0 — Sem borda (interior)',
    1: '1 — Grama ↑ Norte',
    2: '2 — Grama → Leste',
    3: '3 — Grama ↑→ Norte+Leste',
    4: '4 — Grama ↓ Sul',
    5: '5 — Grama ↑↓ Norte+Sul',
    6: '6 — Grama ↓→ Sul+Leste',
    7: '7 — Grama ↑↓→ Norte+Sul+Leste',
    8: '8 — Grama ← Oeste',
    9: '9 — Grama ↑← Norte+Oeste',
    10: '10 — Grama →← Leste+Oeste',
    11: '11 — Grama ↑→← Norte+Leste+Oeste',
    12: '12 — Grama ↓← Sul+Oeste',
    13: '13 — Grama ↑↓← Norte+Sul+Oeste',
    14: '14 — Grama ↓→← Sul+Leste+Oeste',
    15: '15 — Grama nos 4 lados (ilha)',
};

/** Texto curto ao selecionar máscara (legenda dinâmica). */
export const BORDER_MASK_HINTS: Record<number, string> = {
    0: 'Tile sem filete — interior da grama ou slot não usado.',
    1: 'Grama em cima do chão → filete na borda superior do tile.',
    2: 'Grama à direita → filete na borda direita.',
    3: 'Grama em cima e à direita → canto superior direito.',
    4: 'Grama embaixo do chão → filete na borda inferior (parte de baixo).',
    5: 'Grama em cima e embaixo → filetes superior e inferior.',
    6: 'Grama embaixo e à direita → canto inferior direito.',
    7: 'Grama em cima, embaixo e à direita → três lados (falta oeste).',
    8: 'Grama à esquerda → filete na borda esquerda.',
    9: 'Grama em cima e à esquerda → canto superior esquerdo.',
    10: 'Grama à esquerda e direita → filetes laterais (corredor E–O).',
    11: 'Grama em cima, esquerda e direita → três lados (falta sul).',
    12: 'Grama embaixo e à esquerda → canto inferior esquerdo.',
    13: 'Grama em cima, embaixo e à esquerda → três lados (falta leste).',
    14: 'Grama embaixo, esquerda e direita → três lados (falta norte).',
    15: 'Grama em todos os lados — chão cercado (bolsão).',
};

export interface BorderSetCellAssignment {
    col: number;
    row: number;
    mask: number;
    /** Coluna do tile na spritesheet (padrão = col). */
    sourceCol: number;
    /** Linha do tile na spritesheet (padrão = row). */
    sourceRow: number;
}

function maskSelectOptions(selected: number): string {
    return Array.from({ length: 16 }, (_, mask) => {
        const label = BORDER_MASK_LABELS[mask] ?? String(mask);
        return `<option value="${mask}"${mask === selected ? ' selected' : ''}>${label}</option>`;
    }).join('');
}

export function createBorderSetCalibratorUi(options: {
    listEl: HTMLElement;
    badgeEl: HTMLElement | null;
    pickHintEl?: HTMLElement | null;
    maskHintEl?: HTMLElement | null;
    fillTerrain?: string;
    onChange?: () => void;
    onActiveCellChange?: (col: number, row: number) => void;
}) {
    const assignments = new Map<string, number>();
    const sourceTiles = new Map<string, { col: number; row: number }>();
    let activeCol = -1;
    let activeRow = -1;

    function hasActiveSlot(): boolean {
        return activeCol >= 0 && activeRow >= 0;
    }

    function clearActiveSlot(): void {
        activeCol = -1;
        activeRow = -1;
        options.listEl.querySelectorAll('.cal-border-cell-row').forEach((el) => {
            el.classList.remove('is-active');
        });
        updatePickHint();
        if (options.maskHintEl) options.maskHintEl.textContent = '';
    }

    function key(col: number, row: number): string {
        return `${col},${row}`;
    }

    function getSource(col: number, row: number): { col: number; row: number } {
        return sourceTiles.get(key(col, row)) ?? { col, row };
    }

    function setBadge(fill: string): void {
        if (options.badgeEl) {
            options.badgeEl.textContent = `${fill} → chão`;
        }
    }

    function updatePickHint(): void {
        if (!options.pickHintEl) return;
        if (!hasActiveSlot()) {
            options.pickHintEl.textContent =
                'Selecione um slot à direita, depois clique no tile na imagem à esquerda.';
            return;
        }
        options.pickHintEl.textContent =
            `Slot Col ${activeCol + 1} · Lin ${activeRow + 1} — clique no tile na imagem à esquerda para indicar qual célula da sheet usa esta borda.`;
    }

    function updateMaskHint(mask: number): void {
        if (!options.maskHintEl) return;
        options.maskHintEl.textContent = BORDER_MASK_HINTS[mask] ?? '';
    }

    function setActiveCell(col: number, row: number, scrollIntoView = false): void {
        activeCol = col;
        activeRow = row;
        options.listEl.querySelectorAll('.cal-border-cell-row').forEach((el) => {
            const rowEl = el as HTMLElement;
            const isActive =
                parseInt(rowEl.dataset.col ?? '-1', 10) === col &&
                parseInt(rowEl.dataset.row ?? '-1', 10) === row;
            rowEl.classList.toggle('is-active', isActive);
            if (isActive && scrollIntoView) {
                rowEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            }
        });
        updatePickHint();
        if (hasActiveSlot()) {
            updateMaskHint(assignments.get(key(activeCol, activeRow)) ?? 0);
        }
        options.onActiveCellChange?.(col, row);
    }

    function formatSourceLabel(logicalCol: number, logicalRow: number): string {
        const src = getSource(logicalCol, logicalRow);
        if (src.col === logicalCol && src.row === logicalRow) {
            return `Tile sheet: Col ${src.col + 1} · Lin ${src.row + 1}`;
        }
        return `Tile sheet: Col ${src.col + 1} · Lin ${src.row + 1} (remapeado)`;
    }

    function rebuildCellList(cols: number, rows: number): void {
        if (hasActiveSlot()) {
            activeCol = Math.min(activeCol, Math.max(0, cols - 1));
            activeRow = Math.min(activeRow, Math.max(0, rows - 1));
        }
        options.listEl.innerHTML = '';
        for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
                const k = key(col, row);
                if (!assignments.has(k)) {
                    assignments.set(k, 0);
                }
                if (!sourceTiles.has(k)) {
                    sourceTiles.set(k, { col, row });
                }
                const mask = assignments.get(k) ?? 0;
                const rowEl = document.createElement('div');
                rowEl.className = `cal-border-cell-row${mask === 0 && cols * rows > 1 ? ' is-unassigned' : ''}`;
                rowEl.dataset.col = String(col);
                rowEl.dataset.row = String(row);
                if (hasActiveSlot() && col === activeCol && row === activeRow) {
                    rowEl.classList.add('is-active');
                }
                rowEl.innerHTML = `
                    <div class="cal-border-cell-main">
                        <span class="cal-border-cell-label" title="Slot lógico coluna ${col + 1}, linha ${row + 1}">Slot Col ${col + 1} · Lin ${row + 1}</span>
                        <span class="cal-border-cell-source">${formatSourceLabel(col, row)}</span>
                    </div>
                    <select aria-label="Máscara slot coluna ${col + 1}, linha ${row + 1}">${maskSelectOptions(mask)}</select>
                `;
                rowEl.addEventListener('click', (e) => {
                    if ((e.target as HTMLElement).closest('select')) return;
                    setActiveCell(col, row, false);
                    options.onChange?.();
                });
                const select = rowEl.querySelector('select') as HTMLSelectElement;
                select.addEventListener('change', () => {
                    const value = parseInt(select.value, 10);
                    assignments.set(k, Number.isFinite(value) ? value : 0);
                    rowEl.classList.toggle('is-unassigned', value === 0 && cols * rows > 1);
                    if (col === activeCol && row === activeRow) {
                        updateMaskHint(value);
                    }
                    options.onChange?.();
                });
                select.addEventListener('click', (e) => e.stopPropagation());
                options.listEl.appendChild(rowEl);
            }
        }
        if (hasActiveSlot()) {
            updateMaskHint(assignments.get(key(activeCol, activeRow)) ?? 0);
        } else {
            updatePickHint();
        }
    }

    function refreshSourceLabels(): void {
        options.listEl.querySelectorAll('.cal-border-cell-row').forEach((el) => {
            const rowEl = el as HTMLElement;
            const col = parseInt(rowEl.dataset.col ?? '0', 10);
            const row = parseInt(rowEl.dataset.row ?? '0', 10);
            const sourceEl = rowEl.querySelector('.cal-border-cell-source');
            if (sourceEl) {
                sourceEl.textContent = formatSourceLabel(col, row);
            }
        });
    }

    function applyPreset(cols: number, rows: number): void {
        assignments.clear();
        sourceTiles.clear();
        let index = 0;
        for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
                assignments.set(key(col, row), index < 16 ? index : 0);
                sourceTiles.set(key(col, row), { col, row });
                index++;
            }
        }
        activeCol = -1;
        activeRow = -1;
        rebuildCellList(cols, rows);
        options.onChange?.();
    }

    /** 4 slots com máscaras 1, 2, 4, 8 (N, E, S, O) — não confundir com índice do slot. */
    function applyCardinalPreset(): void {
        assignments.clear();
        sourceTiles.clear();
        const cardinals: Array<{ col: number; row: number; mask: number }> = [
            { col: 0, row: 0, mask: 1 },
            { col: 1, row: 0, mask: 2 },
            { col: 2, row: 0, mask: 4 },
            { col: 3, row: 0, mask: 8 },
        ];
        for (const { col, row, mask } of cardinals) {
            assignments.set(key(col, row), mask);
            sourceTiles.set(key(col, row), { col, row });
        }
        activeCol = -1;
        activeRow = -1;
        rebuildCellList(4, 1);
        options.onChange?.();
    }

    /** Restaura máscaras e remapeamentos salvos ao reabrir um conjunto. */
    function loadAssignments(cells: BorderSetCellAssignment[], cols: number, rows: number): void {
        assignments.clear();
        sourceTiles.clear();
        for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
                const k = key(col, row);
                assignments.set(k, 0);
                sourceTiles.set(k, { col, row });
            }
        }
        for (const cell of cells) {
            if (cell.col < 0 || cell.col >= cols || cell.row < 0 || cell.row >= rows) continue;
            const k = key(cell.col, cell.row);
            assignments.set(k, cell.mask);
            sourceTiles.set(k, {
                col: cell.sourceCol ?? cell.col,
                row: cell.sourceRow ?? cell.row,
            });
        }
        activeCol = -1;
        activeRow = -1;
        rebuildCellList(cols, rows);
        options.onChange?.();
    }

    /** Clique no canvas: associa tile da sheet ao slot ativo. */
    function handleCanvasPick(sheetCol: number, sheetRow: number): boolean {
        if (!hasActiveSlot()) return false;
        const k = key(activeCol, activeRow);
        sourceTiles.set(k, { col: sheetCol, row: sheetRow });
        refreshSourceLabels();
        options.onChange?.();
        return true;
    }

    function getAssignments(cols: number, rows: number): BorderSetCellAssignment[] {
        const out: BorderSetCellAssignment[] = [];
        for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
                const src = getSource(col, row);
                out.push({
                    col,
                    row,
                    mask: assignments.get(key(col, row)) ?? 0,
                    sourceCol: src.col,
                    sourceRow: src.row,
                });
            }
        }
        return out;
    }

    function getActiveCell(): { col: number; row: number } {
        return { col: activeCol, row: activeRow };
    }

    function getMaskAt(col: number, row: number): number {
        return assignments.get(key(col, row)) ?? 0;
    }

    function getSourceAt(col: number, row: number): { col: number; row: number } {
        return getSource(col, row);
    }

    setBadge(options.fillTerrain ?? 'grama');
    updatePickHint();

    return {
        rebuildCellList,
        applyPreset,
        applyCardinalPreset,
        loadAssignments,
        hasActiveSlot,
        clearActiveSlot,
        getAssignments,
        setFillTerrain: setBadge,
        setActiveCell,
        handleCanvasPick,
        getActiveCell,
        getMaskAt,
        getSourceAt,
    };
}
