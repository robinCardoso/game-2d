
export interface MapEditorController {
    selectedTileType: number;
    currentTool: 'pencil' | 'bucket' | 'eraser' | 'eyedropper' | 'rectangle' | 'line';
    currentCategory: string;
    tileSearchQuery: string;
    setTool(tool: string): void;
    initEditorUI(): void;
    setSelectedTileType(id: number): void;
}

export function initMapEditor(options: {
    tileTypes: any;
    onSelectedTileChanged: (id: number) => void;
    onToolChanged: (tool: any) => void;
    getEditingFloor: () => number;
    setEditingFloor: (z: number) => void;
    saveHistoryState: () => void;
    getWorldMap: () => any;
    getMapSize: () => number;
    isAutoBorderEnabled?: () => boolean;
    isTilePaletteDisabled?: (tile: { tileRole?: string }) => boolean;
}): MapEditorController {
    let selectedTileType = 0;
    let currentTool: 'pencil' | 'bucket' | 'eraser' | 'eyedropper' | 'rectangle' | 'line' = 'pencil';
    let currentCategory = 'all';
    let tileSearchQuery = '';

    const selector = document.getElementById('tileSelector')!;
    const searchInput = document.getElementById('tileSearchInput') as HTMLInputElement | null;

    // --- RENDERIZADOR DA PALETA DE TILES ---
    function initEditorUI() {
        if (!selector) return;
        selector.innerHTML = '';

        Object.values(options.tileTypes).forEach((tile: any) => {
            if (tile.id === -1) return;

            if (options.isTilePaletteDisabled?.(tile)) return;
            
            const paletteCat = tile.paletteCategory ?? tile.category;

            // Filtro por Categoria (abas Pisos / Natureza / Paredes / Itens)
            if (currentCategory !== 'all' && paletteCat !== currentCategory) return;

            // Filtro por Busca de Texto
            if (tileSearchQuery.trim() !== '') {
                const query = tileSearchQuery.toLowerCase();
                const tileName = (tile.name || '').toLowerCase();
                const tileCat = (tile.category || '').toLowerCase();
                const tilePaletteCat = String(paletteCat || '').toLowerCase();
                if (
                    !tileName.includes(query) &&
                    !tileCat.includes(query) &&
                    !tilePaletteCat.includes(query)
                ) {
                    return;
                }
            }

            const div = document.createElement('div');
            div.className = `tile-option ${selectedTileType === tile.id ? 'active' : ''}`;

            const previewStyles = `background-image: url('${tile.image?.src}'); background-size: cover; background-position: center; image-rendering: pixelated;`;
            const borderBadge =
                tile.tileRole === 'border'
                    ? '<span style="font-size:8px;background:#1e3a5f;color:#93c5fd;padding:1px 4px;border-radius:3px;margin-left:4px;">Borda</span>'
                    : '';

            div.innerHTML = `
                <div class="tile-preview" style="${previewStyles}"></div>
                <span style="text-transform: capitalize;">${tile.name}${borderBadge}</span>
            `;
            if (options.isAutoBorderEnabled?.() && tile.tileRole === 'border') {
                div.style.opacity = '0.45';
                div.style.pointerEvents = 'none';
            }
            div.onclick = () => {
                document.querySelectorAll('.tile-option').forEach(el => el.classList.remove('active'));
                div.classList.add('active');
                selectedTileType = tile.id;
                options.onSelectedTileChanged(tile.id);
                if (currentTool === 'eraser' || currentTool === 'eyedropper') {
                    setTool('pencil');
                }
            };
            selector.appendChild(div);
        });
    }

    // --- FERRAMENTAS ---
    function setTool(tool: any) {
        currentTool = tool;
        options.onToolChanged(tool);
        document.querySelectorAll('.tool-btn').forEach(btn => {
            btn.classList.toggle('active', (btn as HTMLElement).dataset.tool === tool);
        });
    }

    // Vincular botões de ferramentas
    document.querySelectorAll('.tool-btn').forEach(btn => {
        (btn as HTMLElement).onclick = () => setTool((btn as HTMLElement).dataset.tool);
    });

    // Vincular botões de categorias
    document.querySelectorAll('.cat-btn').forEach(btn => {
        (btn as HTMLElement).onclick = () => {
            document.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentCategory = (btn as HTMLElement).dataset.cat!;
            initEditorUI();
        };
    });

    // --- ESCUTADOR DE BUSCA (INPUT) ---
    searchInput?.addEventListener('input', () => {
        tileSearchQuery = searchInput.value;
        initEditorUI();
    });

    // Inicialização da interface na carga
    initEditorUI();

    return {
        get selectedTileType() { return selectedTileType; },
        setSelectedTileType(id: number) {
            selectedTileType = id;
            initEditorUI();
        },
        get currentTool() { return currentTool; },
        setTool,
        get currentCategory() { return currentCategory; },
        get tileSearchQuery() { return tileSearchQuery; },
        initEditorUI
    };
}

export function floodFill(worldMap: any, z: number, x: number, y: number, targetId: number, replacementId: number, mapSize: number) {
    if (targetId === replacementId) return;
    if (worldMap[z][y][x] !== targetId) return;
    
    const stack = [[x, y]];
    while (stack.length > 0) {
        const [cx, cy] = stack.pop()!;
        if (worldMap[z][cy][cx] === targetId) {
            worldMap[z][cy][cx] = replacementId;
            if (cx > 0) stack.push([cx - 1, cy]);
            if (cx < mapSize - 1) stack.push([cx + 1, cy]);
            if (cy > 0) stack.push([cx, cy - 1]);
            if (cy < mapSize - 1) stack.push([cx, cy + 1]);
        }
    }
}
