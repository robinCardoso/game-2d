import type { CharacterSpriteConfig } from '../character/spriteAnimation';

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
}

export function openCharacterCalibrator(
    imageElement: HTMLImageElement,
    initialConfig: CharacterSpriteConfig,
    initialState: string,
    initialDirection: string,
    onConfirm: (result: CalibrationResult) => void
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

    if (!modal || !canvas || !ctx) return;

    // Cópia profunda das configurações para manipulação interativa no modal
    let localFrameWidth = initialConfig.frameWidth;
    let localFrameHeight = initialConfig.frameHeight;
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

    // Ajusta o Canvas para a imagem real
    canvas.width = imageElement.naturalWidth || imageElement.width;
    canvas.height = imageElement.naturalHeight || imageElement.height;

    // Inicializa os inputs com os dados correntes
    calFrameWidthInput.value = localFrameWidth.toString();
    calFrameHeightInput.value = localFrameHeight.toString();
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
        anim.row = parseInt(calAnimRowInput.value) ?? 0;
        anim.startFrame = parseInt(calAnimStartFrameInput.value) ?? 0;
        anim.frames = Math.max(1, parseInt(calAnimFramesInput.value) ?? 1);
        anim.speedFps = Math.max(1, parseInt(calAnimSpeedInput.value) ?? 1);
    }

    // Atualiza a visualização do Zoom
    function updateZoom() {
        const zoom = parseFloat(calZoomInput.value);
        calZoomValSpan.innerText = `${Math.round(zoom * 100)}%`;
        canvas.style.width = `${canvas.width * zoom}px`;
        canvas.style.height = `${canvas.height * zoom}px`;
    }

    calZoomInput.addEventListener('input', updateZoom);

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

                // Destaque da animação ativa
                const isActive = localSheetLayout === 'vertical'
                    ? (activeAnim && c === activeAnim.row && r >= (activeAnim.startFrame ?? 0) && r < (activeAnim.startFrame ?? 0) + activeAnim.frames)
                    : (activeAnim && r === activeAnim.row && c >= (activeAnim.startFrame ?? 0) && c < (activeAnim.startFrame ?? 0) + activeAnim.frames);

                if (isActive) {
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
    }

    // Clique e Arraste (Drag-to-Align) com suporte dinâmico a Zoom!
    let isDragging = false;
    let dragStartX = 0;
    let dragStartY = 0;
    let originalOffsetX = 0;
    let originalOffsetY = 0;

    canvas.addEventListener('mousedown', (e) => {
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        const clickX = Math.round((e.clientX - rect.left) * scaleX);
        const clickY = Math.round((e.clientY - rect.top) * scaleY);

        isDragging = true;
        dragStartX = clickX;
        dragStartY = clickY;
        originalOffsetX = localOffsetX;
        originalOffsetY = localOffsetY;

        localOffsetX = clickX;
        localOffsetY = clickY;

        calOffsetXInput.value = localOffsetX.toString();
        calOffsetYInput.value = localOffsetY.toString();
        renderCalibrator();
    });

    window.addEventListener('mousemove', (e) => {
        if (!isDragging) return;

        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        const currentX = Math.round((e.clientX - rect.left) * scaleX);
        const currentY = Math.round((e.clientY - rect.top) * scaleY);

        const dx = currentX - dragStartX;
        const dy = currentY - dragStartY;

        localOffsetX = originalOffsetX + dx;
        localOffsetY = originalOffsetY + dy;

        calOffsetXInput.value = localOffsetX.toString();
        calOffsetYInput.value = localOffsetY.toString();
        renderCalibrator();
    });

    window.addEventListener('mouseup', () => {
        isDragging = false;
    });

    // Inputs globais atualizam em tempo real
    const gridInputs = [
        calFrameWidthInput, calFrameHeightInput, calOffsetXInput,
        calOffsetYInput, calGapXInput, calGapYInput, calAnchorXInput, calAnchorYInput
    ];
    gridInputs.forEach(el => {
        el.addEventListener('input', () => {
            localFrameWidth = parseInt(calFrameWidthInput.value) || 64;
            localFrameHeight = parseInt(calFrameHeightInput.value) || 64;
            localOffsetX = parseInt(calOffsetXInput.value) || 0;
            localOffsetY = parseInt(calOffsetYInput.value) || 0;
            localGapX = parseInt(calGapXInput.value) || 0;
            localGapY = parseInt(calGapYInput.value) || 0;
            localAnchorX = parseInt(calAnchorXInput.value) || 0;
            localAnchorY = parseInt(calAnchorYInput.value) || 0;
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
            sheetLayout: localSheetLayout
        });
        closeModal();
    });

    // Inicialização do Modal
    syncAnimationToUI();
    updateZoom();
    modal.classList.add('is-open');
    renderCalibrator();
}
