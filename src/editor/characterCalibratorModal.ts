import type { CharacterSpriteConfig } from '../character/spriteAnimation';
import { computeFrameDimensionsFromGrid } from './calibratorGrid';
import { toast } from '../utils/popup';

export interface CalibratorOpenOptions {
    /** map: tile único / spritesheet de terreno; oculta painel de animações */
    mode?: 'map' | 'character';
    initialGridCols?: number;
    initialGridRows?: number;
}

export interface CalibrationResult {
    frameWidth: number;
    frameHeight: number;
    offsetX: number;
    offsetY: number;
    gapX: number;
    gapY: number;
    anchorX: number;
    anchorY: number;
    animations: any;
    currentState: string;
    currentDirection: string;
    sheetLayout: string;
    selectedFrameCol?: number;
    selectedFrameRow?: number;
}

export function openCharacterCalibrator(
    imageElement: HTMLImageElement,
    initialConfig: CharacterSpriteConfig,
    initialState: string,
    initialDirection: string,
    onConfirm: (result: CalibrationResult) => void,
    options?: CalibratorOpenOptions
) {
    const modal = document.getElementById('calibratorModal');
    const closeBtn = document.getElementById('calibratorClose');
    const cancelBtn = document.getElementById('calCancelBtn');
    const confirmBtn = document.getElementById('calConfirmBtn');
    const canvas = document.getElementById('calibratorCanvas') as HTMLCanvasElement;
    const ctx = canvas?.getContext('2d');

    // Elementos da Esquerda: Zoom
    const calZoomInput = document.getElementById('calZoom') as HTMLInputElement;
    const calZoomValSpan = document.getElementById('calZoomVal') as HTMLSpanElement;

    // Submenu 1: Grade de Fatiamento
    const calFrameWidthInput = document.getElementById('calFrameWidth') as HTMLInputElement;
    const calFrameHeightInput = document.getElementById('calFrameHeight') as HTMLInputElement;
    const calOffsetXInput = document.getElementById('calOffsetX') as HTMLInputElement;
    const calOffsetYInput = document.getElementById('calOffsetY') as HTMLInputElement;
    const calGapXInput = document.getElementById('calGapX') as HTMLInputElement;
    const calGapYInput = document.getElementById('calGapY') as HTMLInputElement;
    const calSheetLayoutSelect = document.getElementById('calSheetLayout') as HTMLSelectElement;

    // Submenu 2: Âncora
    const calAnchorXInput = document.getElementById('calAnchorX') as HTMLInputElement;
    const calAnchorYInput = document.getElementById('calAnchorY') as HTMLInputElement;

    // Submenu 3: Animações
    const calAnimStateSelect = document.getElementById('calAnimState') as HTMLSelectElement;
    const calAnimDirSelect = document.getElementById('calAnimDir') as HTMLSelectElement;
    const calAnimRowInput = document.getElementById('calAnimRow') as HTMLInputElement;
    const calAnimStartFrameInput = document.getElementById('calAnimStartFrame') as HTMLInputElement;
    const calAnimFramesInput = document.getElementById('calAnimFrames') as HTMLInputElement;
    const calAnimSpeedInput = document.getElementById('calAnimSpeed') as HTMLInputElement;

    const calImageSizeLabel = document.getElementById('calImageSizeLabel');
    const calGridColsInput = document.getElementById('calGridCols') as HTMLInputElement;
    const calGridRowsInput = document.getElementById('calGridRows') as HTMLInputElement;
    const calGridApplyBtn = document.getElementById('calGridApplyBtn');
    const calGrid1x1Btn = document.getElementById('calGrid1x1Btn');
    const calGrid4x4Btn = document.getElementById('calGrid4x4Btn');
    const calGridResultLabel = document.getElementById('calGridResultLabel');
    const calGridRemainderLabel = document.getElementById('calGridRemainderLabel');
    const calibratorAnimPanel = document.getElementById('calibratorAnimPanel');

    if (!modal || !canvas || !ctx) return;

    const imageW = imageElement.naturalWidth || imageElement.width;
    const imageH = imageElement.naturalHeight || imageElement.height;
    const isMapMode = options?.mode === 'map';

    if (calibratorAnimPanel) {
        calibratorAnimPanel.style.display = isMapMode ? 'none' : '';
    }

    // Cópia profunda das configurações para manipulação interativa no modal
    let localFrameWidth = initialConfig.frameWidth > 0 ? initialConfig.frameWidth : imageW;
    let localFrameHeight = initialConfig.frameHeight > 0 ? initialConfig.frameHeight : imageH;
    let localOffsetX = initialConfig.offsetX ?? 0;
    let localOffsetY = initialConfig.offsetY ?? 0;
    let localGapX = initialConfig.gapX ?? 0;
    let localGapY = initialConfig.gapY ?? 0;
    let localAnchorX = initialConfig.anchorX ?? 0;
    let localAnchorY = initialConfig.anchorY ?? 0;
    let localSheetLayout = initialConfig.sheetLayout || 'horizontal';

    let localAnimations = JSON.parse(JSON.stringify(initialConfig.animations));
    let activeState = initialState;
    let activeDirection = initialDirection;

    let localGridCols = Math.max(1, options?.initialGridCols ?? (isMapMode ? 1 : 1));
    let localGridRows = Math.max(1, options?.initialGridRows ?? (isMapMode ? 1 : 1));

    // Ajusta o Canvas para a imagem real
    canvas.width = imageW;
    canvas.height = imageH;

    function updateImageSizeLabel(): void {
        if (calImageSizeLabel) {
            calImageSizeLabel.textContent = `Imagem: ${imageW} × ${imageH} px`;
        }
    }

    function syncGridInputsToLocal(): void {
        if (calGridColsInput) calGridColsInput.value = String(localGridCols);
        if (calGridRowsInput) calGridRowsInput.value = String(localGridRows);
    }

    function readGridInputsFromUI(): { cols: number; rows: number } {
        const cols = Math.max(1, parseInt(calGridColsInput?.value ?? '1', 10) || 1);
        const rows = Math.max(1, parseInt(calGridRowsInput?.value ?? '1', 10) || 1);
        return { cols, rows };
    }

    function updateDivisionPreview(result: ReturnType<typeof computeFrameDimensionsFromGrid>): void {
        if (calGridResultLabel) {
            calGridResultLabel.textContent = `Frame calculado: ${result.frameWidth} × ${result.frameHeight} px (${result.cols}×${result.rows})`;
        }
        if (calGridRemainderLabel) {
            if (result.remainderX > 0 || result.remainderY > 0) {
                const parts: string[] = [];
                if (result.remainderX > 0) parts.push(`${result.remainderX}px à direita`);
                if (result.remainderY > 0) parts.push(`${result.remainderY}px abaixo`);
                calGridRemainderLabel.textContent = `⚠ Sobram ${parts.join(' e ')} — ajuste margem, gap ou nº de frames.`;
                calGridRemainderLabel.style.display = 'block';
            } else {
                calGridRemainderLabel.style.display = 'none';
            }
        }
    }

    function applyGridDivision(cols: number, rows: number, showToast = true): boolean {
        localGridCols = Math.max(1, Math.floor(cols) || 1);
        localGridRows = Math.max(1, Math.floor(rows) || 1);
        syncGridInputsToLocal();

        const result = computeFrameDimensionsFromGrid(
            imageW,
            imageH,
            localGridCols,
            localGridRows,
            localOffsetX,
            localOffsetY,
            localGapX,
            localGapY
        );

        if (result.frameWidth < 1 || result.frameHeight < 1) {
            toast.error('Divisão inválida: frame ficaria com 0 px. Reduza colunas/linhas ou margens.');
            updateDivisionPreview(result);
            return false;
        }

        localFrameWidth = result.frameWidth;
        localFrameHeight = result.frameHeight;
        calFrameWidthInput.value = String(localFrameWidth);
        calFrameHeightInput.value = String(localFrameHeight);
        updateDivisionPreview(result);
        renderCalibrator();
        if (showToast) {
            toast.success(`Grade ${localGridCols}×${localGridRows} → frames ${localFrameWidth}×${localFrameHeight} px`);
        }
        return true;
    }

    function previewDivisionFromUI(): void {
        const { cols, rows } = readGridInputsFromUI();
        const result = computeFrameDimensionsFromGrid(
            imageW,
            imageH,
            cols,
            rows,
            localOffsetX,
            localOffsetY,
            localGapX,
            localGapY
        );
        updateDivisionPreview(result);
    }

    // Inicializa os inputs com os dados correntes
    calFrameWidthInput.value = localFrameWidth.toString();
    calFrameHeightInput.value = localFrameHeight.toString();
    syncGridInputsToLocal();
    updateImageSizeLabel();
    calOffsetXInput.value = localOffsetX.toString();
    calOffsetYInput.value = localOffsetY.toString();
    calGapXInput.value = localGapX.toString();
    calGapYInput.value = localGapY.toString();
    calAnchorXInput.value = localAnchorX.toString();
    calAnchorYInput.value = localAnchorY.toString();
    if (calSheetLayoutSelect) {
        calSheetLayoutSelect.value = localSheetLayout;
    }

    calAnimStateSelect.value = activeState;
    calAnimDirSelect.value = activeDirection;

    // Sincroniza a animação selecionada para a UI
    function syncAnimationToUI() {
        const key = `${activeState}_${activeDirection}`;
        let anim = localAnimations[key];
        if (!anim) {
            localAnimations[key] = { row: 0, startFrame: 0, frames: 1, speedFps: 5, loop: true };
            anim = localAnimations[key];
        }
        calAnimRowInput.value = anim.row.toString();
        calAnimStartFrameInput.value = (anim.startFrame ?? 0).toString();
        calAnimFramesInput.value = anim.frames.toString();
        calAnimSpeedInput.value = anim.speedFps.toString();
    }

    // Salva a animação atual que está na UI de volta para o objeto local
    function syncUIToAnimation() {
        const key = `${activeState}_${activeDirection}`;
        if (!localAnimations[key]) {
            localAnimations[key] = { row: 0, startFrame: 0, frames: 1, speedFps: 5, loop: true };
        }
        const anim = localAnimations[key];
        
        const valRow = parseInt(calAnimRowInput.value, 10);
        anim.row = Number.isNaN(valRow) ? 0 : valRow;

        const valStart = parseInt(calAnimStartFrameInput.value, 10);
        anim.startFrame = Number.isNaN(valStart) ? 0 : valStart;

        const valFrames = parseInt(calAnimFramesInput.value, 10);
        anim.frames = Number.isNaN(valFrames) || valFrames < 1 ? 1 : valFrames;

        const valSpeed = parseInt(calAnimSpeedInput.value, 10);
        anim.speedFps = Number.isNaN(valSpeed) || valSpeed < 1 ? 1 : valSpeed;
    }

    // Atualiza a visualização do Zoom
    function updateZoom() {
        const zoom = parseFloat(calZoomInput.value);
        calZoomValSpan.innerText = `${Math.round(zoom * 100)}%`;
        canvas.style.width = `${canvas.width * zoom}px`;
        canvas.style.height = `${canvas.height * zoom}px`;
    }

    calZoomInput.addEventListener('input', updateZoom);

    let selectedFrameCol = 0;
    let selectedFrameRow = 0;

    // Desenha a grade
    function renderCalibrator() {
        if (!ctx) return;
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // 1. Desenha a spritesheet de fundo
        ctx.drawImage(imageElement, 0, 0);

        // 2. Desenha a grade vermelha com base no frameWidth/Height atuais
        ctx.strokeStyle = 'rgba(255, 60, 60, 0.7)';
        ctx.lineWidth = 1;

        const cols = Math.floor((canvas.width - localOffsetX) / (localFrameWidth + localGapX));
        const rows = Math.floor((canvas.height - localOffsetY) / (localFrameHeight + localGapY));

        const key = `${activeState}_${activeDirection}`;
        const activeAnim = localAnimations[key];

        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                const x = localOffsetX + c * (localFrameWidth + localGapX);
                const y = localOffsetY + r * (localFrameHeight + localGapY);

                // Grade vermelha padrão
                ctx.strokeRect(x, y, localFrameWidth, localFrameHeight);

                // Destaque do primeiro frame
                if (r === 0 && c === 0) {
                    ctx.fillStyle = 'rgba(0, 255, 255, 0.8)';
                    ctx.fillRect(x + localFrameWidth / 2 - 2, y + localFrameHeight / 2 - 2, 4, 4);
                }

                // Destaque do frame selecionado em modo mapa
                if (isMapMode && r === selectedFrameRow && c === selectedFrameCol) {
                    ctx.strokeStyle = '#22c55e'; // Green border
                    ctx.lineWidth = 3;
                    ctx.strokeRect(x + 1, y + 1, localFrameWidth - 2, localFrameHeight - 2);
                    ctx.fillStyle = 'rgba(34, 197, 94, 0.25)'; // Green tint
                    ctx.fillRect(x + 2, y + 2, localFrameWidth - 4, localFrameHeight - 4);
                    
                    ctx.fillStyle = '#22c55e';
                    ctx.font = 'bold 12px sans-serif';
                    ctx.fillText('SELECIONADO', x + 6, y + 18);
                    
                    // Restaura estilos
                    ctx.strokeStyle = 'rgba(255, 60, 60, 0.7)';
                    ctx.lineWidth = 1;
                }

                // Destaque da animação ativa
                const isActive = localSheetLayout === 'vertical'
                    ? (activeAnim && c === activeAnim.row && r >= (activeAnim.startFrame ?? 0) && r < (activeAnim.startFrame ?? 0) + activeAnim.frames)
                    : (activeAnim && r === activeAnim.row && c >= (activeAnim.startFrame ?? 0) && c < (activeAnim.startFrame ?? 0) + activeAnim.frames);

                if (isActive && !isMapMode) {
                    // Desenha borda verde brilhante
                    ctx.strokeStyle = '#4ade80';
                    ctx.lineWidth = 2.5;
                    ctx.strokeRect(x + 1, y + 1, localFrameWidth - 2, localFrameHeight - 2);
                    
                    // Desenha preenchimento verde translúcido
                    ctx.fillStyle = 'rgba(74, 222, 128, 0.2)';
                    ctx.fillRect(x + 2, y + 2, localFrameWidth - 4, localFrameHeight - 4);
                    
                    // Desenha o ponto azul (cyan) no meio do frame selecionado
                    ctx.fillStyle = 'rgba(0, 255, 255, 0.9)';
                    ctx.fillRect(x + localFrameWidth / 2 - 2, y + localFrameHeight / 2 - 2, 4, 4);
                    
                    // Adiciona o número do frame da animação no topo-esquerdo do bloco
                    ctx.fillStyle = '#4ade80';
                    ctx.font = 'bold 12px sans-serif';
                    const frameIndex = localSheetLayout === 'vertical' 
                        ? r - (activeAnim.startFrame ?? 0)
                        : c - (activeAnim.startFrame ?? 0);
                    ctx.fillText(`F${frameIndex + 1}`, x + 6, y + 18);
                    
                    // Restaura estilos padrão para os próximos retângulos da grade
                    ctx.strokeStyle = 'rgba(255, 60, 60, 0.7)';
                    ctx.lineWidth = 1;
                }
            }
        }

        const preview = computeFrameDimensionsFromGrid(
            canvas.width,
            canvas.height,
            localGridCols,
            localGridRows,
            localOffsetX,
            localOffsetY,
            localGapX,
            localGapY
        );
        if (preview.remainderX > 0) {
            const x =
                localOffsetX +
                localGridCols * preview.frameWidth +
                (localGridCols - 1) * localGapX;
            ctx.fillStyle = 'rgba(251, 191, 36, 0.25)';
            ctx.fillRect(x, localOffsetY, preview.remainderX, canvas.height - localOffsetY);
        }
        if (preview.remainderY > 0) {
            const y =
                localOffsetY +
                localGridRows * preview.frameHeight +
                (localGridRows - 1) * localGapY;
            ctx.fillStyle = 'rgba(251, 191, 36, 0.25)';
            ctx.fillRect(localOffsetX, y, canvas.width - localOffsetX, preview.remainderY);
        }
    }

    // Clique e Arraste (Drag-to-Align) com suporte dinâmico a Zoom!
    let isDragging = false;
    let hasDragged = false;
    let dragStartX = 0;
    let dragStartY = 0;
    let originalOffsetX = 0;
    let originalOffsetY = 0;

    canvas.addEventListener('mousedown', (e) => {
        isDragging = true;
        hasDragged = false;
        dragStartX = e.clientX;
        dragStartY = e.clientY;
        originalOffsetX = localOffsetX;
        originalOffsetY = localOffsetY;
    });

    window.addEventListener('mousemove', (e) => {
        if (!isDragging) return;

        const dx = e.clientX - dragStartX;
        const dy = e.clientY - dragStartY;

        if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
            hasDragged = true;
        }

        if (hasDragged) {
            const rect = canvas.getBoundingClientRect();
            const scaleX = canvas.width / rect.width;
            const scaleY = canvas.height / rect.height;
            localOffsetX = Math.round(originalOffsetX + dx * scaleX);
            localOffsetY = Math.round(originalOffsetY + dy * scaleY);

            calOffsetXInput.value = localOffsetX.toString();
            calOffsetYInput.value = localOffsetY.toString();
            renderCalibrator();
        }
    });

    window.addEventListener('mouseup', (e) => {
        if (isDragging) {
            isDragging = false;
            if (!hasDragged) {
                // Foi apenas um clique! Seleciona o frame correspondente
                const rect = canvas.getBoundingClientRect();
                const scaleX = canvas.width / rect.width;
                const scaleY = canvas.height / rect.height;
                const clickX = Math.round((e.clientX - rect.left) * scaleX);
                const clickY = Math.round((e.clientY - rect.top) * scaleY);

                const col = Math.floor((clickX - localOffsetX) / (localFrameWidth + localGapX));
                const row = Math.floor((clickY - localOffsetY) / (localFrameHeight + localGapY));

                const cols = Math.floor((canvas.width - localOffsetX) / (localFrameWidth + localGapX));
                const rows = Math.floor((canvas.height - localOffsetY) / (localFrameHeight + localGapY));

                if (col >= 0 && col < cols && row >= 0 && row < rows) {
                    selectedFrameCol = col;
                    selectedFrameRow = row;
                    renderCalibrator();
                    toast.info(`Selecionado frame: Col ${col + 1}, Linha ${row + 1}`);
                }
            }
        }
    });

    // Inputs globais atualizam em tempo real
    const gridInputs = [
        calFrameWidthInput, calFrameHeightInput, calOffsetXInput,
        calOffsetYInput, calGapXInput, calGapYInput, calAnchorXInput, calAnchorYInput
    ];
    gridInputs.forEach(el => {
        el.addEventListener('input', () => {
            const fw = parseInt(calFrameWidthInput.value, 10);
            const fh = parseInt(calFrameHeightInput.value, 10);
            localFrameWidth = Number.isFinite(fw) && fw > 0 ? fw : localFrameWidth;
            localFrameHeight = Number.isFinite(fh) && fh > 0 ? fh : localFrameHeight;
            localOffsetX = parseInt(calOffsetXInput.value, 10) || 0;
            localOffsetY = parseInt(calOffsetYInput.value, 10) || 0;
            localGapX = parseInt(calGapXInput.value, 10) || 0;
            localGapY = parseInt(calGapYInput.value, 10) || 0;
            localAnchorX = parseInt(calAnchorXInput.value, 10) || 0;
            localAnchorY = parseInt(calAnchorYInput.value, 10) || 0;
            previewDivisionFromUI();
            renderCalibrator();
        });
    });

    calGridApplyBtn?.addEventListener('click', () => {
        const { cols, rows } = readGridInputsFromUI();
        applyGridDivision(cols, rows, true);
    });

    calGrid1x1Btn?.addEventListener('click', () => {
        applyGridDivision(1, 1, true);
    });

    calGrid4x4Btn?.addEventListener('click', () => {
        applyGridDivision(4, 4, true);
    });

    [calGridColsInput, calGridRowsInput].forEach((el) => {
        el?.addEventListener('input', () => {
            const { cols, rows } = readGridInputsFromUI();
            localGridCols = cols;
            localGridRows = rows;
            previewDivisionFromUI();
            renderCalibrator();
        });
    });

    calSheetLayoutSelect?.addEventListener('change', () => {
        localSheetLayout = calSheetLayoutSelect.value as 'horizontal' | 'vertical';
        renderCalibrator();
    });

    // Mudança de Estado/Direção sincroniza inputs secundários
    calAnimStateSelect.addEventListener('change', () => {
        syncUIToAnimation();
        activeState = calAnimStateSelect.value;
        syncAnimationToUI();
        renderCalibrator();
    });

    calAnimDirSelect.addEventListener('change', () => {
        syncUIToAnimation();
        activeDirection = calAnimDirSelect.value;
        syncAnimationToUI();
        renderCalibrator();
    });

    // Inputs das configurações de animação salvam em tempo real
    const animInputs = [calAnimRowInput, calAnimStartFrameInput, calAnimFramesInput, calAnimSpeedInput];
    animInputs.forEach(el => {
        el.addEventListener('input', () => {
            syncUIToAnimation();
            renderCalibrator();
        });
    });

    function closeModal() {
        modal?.classList.remove('is-open');
    }

    closeBtn?.addEventListener('click', closeModal);
    cancelBtn?.addEventListener('click', closeModal);

    confirmBtn?.addEventListener('click', () => {
        if (localFrameWidth < 1 || localFrameHeight < 1) {
            toast.error('Largura e altura do frame devem ser maiores que 0. Use "Aplicar divisão" ou ajuste manualmente.');
            return;
        }
        syncUIToAnimation();
        onConfirm({
            frameWidth: localFrameWidth,
            frameHeight: localFrameHeight,
            offsetX: localOffsetX,
            offsetY: localOffsetY,
            gapX: localGapX,
            gapY: localGapY,
            anchorX: localAnchorX,
            anchorY: localAnchorY,
            animations: localAnimations,
            currentState: activeState,
            currentDirection: activeDirection,
            sheetLayout: localSheetLayout,
            selectedFrameCol: selectedFrameCol,
            selectedFrameRow: selectedFrameRow
        });
        closeModal();
    });

    // Inicialização do Modal
    if (initialConfig.frameWidth <= 0 || initialConfig.frameHeight <= 0) {
        applyGridDivision(localGridCols, localGridRows, false);
    } else {
        previewDivisionFromUI();
    }
    syncAnimationToUI();
    updateZoom();
    modal.classList.add('is-open');
    renderCalibrator();
}
