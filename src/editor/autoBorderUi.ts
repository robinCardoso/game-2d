import { isVariantBrush } from '../engine/tileVariants';
import { toast } from '../utils/popup';

export interface BorderSetUiEntry {
    id: string;
    label: string;
    fillTerrain: string;
}

/** Conjuntos mock até existir API/manifest. */
const MOCK_BORDER_SETS: BorderSetUiEntry[] = [
    { id: 'grass_edges', label: 'Bordas de grama', fillTerrain: 'grass' },
];

let borderSets: BorderSetUiEntry[] = [...MOCK_BORDER_SETS];

export function getMockBorderSets(): BorderSetUiEntry[] {
    return [...borderSets];
}

export function setBorderSetsForUi(sets: BorderSetUiEntry[]): void {
    borderSets = sets.length > 0 ? [...sets] : [...MOCK_BORDER_SETS];
    populateBorderSetSelect();
}

function getEl<T extends HTMLElement>(id: string): T | null {
    return document.getElementById(id) as T | null;
}

function getSelectedBorderSet(): BorderSetUiEntry | undefined {
    const select = getEl<HTMLSelectElement>('autoBorderSetSelect');
    if (!select?.value) return borderSets[0];
    return borderSets.find((s) => s.id === select.value) ?? borderSets[0];
}

function syncToolbarActiveState(): void {
    const toggle = getEl<HTMLInputElement>('autoBorderEnabledToggle');
    const toolbar = getEl<HTMLElement>('autoBorderToolbar');
    const select = getEl<HTMLSelectElement>('autoBorderSetSelect');
    const hint = getEl<HTMLElement>('autoBorderPaintHint');
    const enabled = toggle?.checked ?? false;

    if (select) select.disabled = !enabled;
    toolbar?.classList.toggle('is-active', enabled);
    hint?.classList.toggle('is-active', enabled);
    syncTileAutoBorderChip();
}

export function syncTileAutoBorderChip(): void {
    const chip = getEl<HTMLElement>('tileAutoBorderStatusChip');
    if (!chip) return;

    const toggle = getEl<HTMLInputElement>('autoBorderEnabledToggle');
    const set = getSelectedBorderSet();
    if (toggle?.checked && set) {
        chip.style.display = 'block';
        chip.textContent = `Auto-borda: ${set.label}`;
    } else {
        chip.style.display = 'none';
        chip.textContent = '';
    }
}

export function populateBorderSetSelect(filterFillTerrain?: string): void {
    const select = getEl<HTMLSelectElement>('autoBorderSetSelect');
    if (!select) return;

    const prev = select.value;
    const list = filterFillTerrain
        ? borderSets.filter((s) => s.fillTerrain === filterFillTerrain)
        : borderSets;

    select.innerHTML = '';
    if (list.length === 0) {
        const opt = document.createElement('option');
        opt.value = '';
        opt.textContent = '— Nenhum conjunto —';
        select.appendChild(opt);
        return;
    }

    for (const entry of list) {
        const opt = document.createElement('option');
        opt.value = entry.id;
        opt.textContent = `${entry.label} (${entry.id})`;
        select.appendChild(opt);
    }

    if (prev && list.some((s) => s.id === prev)) {
        select.value = prev;
    } else {
        select.value = list[0].id;
    }
}

/** Ao selecionar pincel Grama aleatório: liga toggle e escolhe conjunto grass. */
export function notifyAutoBorderGrassBrushSelected(): void {
    const toggle = getEl<HTMLInputElement>('autoBorderEnabledToggle');
    if (toggle && !toggle.checked) {
        toggle.checked = true;
    }
    populateBorderSetSelect('grass');
    const select = getEl<HTMLSelectElement>('autoBorderSetSelect');
    const grassSet = borderSets.find((s) => s.id === 'grass_edges' && s.fillTerrain === 'grass');
    if (select && grassSet) {
        select.value = grassSet.id;
    }
    syncToolbarActiveState();
}

export function isAutoBorderEnabled(): boolean {
    return getEl<HTMLInputElement>('autoBorderEnabledToggle')?.checked ?? false;
}

export function initAutoBorderUi(): void {
    const toggle = getEl<HTMLInputElement>('autoBorderEnabledToggle');
    const select = getEl<HTMLSelectElement>('autoBorderSetSelect');
    const recalcBtn = getEl<HTMLButtonElement>('autoBorderRecalcFloorBtn');

    populateBorderSetSelect();

    toggle?.addEventListener('change', () => {
        syncToolbarActiveState();
    });

    select?.addEventListener('change', () => {
        syncTileAutoBorderChip();
    });

    recalcBtn?.addEventListener('click', () => {
        toast.info('Recalcular andar estará disponível quando o motor de auto-borda for implementado.');
    });

    syncToolbarActiveState();
}

/** Chamado quando o tile selecionado muda (main.ts). */
export function onMapEditorTileSelectionChanged(selectedId: number, tileRegistry: Record<number, { variantGroup?: string }>): void {
    if (isVariantBrush(selectedId)) {
        const group = tileRegistry[selectedId]?.variantGroup;
        if (group === 'grass') {
            notifyAutoBorderGrassBrushSelected();
            return;
        }
    }
    syncTileAutoBorderChip();
}
