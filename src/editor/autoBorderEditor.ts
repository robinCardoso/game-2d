import { toast, popup } from '../utils/popup';
import { applyAutoBorderRegion } from '../engine/autoBorder';
import {
    invalidateAutoBorderManifestCache,
    loadAutoBorderManifest,
    resolveAutoBorderSets,
} from '../engine/autoBorderManifest';
import { getAutoBorderSetById } from '../engine/autoBorderManifest';
import {
    getFillBrushCandidates,
    populateAutoBorderBrushSelect,
    populateAutoBorderSetSelect,
    refreshAutoBorderManifest,
} from './autoBorderState';

const MASK_LABELS: Record<number, string> = {
    0: '0 — sem vizinho',
    1: '1 — N',
    2: '2 — E',
    3: '3 — N+E',
    4: '4 — S',
    5: '5 — N+S',
    6: '6 — E+S',
    7: '7 — N+E+S',
    8: '8 — O',
    9: '9 — N+O',
    10: '10 — E+O',
    11: '11 — N+E+O',
    12: '12 — S+O',
    13: '13 — N+S+O',
    14: '14 — E+S+O',
    15: '15 — todos',
};

export interface AutoBorderEditorCallbacks {
    getTileRegistry: () => Record<number, import('../engine/types').RegistryTile>;
    rebuildTileRegistry: () => void;
    reloadMapEditorPalette: () => void;
    getWorldMap: () => import('../engine/types').WorldMap;
    getMapSize: () => number;
    getEditingFloor: () => number;
    saveHistoryState: () => void;
}

