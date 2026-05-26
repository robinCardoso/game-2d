import { toast, popup } from '../utils/popup';
import { removeChromaKey } from '../utils/imageProcessor';
import { openCharacterCalibrator } from './characterCalibratorModal';

export function initMapSpriteEditor() {
    const nameInput = document.getElementById('mapSpriteNameInput') as HTMLInputElement;
    const assetTypeSelect = document.getElementById('mapSpriteAssetTypeSelect') as HTMLSelectElement;
    const categoryInput = document.getElementById('mapSpriteCategoryInput') as HTMLInputElement;
    const propertiesBlock = document.getElementById('mapSpriteTerrainPropertiesBlock') as HTMLDivElement;

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

    // Canvas Preview
    const previewCanvas = document.getElementById('mapSpritePreviewCanvas') as HTMLCanvasElement;
    const previewCtx = previewCanvas?.getContext('2d');

    if (!previewCanvas || !previewCtx) return;

    let originalImage: HTMLImageElement | null = null;
    let processedImage: HTMLImageElement | null = null;
    let isImageLoaded = false;

    // Alterna visualização de propriedades baseado no tipo de asset
    assetTypeSelect?.addEventListener('change', () => {
        if (propertiesBlock) {
            propertiesBlock.style.display = assetTypeSelect.value === 'terrain' ? 'block' : 'none';
        }
    });

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

        // Mockamos uma estrutura CharacterSpriteConfig compatível
        const mockConfig = {
            name: nameInput.value,
            spriteSheetUrl: processedImage.src,
            frameWidth: parseInt(frameWidthInput.value) || 64,
            frameHeight: parseInt(frameHeightInput.value) || 64,
            defaultDirection: 'down' as const,
            animations: {
                'idle_down': { row: 0, startFrame: 0, frames: 1, speedFps: 5, loop: true }
            },
            offsetX: parseInt(offsetXInput.value) || 0,
            offsetY: parseInt(offsetYInput.value) || 0,
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
                // Recupera as configurações ajustadas
                frameWidthInput.value = result.frameWidth.toString();
                frameHeightInput.value = result.frameHeight.toString();
                offsetXInput.value = result.offsetX.toString();
                offsetYInput.value = result.offsetY.toString();
                toast.success('Grade calibrada com sucesso!');
            }
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

            const payload = {
                name: name,
                assetType: assetTypeSelect.value,
                category: categoryInput.value.trim(),
                spriteBase64: processedImage.src, // Envia a imagem já limpa pelo Chroma Key
                properties: {
                    walkable: walkableToggle.checked,
                    speedModifier: parseFloat(speedRange.value) || 1.0,
                    isStair: stairToggle.checked
                }
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
