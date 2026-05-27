import { toast, popup } from '../utils/popup';
import { removeChromaKey } from '../utils/imageProcessor';
import { openCharacterCalibrator } from './characterCalibratorModal';
import {
    buildAllTileRolesHelpHtml,
    getTileRoleHelpText,
    TILE_ROLE_TITLES,
    normalizeTileRoleHelpKey,
} from './autoBorderHelp';

let afterSaveSpriteHandler: (() => void | Promise<void>) | undefined;

interface MapSpriteListEntry {
    name: string;
    filename?: string;
    assetType: 'terrain' | 'items' | string;
    category: string;
    relativePath: string;
    properties?: {
        walkable?: boolean;
        speedModifier?: number;
        isStair?: boolean;
        participatesInAutoBorder?: boolean;
        tileRole?: string;
        terrainGroup?: string;
        borderSetId?: string;
        borderMask?: number;
    };
}

const TERRAIN_CATEGORY_HINTS = ['ground', 'nature', 'walls', 'grass', 'water', 'borders'];
const ITEM_CATEGORY_HINTS = ['decor', 'props', 'furniture'];

/** Sanitiza subpasta (espelha regras do servidor em vite.config.ts). */
export function sanitizeMapSpriteCategory(raw: string): string {
    return raw
        .trim()
        .replace(/\\/g, '/')
        .replace(/\.\./g, '')
        .replace(/[^a-zA-Z0-9_\-/]/g, '')
        .replace(/^\/+|\/+$/g, '');
}

function isPseudoRootCategory(category: string): boolean {
    const c = category.trim().toLowerCase();
    return c === '' || c === 'terrain' || c === 'items';
}

function collectCategoriesForAssetType(
    assetType: string,
    sprites: Pick<MapSpriteListEntry, 'assetType' | 'category'>[]
): string[] {
    const set = new Set<string>();
    const hints = assetType === 'items' ? ITEM_CATEGORY_HINTS : TERRAIN_CATEGORY_HINTS;
    hints.forEach((h) => set.add(h));

    for (const sprite of sprites) {
        if (sprite.assetType !== assetType) continue;
        const cat = String(sprite.category ?? '').trim();
        if (isPseudoRootCategory(cat)) continue;
        set.add(cat);
    }

    return Array.from(set).sort((a, b) => a.localeCompare(b, 'pt'));
}

/** Registra callback para recarregar paleta do mapa após salvar sprite (wire em main.ts). */
export function setMapSpriteAfterSaveHandler(handler: () => void | Promise<void>): void {
    afterSaveSpriteHandler = handler;
}