export function initAutoBorderEditor(callbacks: AutoBorderEditorCallbacks): void {
    const setIdInput = document.getElementById('abSetIdInput') as HTMLInputElement;
    const setLabelInput = document.getElementById('abSetLabelInput') as HTMLInputElement;
    const fillTerrainInput = document.getElementById('abFillTerrainInput') as HTMLInputElement;
    const neighborTerrainInput = document.getElementById('abNeighborTerrainInput') as HTMLInputElement;
    const setsList = document.getElementById('abSetsList') as HTMLUListElement;
    const gridPreview = document.getElementById('abGridPreview') as HTMLDivElement;
    const sheetInput = document.getElementById('abSheetInput') as HTMLInputElement;
    const filesInput = document.getElementById('abFilesInput') as HTMLInputElement;
    const saveBtn = document.getElementById('abSaveSetBtn') as HTMLButtonElement;
    const reloadRegistryBtn = document.getElementById('abReloadRegistryBtn') as HTMLButtonElement;
    const testMapBtn = document.getElementById('abTestMapBtn') as HTMLButtonElement;
    const newSetBtn = document.getElementById('abNewSetBtn');
    const duplicateSetBtn = document.getElementById('abDuplicateSetBtn');
    const deleteSetBtn = document.getElementById('abDeleteSetBtn');

    if (!setIdInput || !gridPreview) return;

    let manifestSets: import('../engine/autoBorderManifest').AutoBorderSetRaw[] = [];
    const cellImages: (string | null)[] = Array(16).fill(null);
    const cellMaskRemap: number[] = Array.from({ length: 16 }, (_, i) => i);

    async function loadManifestIntoEditor(): Promise<void> {
        const manifest = await loadAutoBorderManifest();
        manifestSets = manifest.sets.map((s) => ({
            ...s,
            tiles: { ...s.tiles },
        }));
        renderSetsList();
        if (manifestSets.length > 0) {
            selectSet(manifestSets[0].id);
        }
    }

    function renderSetsList(): void {
        if (!setsList) return;
        setsList.innerHTML = '';
        manifestSets.forEach((set) => {
            const li = document.createElement('li');
            li.textContent = set.label;
            li.dataset.setId = set.id;
            li.style.cursor = 'pointer';
            li.style.padding = '4px 6px';
            li.style.borderRadius = '4px';
            li.onclick = () => selectSet(set.id);
            setsList.appendChild(li);
        });
    }

    function selectSet(id: string): void {
        const set = manifestSets.find((s) => s.id === id);
        if (!set) return;
        setIdInput.value = set.id;
        setLabelInput.value = set.label;
        fillTerrainInput.value = set.fillTerrain;
        neighborTerrainInput.value = set.neighborTerrain;
        for (let i = 0; i < 16; i++) {
            cellMaskRemap[i] = i;
            cellImages[i] = null;
        }
        renderGridPreview();
        setsList.querySelectorAll('li').forEach((li) => {
            (li as HTMLElement).style.background =
                li.dataset.setId === id ? 'rgba(99, 102, 241, 0.25)' : '';
        });
    }

    function renderGridPreview(): void {
        gridPreview.innerHTML = '';
        for (let i = 0; i < 16; i++) {
            const cell = document.createElement('div');
            cell.className = 'ab-grid-cell';
            cell.style.cssText =
                'border:1px solid #3f4452;border-radius:4px;padding:4px;text-align:center;font-size:9px;background:#111318;';

            const mask = cellMaskRemap[i];
            const badge = document.createElement('div');
            badge.textContent = 'Borda';
            badge.style.cssText =
                'font-size:8px;color:#93c5fd;margin-bottom:2px;';
            cell.appendChild(badge);

            const thumb = document.createElement('div');
            thumb.style.cssText =
                'width:40px;height:40px;margin:0 auto 4px;background:#1a1d24;background-size:cover;image-rendering:pixelated;';
            if (cellImages[i]) {
                thumb.style.backgroundImage = `url(${cellImages[i]})`;
            }
            cell.appendChild(thumb);

            const maskSelect = document.createElement('select');
            maskSelect.style.cssText =
                'width:100%;font-size:8px;background:#1a1d24;color:#fff;border:1px solid #3f4452;border-radius:3px;';
            for (let m = 0; m < 16; m++) {
                const opt = document.createElement('option');
                opt.value = String(m);
                opt.textContent = MASK_LABELS[m] ?? String(m);
                if (m === mask) opt.selected = true;
                maskSelect.appendChild(opt);
            }
            const cellIndex = i;
            maskSelect.onchange = () => {
                cellMaskRemap[cellIndex] = parseInt(maskSelect.value, 10);
            };
            cell.appendChild(maskSelect);
            gridPreview.appendChild(cell);
        }
    }

    function sliceSheetToCells(img: HTMLImageElement): void {
        const cellSize = 64;
        const canvas = document.createElement('canvas');
        canvas.width = cellSize;
        canvas.height = cellSize;
        const ctx = canvas.getContext('2d')!;
        for (let row = 0; row < 4; row++) {
            for (let col = 0; col < 4; col++) {
                const idx = row * 4 + col;
                ctx.clearRect(0, 0, cellSize, cellSize);
                ctx.drawImage(
                    img,
                    col * cellSize,
                    row * cellSize,
                    cellSize,
                    cellSize,
                    0,
                    0,
                    cellSize,
                    cellSize
                );
                cellImages[idx] = canvas.toDataURL('image/png');
            }
        }
        renderGridPreview();
        toast.success('Spritesheet 4×4 fatiado em 16 células.');
    }

    sheetInput?.addEventListener('change', () => {
        const file = sheetInput.files?.[0];
        if (!file) return;
        const img = new Image();
        img.onload = () => sliceSheetToCells(img);
        img.src = URL.createObjectURL(file);
        sheetInput.value = '';
    });

    filesInput?.addEventListener('change', async () => {
        const files = filesInput.files;
        if (!files?.length) return;
        const sorted = Array.from(files).sort((a, b) => a.name.localeCompare(b.name));
        for (let i = 0; i < Math.min(16, sorted.length); i++) {
            const dataUrl = await readFileAsDataUrl(sorted[i]);
            cellImages[i] = dataUrl;
        }
        renderGridPreview();
        toast.success(`${Math.min(16, sorted.length)} arquivo(s) carregado(s).`);
        filesInput.value = '';
    });

    newSetBtn?.addEventListener('click', () => {
        const id = `set_${Date.now()}`;
        manifestSets.push({
            id,
            label: 'Novo conjunto',
            fillTerrain: 'grass',
            neighborTerrain: 'water',
            tiles: { '0': 'grass' },
        });
        renderSetsList();
        selectSet(id);
    });

    duplicateSetBtn?.addEventListener('click', () => {
        const current = manifestSets.find((s) => s.id === setIdInput.value.trim());
        if (!current) return;
        const copy = {
            ...current,
            id: `${current.id}_copy`,
            label: `${current.label} (cópia)`,
            tiles: { ...current.tiles },
        };
        manifestSets.push(copy);
        renderSetsList();
        selectSet(copy.id);
    });

    deleteSetBtn?.addEventListener('click', async () => {
        const id = setIdInput.value.trim();
        if (manifestSets.length <= 1) {
            toast.error('É necessário manter pelo menos um conjunto.');
            return;
        }
        const ok = await popup.confirm(`Excluir conjunto "${id}"?`, 'Excluir conjunto');
        if (!ok) return;
        manifestSets = manifestSets.filter((s) => s.id !== id);
        renderSetsList();
        if (manifestSets.length > 0) selectSet(manifestSets[0].id);
    });

    saveBtn?.addEventListener('click', async () => {
        const id = setIdInput.value.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');
        if (!id) {
            toast.error('Informe um ID válido para o conjunto.');
            return;
        }
        if (!cellImages.some(Boolean)) {
            toast.error('Importe um spritesheet 4×4 ou até 16 PNGs antes de salvar.');
            return;
        }

        const tiles: Record<string, string> = {};
        const pngs: { mask: number; fileKey: string; dataUrl: string }[] = [];

        for (let i = 0; i < 16; i++) {
            if (!cellImages[i]) continue;
            const mask = cellMaskRemap[i];
            const fileKey = `${id}_mask_${mask}`;
            tiles[String(mask)] = fileKey;
            pngs.push({ mask, fileKey, dataUrl: cellImages[i]! });
        }

        const setPayload = {
            id,
            label: setLabelInput.value.trim() || id,
            fillTerrain: fillTerrainInput.value.trim() || 'grass',
            neighborTerrain: neighborTerrainInput.value.trim() || 'water',
            tiles,
        };

        const idx = manifestSets.findIndex((s) => s.id === id);
        if (idx >= 0) manifestSets[idx] = setPayload;
        else manifestSets.push(setPayload);

        try {
            saveBtn.disabled = true;
            const response = await fetch('/api/save-auto-border-set', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    set: setPayload,
                    pngs,
                    allSets: manifestSets,
                }),
            });
            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.error || 'Falha ao salvar conjunto');
            }
            invalidateAutoBorderManifestCache();
            await refreshAutoBorderManifest(callbacks.getTileRegistry());
            const setSelect = document.getElementById('autoBorderSetSelect') as HTMLSelectElement;
            if (setSelect) populateAutoBorderSetSelect(setSelect);
            toast.success(`Conjunto "${setPayload.label}" salvo. Recarregue a paleta se necessário.`);
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            popup.alert(msg, 'Erro ao salvar');
        } finally {
            saveBtn.disabled = false;
        }
    });

    reloadRegistryBtn?.addEventListener('click', async () => {
        callbacks.rebuildTileRegistry();
        await refreshAutoBorderManifest(callbacks.getTileRegistry());
        callbacks.reloadMapEditorPalette();
        const setSelect = document.getElementById('autoBorderSetSelect') as HTMLSelectElement;
        const brushSelect = document.getElementById('autoBorderBrushSelect') as HTMLSelectElement;
        if (setSelect) populateAutoBorderSetSelect(setSelect);
        if (brushSelect) populateAutoBorderBrushSelect(brushSelect, callbacks.getTileRegistry());
        toast.success('Registro de tiles recarregado.');
    });

    testMapBtn?.addEventListener('click', () => {
        const worldMap = callbacks.getWorldMap();
        const mapSize = callbacks.getMapSize();
        const z = callbacks.getEditingFloor();
        const registry = callbacks.getTileRegistry();
        const resolvedSet = getAutoBorderSetById(setIdInput.value.trim());
        const grassId = resolvedSet
            ? getFillBrushCandidates(resolvedSet, registry)[0]?.id
            : undefined;
        const neighborTerrain = neighborTerrainInput.value.trim();
        const waterId = Object.values(registry).find(
            (t) =>
                t.terrainGroup === neighborTerrain &&
                (t.tileRole === 'fill' || t.swimable === true)
        )?.id;
        if (waterId === undefined || grassId === undefined) {
            toast.error(
                'Tiles de terreno não encontrados. Confira fill/vizinho no conjunto e PNGs no registro.'
            );
            return;
        }
        callbacks.saveHistoryState();
        const ox = 2;
        const oy = 2;
        for (let y = 0; y < 5; y++) {
            for (let x = 0; x < 5; x++) {
                if (x === 0 || y === 0 || x === 4 || y === 4) {
                    worldMap[z][oy + y][ox + x] = waterId;
                } else {
                    worldMap[z][oy + y][ox + x] = grassId;
                }
            }
        }
        resolveAutoBorderSets(
            { version: 1, sets: manifestSets },
            callbacks.getTileRegistry()
        );
        const set = manifestSets.find((s) => s.id === setIdInput.value.trim());
        if (set) {
            const resolved = resolveAutoBorderSets(
                { version: 1, sets: [set] },
                callbacks.getTileRegistry()
            )[0];
            if (resolved) {
                applyAutoBorderRegion(
                    worldMap,
                    ox,
                    oy,
                    ox + 4,
                    oy + 4,
                    z,
                    resolved,
                    callbacks.getTileRegistry(),
                    mapSize
                );
            }
        }
        toast.info('Padrão 5×5 de teste aplicado no canto do mapa.');
    });

    void loadManifestIntoEditor();
}

function readFileAsDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}
