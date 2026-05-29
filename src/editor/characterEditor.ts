import { activeCharacterController } from '../main';
import { serializeCharacterConfig, parseCharacterConfig } from '../character/characterSerializer';
import type { CharacterState, Direction } from '../character/spriteAnimation';
import { openCharacterCalibrator } from './characterCalibratorModal';
import { toast, popup } from '../utils/popup';

export function initCharacterEditor() {
    // Função utilitária para salvar as configurações ativas no localStorage de forma automática
    function saveConfigToLocalStorage() {
        try {
            const config = activeCharacterController.config;
            localStorage.setItem('game2d_active_character_config', JSON.stringify(config));
        } catch (e) {
            // Se exceder o limite de localStorage por causa do base64 do PNG, salva apenas o metadado estrutural
            if (e instanceof DOMException && (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED')) {
                console.warn('[Character Storage] Cota do localStorage excedida devido ao tamanho da imagem Base64. Salvando apenas as coordenadas e metadados.');
                try {
                    const configCopy = { ...activeCharacterController.config };
                    configCopy.spriteSheetUrl = 'tiles/characters/knight.png'; // Substitui pelo asset local leve de fallback
                    localStorage.setItem('game2d_active_character_config', JSON.stringify(configCopy));
                } catch (innerErr) {
                    console.error('[Character Storage] Falha ao salvar configuração reduzida:', innerErr);
                }
            } else {
                console.error('[Character Storage] Erro inesperado ao salvar no localStorage:', e);
            }
        }
    }

    const frameWidthEl = document.getElementById('charFrameWidth') as HTMLInputElement;
    const frameHeightEl = document.getElementById('charFrameHeight') as HTMLInputElement;
    
    // Novos inputs de Margens, Espaçamento e Âncora
    const offsetXEl = document.getElementById('charOffsetX') as HTMLInputElement;
    const offsetYEl = document.getElementById('charOffsetY') as HTMLInputElement;
    const gapXEl = document.getElementById('charGapX') as HTMLInputElement;
    const gapYEl = document.getElementById('charGapY') as HTMLInputElement;
    const anchorXEl = document.getElementById('charAnchorX') as HTMLInputElement;
    const anchorYEl = document.getElementById('charAnchorY') as HTMLInputElement;

    const animStateEl = document.getElementById('charAnimState') as HTMLSelectElement;
    const animDirEl = document.getElementById('charAnimDir') as HTMLSelectElement;
    const animRowEl = document.getElementById('charAnimRow') as HTMLInputElement;
    
    // Novo input de Frame Inicial de Animação
    const animStartFrameEl = document.getElementById('charAnimStartFrame') as HTMLInputElement;
    
    const animFramesEl = document.getElementById('charAnimFrames') as HTMLInputElement;
    const animSpeedEl = document.getElementById('charAnimSpeed') as HTMLInputElement;
    
    const previewCanvas = document.getElementById('charPreviewCanvas') as HTMLCanvasElement;
    const previewCtx = previewCanvas?.getContext('2d');

    const exportBtn = document.getElementById('exportCharBtn');
    const importBtn = document.getElementById('importCharBtn');
    const saveServerBtn = document.getElementById('saveServerBtn');
    const importInput = document.getElementById('importCharInput') as HTMLInputElement;

    const loadSpriteBtn = document.getElementById('loadSpriteBtn');
    const importSpriteInput = document.getElementById('importSpriteInput') as HTMLInputElement;
    const upscaleSpriteBtn = document.getElementById('upscaleSpriteBtn');

    const templateSelectEl = document.getElementById('charTemplateSelect') as HTMLSelectElement;
    const chromaKeyToggleEl = document.getElementById('charChromaKeyToggle') as HTMLInputElement;
    const chromaKeyToleranceRowEl = document.getElementById('charChromaKeyToleranceRow') as HTMLDivElement;
    const chromaKeyToleranceEl = document.getElementById('charChromaKeyTolerance') as HTMLInputElement;
    const chromaKeyToleranceValSpan = document.getElementById('charChromaKeyToleranceVal') as HTMLSpanElement;
    const charNameInputEl = document.getElementById('charNameInput') as HTMLInputElement;
    const charCategoryInputEl = document.getElementById('charCategoryInput') as HTMLInputElement;
    const sheetLayoutEl = document.getElementById('charSheetLayout') as HTMLSelectElement;
    const charServerSelectEl = document.getElementById('charServerSelect') as HTMLSelectElement;

    let serverCharactersList: any[] = [];

    async function reloadServerCharactersList() {
        if (!charServerSelectEl) return;
        try {
            const response = await fetch('/api/list-characters');
            if (!response.ok) throw new Error('Falha ao listar personagens');
            const result = await response.json();
            serverCharactersList = result.characters || [];

            charServerSelectEl.innerHTML = '<option value="">-- Selecionar Personagem --</option>';

            const categories: Record<string, any[]> = {};
            serverCharactersList.forEach(char => {
                const catName = char.category || 'Raiz / Sem Categoria';
                if (!categories[catName]) categories[catName] = [];
                categories[catName].push(char);
            });

            Object.keys(categories).sort().forEach(catName => {
                const group = document.createElement('optgroup');
                group.label = catName;
                categories[catName].forEach(char => {
                    const opt = document.createElement('option');
                    opt.value = char.relativePath;
                    opt.innerText = char.name;
                    group.appendChild(opt);
                });
                charServerSelectEl.appendChild(group);
            });
        } catch (err) {
            console.error('[Character Editor] Erro ao carregar lista de personagens do servidor:', err);
        }
    }

    if (!previewCanvas || !previewCtx) return;

    // Atualiza os inputs na tela com base nas configs do controller ativo
    function syncControllerToUI() {
        if (!frameWidthEl || !frameHeightEl) return;
        const config = activeCharacterController.config;
        frameWidthEl.value = config.frameWidth.toString();
        frameHeightEl.value = config.frameHeight.toString();
        
        if (upscaleSpriteBtn) {
            const isSmallFrame = config.frameWidth > 0 && config.frameWidth <= 48;
            upscaleSpriteBtn.style.display = (activeCharacterController.isLoaded && isSmallFrame) ? 'block' : 'none';
        }
        
        offsetXEl.value = (config.offsetX ?? 0).toString();
        offsetYEl.value = (config.offsetY ?? 0).toString();
        gapXEl.value = (config.gapX ?? 0).toString();
        gapYEl.value = (config.gapY ?? 0).toString();
        anchorXEl.value = (config.anchorX ?? 0).toString();
        anchorYEl.value = (config.anchorY ?? 0).toString();

        const state = animStateEl.value as CharacterState;
        const dir = animDirEl.value as Direction;
        const key = `${state}_${dir}`;
        const anim = config.animations[key];

        if (anim && animRowEl && animStartFrameEl && animFramesEl && animSpeedEl) {
            animRowEl.value = anim.row.toString();
            animStartFrameEl.value = (anim.startFrame ?? 0).toString();
            animFramesEl.value = anim.frames.toString();
            animSpeedEl.value = anim.speedFps.toString();
        }

        if (chromaKeyToggleEl && chromaKeyToleranceRowEl && chromaKeyToleranceEl && chromaKeyToleranceValSpan) {
            chromaKeyToggleEl.checked = !!config.chromaKey;
            chromaKeyToleranceRowEl.style.display = config.chromaKey ? 'flex' : 'none';
            const tolerance = config.chromaKeyTolerance ?? 50;
            chromaKeyToleranceEl.value = tolerance.toString();
            chromaKeyToleranceValSpan.innerText = tolerance.toString();
        }

        if (charNameInputEl) {
            charNameInputEl.value = config.name || '';
        }

        if (charCategoryInputEl) {
            charCategoryInputEl.value = config.category || '';
        }

        if (sheetLayoutEl) {
            sheetLayoutEl.value = config.sheetLayout || 'horizontal';
        }
    }

    // Atualiza a configuração do controller ativo com base nos campos da tela
    function syncUIToController() {
        const config = activeCharacterController.config;
        
        const fw = parseInt(frameWidthEl.value, 10);
        config.frameWidth = Number.isNaN(fw) || fw < 1 ? 64 : fw;
        
        const fh = parseInt(frameHeightEl.value, 10);
        config.frameHeight = Number.isNaN(fh) || fh < 1 ? 64 : fh;
        
        const ox = parseInt(offsetXEl.value, 10);
        config.offsetX = Number.isNaN(ox) ? 0 : ox;
        
        const oy = parseInt(offsetYEl.value, 10);
        config.offsetY = Number.isNaN(oy) ? 0 : oy;
        
        const gx = parseInt(gapXEl.value, 10);
        config.gapX = Number.isNaN(gx) ? 0 : gx;
        
        const gy = parseInt(gapYEl.value, 10);
        config.gapY = Number.isNaN(gy) ? 0 : gy;
        
        const ax = parseInt(anchorXEl.value, 10);
        config.anchorX = Number.isNaN(ax) ? 0 : ax;
        
        const ay = parseInt(anchorYEl.value, 10);
        config.anchorY = Number.isNaN(ay) ? 0 : ay;

        const state = animStateEl.value as CharacterState;
        const dir = animDirEl.value as Direction;
        const key = `${state}_${dir}`;

        if (!config.animations[key]) {
            config.animations[key] = { row: 0, startFrame: 0, frames: 1, speedFps: 1, loop: true };
        }

        const anim = config.animations[key];
        
        const valRow = parseInt(animRowEl.value, 10);
        anim.row = Number.isNaN(valRow) ? 0 : valRow;

        const valStart = parseInt(animStartFrameEl.value, 10);
        anim.startFrame = Number.isNaN(valStart) ? 0 : valStart;

        const valFrames = parseInt(animFramesEl.value, 10);
        anim.frames = Number.isNaN(valFrames) || valFrames < 1 ? 1 : valFrames;

        const valSpeed = parseInt(animSpeedEl.value, 10);
        anim.speedFps = Number.isNaN(valSpeed) || valSpeed < 1 ? 1 : valSpeed;

        activeCharacterController.setState(activeCharacterController.currentState);
        if (chromaKeyToggleEl) {
            config.chromaKey = chromaKeyToggleEl.checked;
        }
        if (chromaKeyToleranceEl) {
            const tolerance = parseInt(chromaKeyToleranceEl.value, 10);
            config.chromaKeyTolerance = Number.isNaN(tolerance) || tolerance < 0 ? 50 : tolerance;
        }
        if (charNameInputEl) {
            config.name = charNameInputEl.value;
        }
        if (charCategoryInputEl) {
            config.category = charCategoryInputEl.value;
        }
        if (sheetLayoutEl) {
            config.sheetLayout = sheetLayoutEl.value as 'horizontal' | 'vertical';
        }
        saveConfigToLocalStorage();
    }

    // Listener para o dropdown de templates automáticos
    templateSelectEl?.addEventListener('change', () => {
        const val = templateSelectEl.value;
        const config = activeCharacterController.config;

        // Reset de offsets globais para presets limpos
        config.offsetX = 0;
        config.offsetY = 0;
        config.gapX = 0;
        config.gapY = 0;
        config.anchorX = 0;
        config.anchorY = 0;

        if (val === '4x8_rpg') {
            config.frameWidth = 64;
            config.frameHeight = 64;
            config.animations = {
                'idle_down':  { row: 0, startFrame: 0, frames: 1, speedFps: 1, loop: true },
                'walk_down':  { row: 0, startFrame: 0, frames: 8, speedFps: 8, loop: true },
                'idle_up':    { row: 1, startFrame: 0, frames: 1, speedFps: 1, loop: true },
                'walk_up':    { row: 1, startFrame: 0, frames: 8, speedFps: 8, loop: true },
                'idle_right': { row: 2, startFrame: 0, frames: 1, speedFps: 1, loop: true },
                'walk_right': { row: 2, startFrame: 0, frames: 8, speedFps: 8, loop: true },
                'idle_left':  { row: 3, startFrame: 0, frames: 1, speedFps: 1, loop: true },
                'walk_left':  { row: 3, startFrame: 0, frames: 8, speedFps: 8, loop: true },
                'attack_down': { row: 0, startFrame: 0, frames: 8, speedFps: 12, loop: false },
                'attack_up':   { row: 1, startFrame: 0, frames: 8, speedFps: 12, loop: false },
                'attack_right':{ row: 2, startFrame: 0, frames: 8, speedFps: 12, loop: false },
                'attack_left': { row: 3, startFrame: 0, frames: 8, speedFps: 12, loop: false }
            };
        } else if (val === 'wizard_176x192') {
            config.frameWidth = 176;
            config.frameHeight = 192;
            config.animations = {
                'idle_down':  { row: 0, startFrame: 0, frames: 1, speedFps: 1, loop: true },
                'walk_down':  { row: 0, startFrame: 0, frames: 8, speedFps: 8, loop: true },
                'idle_up':    { row: 1, startFrame: 0, frames: 1, speedFps: 1, loop: true },
                'walk_up':    { row: 1, startFrame: 0, frames: 8, speedFps: 8, loop: true },
                'idle_right': { row: 2, startFrame: 0, frames: 1, speedFps: 1, loop: true },
                'walk_right': { row: 2, startFrame: 0, frames: 8, speedFps: 8, loop: true },
                'idle_left':  { row: 3, startFrame: 0, frames: 1, speedFps: 1, loop: true },
                'walk_left':  { row: 3, startFrame: 0, frames: 8, speedFps: 8, loop: true },
                'attack_down': { row: 0, startFrame: 0, frames: 8, speedFps: 12, loop: false },
                'attack_up':   { row: 1, startFrame: 0, frames: 8, speedFps: 12, loop: false },
                'attack_right':{ row: 2, startFrame: 0, frames: 8, speedFps: 12, loop: false },
                'attack_left': { row: 3, startFrame: 0, frames: 8, speedFps: 12, loop: false }
            };
        } else if (val === '4x4_standard') {
            config.frameWidth = 32;
            config.frameHeight = 32;
            config.animations = {
                'idle_down':  { row: 0, startFrame: 0, frames: 1, speedFps: 1, loop: true },
                'walk_down':  { row: 0, startFrame: 0, frames: 4, speedFps: 6, loop: true },
                'idle_left':  { row: 1, startFrame: 0, frames: 1, speedFps: 1, loop: true },
                'walk_left':  { row: 1, startFrame: 0, frames: 4, speedFps: 6, loop: true },
                'idle_right': { row: 2, startFrame: 0, frames: 1, speedFps: 1, loop: true },
                'walk_right': { row: 2, startFrame: 0, frames: 4, speedFps: 6, loop: true },
                'idle_up':    { row: 3, startFrame: 0, frames: 1, speedFps: 1, loop: true },
                'walk_up':    { row: 3, startFrame: 0, frames: 4, speedFps: 6, loop: true },
                'attack_down': { row: 0, startFrame: 0, frames: 4, speedFps: 10, loop: false },
                'attack_left': { row: 1, startFrame: 0, frames: 4, speedFps: 10, loop: false },
                'attack_right':{ row: 2, startFrame: 0, frames: 4, speedFps: 10, loop: false },
                'attack_up':   { row: 3, startFrame: 0, frames: 4, speedFps: 10, loop: false }
            };
        } else if (val === 'static_32') {
            config.frameWidth = 32;
            config.frameHeight = 32;
            config.animations = {
                'idle_down':  { row: 0, startFrame: 0, frames: 1, speedFps: 1, loop: true },
                'walk_down':  { row: 0, startFrame: 0, frames: 1, speedFps: 1, loop: true },
                'idle_up':    { row: 0, startFrame: 0, frames: 1, speedFps: 1, loop: true },
                'walk_up':    { row: 0, startFrame: 0, frames: 1, speedFps: 1, loop: true },
                'idle_right': { row: 0, startFrame: 0, frames: 1, speedFps: 1, loop: true },
                'walk_right': { row: 0, startFrame: 0, frames: 1, speedFps: 1, loop: true },
                'idle_left':  { row: 0, startFrame: 0, frames: 1, speedFps: 1, loop: true },
                'walk_left':  { row: 0, startFrame: 0, frames: 1, speedFps: 1, loop: true },
                'attack_down': { row: 0, startFrame: 0, frames: 1, speedFps: 1, loop: false },
                'attack_up':   { row: 0, startFrame: 0, frames: 1, speedFps: 1, loop: false },
                'attack_right':{ row: 0, startFrame: 0, frames: 1, speedFps: 1, loop: false },
                'attack_left': { row: 0, startFrame: 0, frames: 1, speedFps: 1, loop: false }
            };
        }

        syncControllerToUI();
        activeCharacterController.setState(activeCharacterController.currentState);
        saveConfigToLocalStorage();
    });

    // Bind de eventos de mudança de valor
    const inputs = [
        frameWidthEl, frameHeightEl, animRowEl, animStartFrameEl, animFramesEl, animSpeedEl,
        offsetXEl, offsetYEl, gapXEl, gapYEl, anchorXEl, anchorYEl
    ];
    inputs.forEach(el => {
        el?.addEventListener('input', () => {
            if (templateSelectEl) templateSelectEl.value = 'custom'; // Sai do template ao mudar manualmente
            syncUIToController();
        });
    });

    animStateEl?.addEventListener('change', () => {
        syncControllerToUI();
        activeCharacterController.setState(animStateEl.value as CharacterState);
    });

    animDirEl?.addEventListener('change', () => {
        syncControllerToUI();
        activeCharacterController.setDirection(animDirEl.value as Direction);
    });

    chromaKeyToggleEl?.addEventListener('change', () => {
        const enabled = chromaKeyToggleEl.checked;
        const tolerance = chromaKeyToleranceEl ? parseInt(chromaKeyToleranceEl.value) : 50;
        activeCharacterController.setChromaKey(enabled, tolerance);
        syncUIToController();
        syncControllerToUI();
    });

    chromaKeyToleranceEl?.addEventListener('input', () => {
        const enabled = chromaKeyToggleEl ? chromaKeyToggleEl.checked : false;
        const tolerance = parseInt(chromaKeyToleranceEl.value) || 50;
        if (chromaKeyToleranceValSpan) {
            chromaKeyToleranceValSpan.innerText = tolerance.toString();
        }
        activeCharacterController.setChromaKey(enabled, tolerance);
        syncUIToController();
    });

    charNameInputEl?.addEventListener('input', () => {
        syncUIToController();
    });

    charCategoryInputEl?.addEventListener('input', () => {
        syncUIToController();
    });

    sheetLayoutEl?.addEventListener('change', () => {
        syncUIToController();
        activeCharacterController.setState(activeCharacterController.currentState);
    });

    charServerSelectEl?.addEventListener('change', () => {
        const selectedPath = charServerSelectEl.value;
        if (!selectedPath) return;

        const charData = serverCharactersList.find(c => c.relativePath === selectedPath);
        if (charData && charData.config) {
            activeCharacterController.config = charData.config;
            activeCharacterController.currentState = 'idle';
            activeCharacterController.currentDirection = charData.config.defaultDirection || 'down';
            activeCharacterController.loadImage();

            const checkLoaded = () => {
                if (activeCharacterController.isLoaded) {
                    if (templateSelectEl) templateSelectEl.value = 'custom';
                    syncControllerToUI();
                    saveConfigToLocalStorage();
                    toast.success(`Personagem "${charData.name}" carregado com sucesso!`);
                } else {
                    setTimeout(checkLoaded, 50);
                }
            };
            checkLoaded();
        }
    });

    // Loop de renderização do Preview
    let previewFrameIndex = 0;
    let previewLastTime = 0;

    function drawPreviewLoop(nowMs: number) {
        requestAnimationFrame(drawPreviewLoop);

        if (!previewCtx) return;

        previewCtx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);

        if (!activeCharacterController.isLoaded || !activeCharacterController.image) {
            previewCtx.fillStyle = '#3f4452';
            previewCtx.font = '10px sans-serif';
            previewCtx.textAlign = 'center';
            previewCtx.textBaseline = 'middle';
            previewCtx.fillText('Sem Sprite', previewCanvas.width / 2, previewCanvas.height / 2);
            return;
        }

        const config = activeCharacterController.config;
        const state = animStateEl.value as CharacterState;
        const dir = animDirEl.value as Direction;
        const key = `${state}_${dir}`;
        const anim = config.animations[key];

        if (!anim) return;

        // Controle de frames simplificado para o canvas do editor
        const frameDurationMs = 1000 / anim.speedFps;
        if (previewLastTime === 0) previewLastTime = nowMs;
        const elapsed = nowMs - previewLastTime;

        if (elapsed >= frameDurationMs) {
            previewFrameIndex = (previewFrameIndex + 1) % anim.frames;
            previewLastTime = nowMs;
        }

        // Desenha a animação aplicando as regras matemáticas de Margens (Offsets) e Espaçamento (Gaps)
        const startFrame = anim.startFrame ?? 0;
        const currentFrame = startFrame + previewFrameIndex;
        const ox = config.offsetX ?? 0;
        const oy = config.offsetY ?? 0;
        const gx = config.gapX ?? 0;
        const gy = config.gapY ?? 0;

        const sx = config.sheetLayout === 'vertical'
            ? ox + anim.row * (config.frameWidth + gx)
            : ox + currentFrame * (config.frameWidth + gx);

        const sy = config.sheetLayout === 'vertical'
            ? oy + currentFrame * (config.frameHeight + gy)
            : oy + anim.row * (config.frameHeight + gy);

        previewCtx.drawImage(
            activeCharacterController.image,
            sx, sy, config.frameWidth, config.frameHeight,
            0, 0, previewCanvas.width, previewCanvas.height
        );

        // Desenha uma cruz sutil para guiar o centro do Pivot/Âncora (Ajuste Fino Visual)
        previewCtx.strokeStyle = 'rgba(255, 0, 0, 0.4)';
        previewCtx.lineWidth = 1;
        previewCtx.beginPath();
        // Linha vertical
        previewCtx.moveTo(previewCanvas.width / 2, 0);
        previewCtx.lineTo(previewCanvas.width / 2, previewCanvas.height);
        // Linha horizontal
        previewCtx.moveTo(0, previewCanvas.height / 2);
        previewCtx.lineTo(previewCanvas.width, previewCanvas.height / 2);
        previewCtx.stroke();
    }

    requestAnimationFrame(drawPreviewLoop);

    // Exportar Personagem
    exportBtn?.addEventListener('click', () => {
        const doc = serializeCharacterConfig(activeCharacterController.config);
        const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(doc);
        const a = document.createElement('a');
        a.setAttribute('href', dataStr);
        a.setAttribute('download', `${activeCharacterController.config.name.toLowerCase().replace(/ /g, '_')}.json`);
        document.body.appendChild(a);
        a.click();
        a.remove();
    });

    // Salvar no Servidor (Físico via API do plugin Vite)
    async function saveActiveCharacterToServer(showToastOnSuccess = true) {
        if (!activeCharacterController.isLoaded || !activeCharacterController.image) {
            toast.error('Nenhuma imagem de spritesheet carregada para salvar.');
            return;
        }

        try {
            const originalText = saveServerBtn ? saveServerBtn.innerText : '💾 Salvar no Servidor';
            if (saveServerBtn) {
                (saveServerBtn as HTMLButtonElement).disabled = true;
                saveServerBtn.innerText = '⌛ Gravando...';
            }

            const configCopy = JSON.parse(JSON.stringify(activeCharacterController.config));
            
            // Enviamos a imagem Base64 apenas se ela for de fato um base64
            const isBase64 = configCopy.spriteSheetUrl.startsWith('data:image/');
            const spriteBase64 = isBase64 ? configCopy.spriteSheetUrl : null;
            
            const payload = {
                name: configCopy.name,
                category: configCopy.category,
                spriteBase64: spriteBase64,
                configJson: configCopy
            };

            const response = await fetch('/api/save-character', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Erro no servidor de gravação.');
            }

            const result = await response.json();
            
            // Atualiza a URL da spritesheet em memória com o novo caminho físico do servidor!
            activeCharacterController.config.spriteSheetUrl = result.spriteSheetUrl;
            
            // Salva a nova configuração atualizada no localStorage local
            saveConfigToLocalStorage();
            
            if (showToastOnSuccess) {
                toast.success(`Personagem "${result.name}" salvo com sucesso no servidor!`);
            }
            
            if (saveServerBtn) {
                saveServerBtn.innerText = originalText;
                (saveServerBtn as HTMLButtonElement).disabled = false;
            }

            // Recarrega a lista do servidor em background
            await reloadServerCharactersList();
            if (charServerSelectEl) {
                charServerSelectEl.value = result.spriteSheetUrl.replace('tiles/characters/', '').replace('.png', '.json');
            }
        } catch (err: any) {
            console.error('[Character Editor] Erro ao salvar no servidor:', err);
            popup.alert(`Falha ao salvar no servidor: ${err.message}`, 'Erro ao Salvar');
            if (saveServerBtn) {
                saveServerBtn.innerText = '💾 Salvar no Servidor';
                (saveServerBtn as HTMLButtonElement).disabled = false;
            }
        }
    }

    saveServerBtn?.addEventListener('click', async () => {
        await saveActiveCharacterToServer(true);
    });

    // Importar Personagem (JSON)
    importBtn?.addEventListener('click', () => {
        importInput?.click();
    });

    importInput?.addEventListener('change', () => {
        const file = importInput.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            try {
                const config = parseCharacterConfig(reader.result as string);
                activeCharacterController.config = config;
                activeCharacterController.currentState = 'idle';
                activeCharacterController.currentDirection = config.defaultDirection;
                
                // Dispara o carregamento seguro com pré-processamento de Chroma Key ativo
                activeCharacterController.loadImage();
                
                const checkLoaded = () => {
                    if (activeCharacterController.isLoaded) {
                        if (templateSelectEl) templateSelectEl.value = 'custom';
                        syncControllerToUI();
                        saveConfigToLocalStorage();
                    } else {
                        setTimeout(checkLoaded, 50);
                    }
                };
                checkLoaded();
            } catch (err) {
                console.error('[Character Editor] Falha ao importar personagem:', err);
                toast.error('JSON de personagem inválido.');
            }
            importInput.value = '';
        };
        reader.readAsText(file);
    });

    // Carregar imagem da Spritesheet (PNG)
    loadSpriteBtn?.addEventListener('click', () => {
        importSpriteInput?.click();
    });

    importSpriteInput?.addEventListener('change', () => {
        const file = importSpriteInput.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            activeCharacterController.config.spriteSheetUrl = reader.result as string;
            
            // Dispara o carregamento com pré-processamento de Chroma Key ativo
            activeCharacterController.loadImage();
            
            const checkLoaded = () => {
                if (activeCharacterController.isLoaded) {
                    syncControllerToUI();
                    saveConfigToLocalStorage();
                } else {
                    setTimeout(checkLoaded, 50);
                }
            };
            checkLoaded();
        };
        reader.readAsDataURL(file);
    });

    // Super-amostragem (Upscale 3x de Pixel Art)
    upscaleSpriteBtn?.addEventListener('click', async () => {
        if (!activeCharacterController.isLoaded || !activeCharacterController.image) {
            toast.error('Nenhuma imagem de spritesheet carregada.');
            return;
        }

        try {
            const config = activeCharacterController.config;
            const scale = 3;
            toast.info('Aplicando Super-Amostragem (Upscale 3x)...');
            
            const upscaledDataUrl = await new Promise<string>((resolve, reject) => {
                const img = new Image();
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    canvas.width = img.width * scale;
                    canvas.height = img.height * scale;
                    const ctx = canvas.getContext('2d')!;
                    ctx.imageSmoothingEnabled = false; // Preserva pixels nítidos (Nearest Neighbor)
                    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                    resolve(canvas.toDataURL('image/png'));
                };
                img.onerror = () => reject(new Error('Erro ao processar imagem para upscale.'));
                img.src = activeCharacterController.image!.src;
            });

            // 1. Atualiza a URL com a imagem ampliada
            config.spriteSheetUrl = upscaledDataUrl;
            
            // 2. Escala proporcionalmente todas as medidas de pixels por 3x
            config.frameWidth *= scale;
            config.frameHeight *= scale;
            if (config.offsetX !== undefined) config.offsetX *= scale;
            if (config.offsetY !== undefined) config.offsetY *= scale;
            if (config.gapX !== undefined) config.gapX *= scale;
            if (config.gapY !== undefined) config.gapY *= scale;
            if (config.anchorX !== undefined) config.anchorX *= scale;
            if (config.anchorY !== undefined) config.anchorY *= scale;

            // 3. Recarrega a imagem no controller
            activeCharacterController.loadImage();
            
            const checkLoaded = async () => {
                if (activeCharacterController.isLoaded) {
                    syncControllerToUI();
                    saveConfigToLocalStorage();
                    
                    toast.success('Super-amostragem 3x aplicada! Gravando no servidor...');
                    await saveActiveCharacterToServer(true);
                } else {
                    setTimeout(checkLoaded, 50);
                }
            };
            checkLoaded();
        } catch (err: any) {
            console.error('[Upscale] Erro:', err);
            toast.error(`Falha ao aplicar super-amostragem: ${err.message}`);
        }
    });

    // Abrir Calibrador de Grade Visual
    const openCalibratorBtn = document.getElementById('openCalibratorBtn');
    openCalibratorBtn?.addEventListener('click', () => {
        if (!activeCharacterController.isLoaded || !activeCharacterController.image) {
            toast.info('Carregue uma imagem PNG da spritesheet primeiro.');
            return;
        }

        const config = activeCharacterController.config;
        openCharacterCalibrator(
            activeCharacterController.image,
            config,
            activeCharacterController.currentState,
            activeCharacterController.currentDirection,
            async (result) => {
                config.frameWidth = result.frameWidth;
                config.frameHeight = result.frameHeight;
                config.offsetX = result.offsetX;
                config.offsetY = result.offsetY;
                config.gapX = result.gapX;
                config.gapY = result.gapY;
                config.anchorX = result.anchorX;
                config.anchorY = result.anchorY;
                config.animations = result.animations;
                config.sheetLayout = result.sheetLayout as any;

                if (templateSelectEl) {
                    templateSelectEl.value = 'custom';
                }

                activeCharacterController.setState(result.currentState as any);
                activeCharacterController.setDirection(result.currentDirection as any);
                
                if (animStateEl) animStateEl.value = result.currentState;
                if (animDirEl) animDirEl.value = result.currentDirection;

                syncControllerToUI();
                syncUIToController();
                
                // Melhoria inteligente: Salva as posições calibradas automaticamente no servidor!
                toast.info('Calibração concluída! Gravando no servidor...');
                await saveActiveCharacterToServer(true);
            }
        );
    });

    // Inicializa a UI
    syncControllerToUI();
    reloadServerCharactersList();
}
