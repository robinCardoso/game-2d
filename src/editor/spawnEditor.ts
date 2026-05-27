import { CreatureSpawn } from '../engine/types';
import { toast } from '../utils/popup';

export interface SpawnPreset {
    name: string;
    type: 'monster' | 'npc';
    outfitPresetName: string; // 'knight', 'sorcerer', etc.
    description: string;
    color: string; // Cor usada no holograma de spawn/editor
}

export const SPAWN_PRESETS: SpawnPreset[] = [
    { name: 'Wolf', type: 'monster', outfitPresetName: 'wolf', description: 'Criatura rápida da floresta.', color: '#fb7185' },
    { name: 'Demon', type: 'monster', outfitPresetName: 'demon', description: 'Monstro lendário e perigoso.', color: '#ef4444' },
    { name: 'Orc Warrior', type: 'monster', outfitPresetName: 'orc', description: 'Guerreiro orc agressivo.', color: '#f59e0b' },
    { name: 'Trainer Knight', type: 'npc', outfitPresetName: 'knight', description: 'Treinador de combate (Passivo).', color: '#10b981' },
    { name: 'Guard Knight', type: 'npc', outfitPresetName: 'guard', description: 'Guarda da cidade.', color: '#3b82f6' },
    { name: 'Shopkeeper', type: 'npc', outfitPresetName: 'shopkeeper', description: 'Vendedor de itens.', color: '#a855f7' }
];

export interface SpawnEditorOptions {
    spawns: CreatureSpawn[];
    onSpawnsChanged: () => void;
}

export function initSpawnEditor(options: SpawnEditorOptions) {
    const { spawns, onSpawnsChanged } = options;

    let selectedPreset: SpawnPreset | null = SPAWN_PRESETS[0];
    let currentFilter: 'all' | 'monster' | 'npc' = 'all';

    const container = document.getElementById('spawnSelector')!;
    const filterAll = document.getElementById('spawnFilterAll')!;
    const filterMonster = document.getElementById('spawnFilterMonster')!;
    const filterNpc = document.getElementById('spawnFilterNpc')!;

    function renderPresetPalette() {
        if (!container) return;
        container.innerHTML = '';

        SPAWN_PRESETS.forEach((preset) => {
            if (currentFilter !== 'all' && preset.type !== currentFilter) return;

            const div = document.createElement('div');
            div.className = `tile-option ${selectedPreset?.name === preset.name ? 'active' : ''}`;
            div.style.padding = '8px';
            div.style.display = 'flex';
            div.style.flexDirection = 'column';
            div.style.alignItems = 'center';
            div.style.justifyContent = 'center';
            div.style.border = '1px solid #2d3139';
            div.style.borderRadius = '6px';
            div.style.cursor = 'pointer';
            div.style.textAlign = 'center';
            div.style.background = '#111318';

            const indicator = document.createElement('div');
            indicator.style.width = '24px';
            indicator.style.height = '24px';
            indicator.style.borderRadius = '50%';
            indicator.style.background = preset.color;
            indicator.style.marginBottom = '6px';
            indicator.style.boxShadow = `0 0 8px ${preset.color}aa`;
            indicator.style.display = 'flex';
            indicator.style.alignItems = 'center';
            indicator.style.justifyContent = 'center';
            indicator.style.color = '#fff';
            indicator.style.fontSize = '12px';
            indicator.innerText = preset.type === 'monster' ? '👾' : '👤';

            const nameEl = document.createElement('span');
            nameEl.style.fontSize = '10px';
            nameEl.style.fontWeight = 'bold';
            nameEl.style.display = 'block';
            nameEl.innerText = preset.name;

            const descEl = document.createElement('span');
            descEl.style.fontSize = '8px';
            descEl.style.color = '#8b949e';
            descEl.style.marginTop = '2px';
            descEl.innerText = preset.description;

            div.appendChild(indicator);
            div.appendChild(nameEl);
            div.appendChild(descEl);

            div.addEventListener('click', () => {
                container.querySelectorAll('.tile-option').forEach(el => el.classList.remove('active'));
                div.classList.add('active');
                selectedPreset = preset;
            });

            container.appendChild(div);
        });
    }

    function setFilter(filter: 'all' | 'monster' | 'npc', activeBtn: HTMLElement) {
        currentFilter = filter;
        [filterAll, filterMonster, filterNpc].forEach(btn => btn?.classList.remove('active'));
        activeBtn.classList.add('active');
        renderPresetPalette();
    }

    filterAll?.addEventListener('click', () => setFilter('all', filterAll as HTMLElement));
    filterMonster?.addEventListener('click', () => setFilter('monster', filterMonster as HTMLElement));
    filterNpc?.addEventListener('click', () => setFilter('npc', filterNpc as HTMLElement));

    renderPresetPalette();

    return {
        getSelectedPreset() {
            return selectedPreset;
        },
        addSpawnAt(x: number, y: number, z: number) {
            if (!selectedPreset) return;

            // Remove spawn existente na mesma coordenada para evitar duplicados
            this.removeSpawnAt(x, y, z, false);

            const newSpawn: CreatureSpawn = {
                id: `spawn_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
                name: selectedPreset.name,
                x,
                y,
                z,
                type: selectedPreset.type
            };

            spawns.push(newSpawn);
            onSpawnsChanged();
            toast.success(`Spawn de "${selectedPreset.name}" adicionado em ${x}, ${y}, ${z}.`);
        },
        removeSpawnAt(x: number, y: number, z: number, showToast = true) {
            const index = spawns.findIndex(s => s.x === x && s.y === y && s.z === z);
            if (index !== -1) {
                const name = spawns[index].name;
                spawns.splice(index, 1);
                onSpawnsChanged();
                if (showToast) {
                    toast.success(`Spawn de "${name}" removido em ${x}, ${y}, ${z}.`);
                }
                return true;
            }
            return false;
        }
    };
}