export function initMapSpriteEditor() {
    const nameInput = document.getElementById('mapSpriteNameInput') as HTMLInputElement;
    const assetTypeSelect = document.getElementById('mapSpriteAssetTypeSelect') as HTMLSelectElement;
    const categoryInput = document.getElementById('mapSpriteCategoryInput') as HTMLInputElement;
    const categoryDatalist = document.getElementById('mapSpriteCategoryList') as HTMLDataListElement | null;
    const propertiesBlock = document.getElementById('mapSpriteTerrainPropertiesBlock') as HTMLDivElement;
    const autoBorderBlock = document.getElementById('mapSpriteAutoBorderBlock') as HTMLDivElement;
    const autoBorderToggle = document.getElementById('mapSpriteAutoBorderToggle') as HTMLInputElement;
    const autoBorderFields = document.getElementById('mapSpriteAutoBorderFields') as HTMLDivElement;
    const tileRoleSelect = document.getElementById('mapSpriteTileRoleSelect') as HTMLSelectElement;
    const terrainGroupInput = document.getElementById('mapSpriteTerrainGroupInput') as HTMLInputElement;
    const borderOnlyFields = document.getElementById('mapSpriteBorderOnlyFields') as HTMLDivElement;
    const borderSetIdInput = document.getElementById('mapSpriteBorderSetIdInput') as HTMLInputElement;
    const borderMaskInput = document.getElementById('mapSpriteBorderMaskInput') as HTMLInputElement;
    const tileRoleHelpEl = document.getElementById('mapSpriteTileRoleHelp');
    const tileRolesHelpAllEl = document.getElementById('mapSpriteTileRolesHelpAll');

    // Propriedades físicas
    const walkableToggle = document.getElementById('mapSpriteWalkableToggle') as HTMLInputElement;
    const speedRange = document.getElementById('mapSpriteSpeedRange') as HTMLInputElement;
    const speedValSpan = document.getElementById('mapSpriteSpeedVal') as HTMLSpanElement;
    const stairToggle = document.getElementById('mapSpriteStairToggle') as HTMLInputElement;

    // Ações
    const loadBtn = document.getElementById('loadMapSpriteBtn');
    const importInput = document.getElementById('importMapSpriteInput') as HTMLInputElement;
    const openCalibratorBtn = document.getElementById('openMapSpriteCalibratorBtn');
    const saveServerBtn = document.getElementById('saveMapSpriteServerBtn');

    // Chroma Key
    const chromaKeyToggle = document.getElementById('mapSpriteChromaKeyToggle') as HTMLInputElement;
    const chromaKeyToleranceRow = document.getElementById('mapSpriteChromaKeyToleranceRow') as HTMLDivElement;
    const chromaKeyTolerance = document.getElementById('mapSpriteChromaKeyTolerance') as HTMLInputElement;
    const chromaKeyToleranceVal = document.getElementById('mapSpriteChromaKeyToleranceVal') as HTMLSpanElement;

    // Grade de fatiamento
    const frameWidthInput = document.getElementById('mapSpriteFrameWidth') as HTMLInputElement;
    const frameHeightInput = document.getElementById('mapSpriteFrameHeight') as HTMLInputElement;
    const offsetXInput = document.getElementById('mapSpriteOffsetX') as HTMLInputElement;
    const offsetYInput = document.getElementById('mapSpriteOffsetY') as HTMLInputElement;

    // Carregamento de sprites existentes
    const serverSelect = document.getElementById('mapSpriteServerSelect') as HTMLSelectElement | null;
    const refreshListBtn = document.getElementById('mapSpriteRefreshListBtn');

    // Canvas Preview
    const previewCanvas = document.getElementById('mapSpritePreviewCanvas') as HTMLCanvasElement;
    const previewCtx = previewCanvas?.getContext('2d');

    if (!previewCanvas || !previewCtx) return;

    if (!serverSelect) {
        console.warn(
            '[MapSpriteEditor] Elemento #mapSpriteServerSelect ausente no HTML; lista de sprites não será exibida.'
        );
        toast.info('Lista de sprites existentes indisponível (UI não encontrada).');
    }

    let originalImage: HTMLImageElement | null = null;
    let processedImage: HTMLImageElement | null = null;
    let isImageLoaded = false;
    let serverSpritesList: MapSpriteListEntry[] = [];

    function refreshCategoryDatalist(): void {
        if (!categoryDatalist) return;
        categoryDatalist.innerHTML = '';
        const categories = collectCategoriesForAssetType(
            assetTypeSelect.value,
            serverSpritesList
        );
        for (const cat of categories) {
            const opt = document.createElement('option');
            opt.value = cat;
            categoryDatalist.appendChild(opt);
        }
    }

    async function reloadServerMapSpritesList(): Promise<boolean> {
        try {
            const response = await fetch('/api/list-map-sprites');
            if (!response.ok) {
                const errBody = await response.json().catch(() => ({}));
                throw new Error(
                    (errBody as { error?: string }).error ||
                        'Falha ao listar sprites (use npm run dev).'
                );
            }
            const result = await response.json();
            serverSpritesList = (result.sprites || []) as MapSpriteListEntry[];

            refreshCategoryDatalist();

            if (!serverSelect) return true;

            serverSelect.innerHTML = '<option value="">-- Selecionar Sprite Existente --</option>';

            if (serverSpritesList.length === 0) {
                return true;
            }

            const categories: Record<string, MapSpriteListEntry[]> = {};
            serverSpritesList.forEach((sprite) => {
                const catName =
                    sprite.assetType === 'terrain'
                        ? `Terreno: ${sprite.category}`
                        : `Itens: ${sprite.category}`;
                if (!categories[catName]) categories[catName] = [];
                categories[catName].push(sprite);
            });

            Object.keys(categories)
                .sort()
                .forEach((catName) => {
                    const group = document.createElement('optgroup');
                    group.label = catName;
                    categories[catName].forEach((sprite) => {
                        const opt = document.createElement('option');
                        opt.value = sprite.relativePath;
                        opt.innerText = sprite.name;
                        group.appendChild(opt);
                    });
                    serverSelect.appendChild(group);
                });
            return true;
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            console.error('[MapSpriteEditor] Erro ao recarregar lista de sprites:', err);
            toast.error(`Não foi possível carregar a lista de sprites: ${msg}`);
            return false;
        }
    }

    refreshListBtn?.addEventListener('click', async () => {
        const ok = await reloadServerMapSpritesList();
        if (ok) toast.success('Lista de sprites e subpastas atualizada.');
    });

    void reloadServerMapSpritesList();

    // Evento de seleção de sprite existente
    serverSelect?.addEventListener('change', () => {
        const val = serverSelect.value;
        if (!val) return;

        const sprite = serverSpritesList.find(s => s.relativePath === val);
        if (!sprite) return;

        nameInput.value = sprite.name;
        assetTypeSelect.value = sprite.assetType;
        // Dispara o change para ajustar visibilidade das propriedades
        assetTypeSelect.dispatchEvent(new Event('change'));

        categoryInput.value =
            sprite.category === 'terrain' || sprite.category === 'items'
                ? ''
                : sprite.category ?? '';

        if (sprite.assetType === 'terrain' && sprite.properties) {
            walkableToggle.checked = sprite.properties.walkable ?? true;
            speedRange.value = (sprite.properties.speedModifier ?? 1.0).toString();
            if (speedValSpan) speedValSpan.innerText = parseFloat(speedRange.value).toFixed(1);
            stairToggle.checked = sprite.properties.isStair ?? false;
            if (autoBorderToggle) {
                autoBorderToggle.checked = !!sprite.properties.participatesInAutoBorder;
            }
            if (tileRoleSelect) tileRoleSelect.value = sprite.properties.tileRole ?? 'fill';
            if (terrainGroupInput) terrainGroupInput.value = sprite.properties.terrainGroup ?? '';
            if (borderSetIdInput) borderSetIdInput.value = sprite.properties.borderSetId ?? '';
            if (borderMaskInput) borderMaskInput.value = String(sprite.properties.borderMask ?? 0);
            syncAutoBorderFieldsVisibility();
        }

        // Carrega a imagem física
        isImageLoaded = false;
        toast.info(`Carregando sprite "${sprite.name}"...`);
        
        originalImage = new Image();
        originalImage.src = '/' + sprite.relativePath; // Aponta para a pasta física do projeto servido pelo Vite
        originalImage.onload = async () => {
            await applyChromaProcessing();
            toast.success(`Sprite "${sprite.name}" carregado com sucesso para edição!`);
        };
        originalImage.onerror = () => {
            // Tenta caminho relativo caso o primeiro falhe
            if (originalImage) {
                originalImage.src = sprite.relativePath.startsWith('/')
                    ? sprite.relativePath
                    : '/' + sprite.relativePath;
            }
        };
    });

    function syncAutoBorderUiVisibility(): void {
        const isTerrain = assetTypeSelect.value === 'terrain';
        if (propertiesBlock) propertiesBlock.style.display = isTerrain ? 'block' : 'none';
        if (autoBorderBlock) autoBorderBlock.style.display = isTerrain ? 'block' : 'none';
    }

    function syncAutoBorderRoleHelp(): void {
        if (!tileRoleHelpEl) return;
        const role = normalizeTileRoleHelpKey(tileRoleSelect?.value ?? 'fill');
        tileRoleHelpEl.innerHTML = `<strong>${TILE_ROLE_TITLES[role]}</strong> — ${getTileRoleHelpText(role)}`;
    }

    function syncAutoBorderFieldsVisibility(): void {
        const on = autoBorderToggle?.checked ?? false;
        if (autoBorderFields) autoBorderFields.style.display = on ? 'block' : 'none';
        const isBorder = tileRoleSelect?.value === 'border';
        if (borderOnlyFields) borderOnlyFields.style.display = on && isBorder ? 'block' : 'none';
        if (on) syncAutoBorderRoleHelp();
    }

    if (tileRolesHelpAllEl) {
        tileRolesHelpAllEl.innerHTML = buildAllTileRolesHelpHtml();
    }

    const mapToolbarRolesHelp = document.getElementById('autoBorderMapToolbarRolesHelp');
    if (mapToolbarRolesHelp) {
        mapToolbarRolesHelp.innerHTML = buildAllTileRolesHelpHtml();
    }
    const autoBorderTabRolesHelp = document.getElementById('autoBorderTabRolesHelp');
    if (autoBorderTabRolesHelp) {
        autoBorderTabRolesHelp.innerHTML = buildAllTileRolesHelpHtml();
    }

    autoBorderToggle?.addEventListener('change', syncAutoBorderFieldsVisibility);
    tileRoleSelect?.addEventListener('change', () => {
        syncAutoBorderFieldsVisibility();
        syncAutoBorderRoleHelp();
    });

    // Alterna visualização de propriedades baseado no tipo de asset
    assetTypeSelect?.addEventListener('change', () => {
        syncAutoBorderUiVisibility();
        refreshCategoryDatalist();
    });
    syncAutoBorderUiVisibility();
    syncAutoBorderFieldsVisibility();
    syncAutoBorderRoleHelp();

    // Atualiza valor do slider de velocidade
    speedRange?.addEventListener('input', () => {
        if (speedValSpan) speedValSpan.innerText = parseFloat(speedRange.value).toFixed(1);
    });

    // Atualiza valor do slider de tolerância chroma
    chromaKeyTolerance?.addEventListener('input', () => {
        if (chromaKeyToleranceVal) chromaKeyToleranceVal.innerText = chromaKeyTolerance.value;
        applyChromaProcessing();
    });

    chromaKeyToggle?.addEventListener('change', () => {
        if (chromaKeyToleranceRow) {
            chromaKeyToleranceRow.style.display = chromaKeyToggle.checked ? 'flex' : 'none';
        }
        applyChromaProcessing();
    });

    async function applyChromaProcessing() {
        if (!originalImage) return;
        isImageLoaded = false;
 
        if (chromaKeyToggle.checked) {
            try {
                const tol = parseInt(chromaKeyTolerance.value) || 50;
                processedImage = await removeChromaKey(originalImage, undefined, tol);
            } catch (err) {
                console.error('[MapSpriteEditor] Falha ao remover Chroma Key:', err);
                processedImage = originalImage;
            }
        } else {
            processedImage = originalImage;
        }
        isImageLoaded = true;
    }

    // Carregar spritesheet PNG
    loadBtn?.addEventListener('click', () => {
        importInput?.click();
    });

    importInput?.addEventListener('change', () => {
        const file = importInput.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = () => {
            originalImage = new Image();
            originalImage.src = reader.result as string;
            originalImage.onload = async () => {
                await applyChromaProcessing();
                toast.success('Imagem da spritesheet carregada com sucesso!');
            };
        };
        reader.readAsDataURL(file);
    });

    // Abrir calibrador de grade aproveitando a lógica existente
    openCalibratorBtn?.addEventListener('click', () => {
        if (!originalImage || !processedImage || !isImageLoaded) {
            toast.info('Carregue uma imagem PNG primeiro.');
            return;
        }

        const imgW = processedImage.naturalWidth || processedImage.width;
        const imgH = processedImage.naturalHeight || processedImage.height;
        let fw = parseInt(frameWidthInput.value, 10) || 0;
        let fh = parseInt(frameHeightInput.value, 10) || 0;
        if (fw <= 0 || fh <= 0) {
            fw = imgW;
            fh = imgH;
        }

        const mockConfig = {
            name: nameInput.value,
            spriteSheetUrl: processedImage.src,
            frameWidth: fw,
            frameHeight: fh,
            defaultDirection: 'down' as const,
            animations: {
                'idle_down': { row: 0, startFrame: 0, frames: 1, speedFps: 5, loop: true }
            },
            offsetX: parseInt(offsetXInput.value, 10) || 0,
            offsetY: parseInt(offsetYInput.value, 10) || 0,
            gapX: 0,
            gapY: 0,
            anchorX: 0,
            anchorY: 0
        };

        openCharacterCalibrator(
            processedImage,
            mockConfig,
            'idle',
            'down',
            (result) => {
                frameWidthInput.value = result.frameWidth.toString();
                frameHeightInput.value = result.frameHeight.toString();
                offsetXInput.value = result.offsetX.toString();
                offsetYInput.value = result.offsetY.toString();
                toast.success('Grade calibrada com sucesso!');
            },
            { mode: 'map', initialGridCols: 1, initialGridRows: 1 }
        );
    });

    // Salvar no Servidor
    saveServerBtn?.addEventListener('click', async () => {
        if (!originalImage || !processedImage || !isImageLoaded) {
            toast.error('Nenhuma imagem carregada para salvar.');
            return;
        }

        const name = nameInput.value.trim();
        if (!name) {
            toast.error('Por favor, informe o nome do sprite.');
            return;
        }

        try {
            (saveServerBtn as HTMLButtonElement).disabled = true;
            const originalText = saveServerBtn.innerText;
            saveServerBtn.innerText = '⌛ Gravando...';

            const tileRole = tileRoleSelect?.value ?? 'fill';
            if (autoBorderToggle?.checked && tileRole === 'border') {
                const setId = borderSetIdInput?.value.trim();
                const mask = parseInt(borderMaskInput?.value ?? '', 10);
                if (!setId || Number.isNaN(mask) || mask < 0 || mask > 15) {
                    toast.error('Tiles de borda precisam de conjunto e máscara (0–15).');
                    (saveServerBtn as HTMLButtonElement).disabled = false;
                    saveServerBtn!.innerText = '💾 Salvar no Servidor';
                    return;
                }
            }

            const properties: Record<string, unknown> = {
                walkable: walkableToggle.checked,
                speedModifier: parseFloat(speedRange.value) || 1.0,
                isStair: stairToggle.checked,
            };

            if (assetTypeSelect.value === 'terrain' && autoBorderToggle?.checked) {
                properties.participatesInAutoBorder = true;
                properties.tileRole = tileRole;
                properties.terrainGroup = terrainGroupInput?.value.trim() || undefined;
                if (tileRole === 'border') {
                    properties.borderSetId = borderSetIdInput?.value.trim();
                    properties.borderMask = parseInt(borderMaskInput?.value ?? '0', 10);
                }
            }

            const rawCategory = categoryInput.value.trim();
            const category = sanitizeMapSpriteCategory(rawCategory);
            if (rawCategory && !category) {
                toast.error(
                    'Subpasta inválida. Use apenas letras, números, _ - e / (sem ..).'
                );
                (saveServerBtn as HTMLButtonElement).disabled = false;
                saveServerBtn!.innerText = '💾 Salvar no Servidor';
                return;
            }
            if (rawCategory && rawCategory !== category) {
                categoryInput.value = category;
                toast.info(`Subpasta ajustada para: "${category}"`);
            }

            const payload = {
                name: name,
                assetType: assetTypeSelect.value,
                category,
                spriteBase64: processedImage.src,
                properties,
            };

            const response = await fetch('/api/save-map-sprite', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                const errData = await response.json();
                throw new Error(errData.error || 'Erro ao gravar no servidor.');
            }

            const result = await response.json();
            toast.success(`Sprite "${result.name}" salvo com sucesso no servidor! O Vite recarregará o editor automaticamente.`);

            saveServerBtn.innerText = originalText;
            (saveServerBtn as HTMLButtonElement).disabled = false;

            await reloadServerMapSpritesList();
            if (afterSaveSpriteHandler) {
                await afterSaveSpriteHandler();
            }
        } catch (err: any) {
            console.error('[MapSpriteEditor] Falha ao salvar no servidor:', err);
            popup.alert(`Falha ao salvar no servidor: ${err.message}`, 'Erro ao Salvar');
            saveServerBtn.innerText = '💾 Salvar no Servidor';
            (saveServerBtn as HTMLButtonElement).disabled = false;
        }
    });

    // Loop de visualização estática do frame 0 fatiado no preview do painel
    function drawPreviewLoop() {
        requestAnimationFrame(drawPreviewLoop);

        if (!previewCtx) return;
        previewCtx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);

        if (!isImageLoaded || !processedImage) {
            previewCtx.fillStyle = '#3f4452';
            previewCtx.font = '10px sans-serif';
            previewCtx.textAlign = 'center';
            previewCtx.textBaseline = 'middle';
            previewCtx.fillText('Sem Sprite', previewCanvas.width / 2, previewCanvas.height / 2);
            return;
        }

        const fw = parseInt(frameWidthInput.value) || 64;
        const fh = parseInt(frameHeightInput.value) || 64;
        const ox = parseInt(offsetXInput.value) || 0;
        const oy = parseInt(offsetYInput.value) || 0;

        previewCtx.drawImage(
            processedImage,
            ox, oy, fw, fh,
            0, 0, previewCanvas.width, previewCanvas.height
        );
    }

    requestAnimationFrame(drawPreviewLoop);
}
