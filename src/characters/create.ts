import '../shared/shell.css';
import { requireAuth } from '../shared/authGuard';
import { createCharacter, validateCharacterName } from '../shared/characterStore';
import { track } from '../shared/analytics';
import type { Gender, VocationId } from '../../shared/types/character';
import { loadOutfitPresets, filterOutfitsByVocationAndGender, findOutfitPreset, type OutfitPreset } from '../game-data/default/loadOutfitPresets';

const session = await requireAuth();
const errEl = document.getElementById('createError') as HTMLElement;
const stepLabel = document.getElementById('wizardStep') as HTMLElement;
const presetSelect = document.getElementById('preset') as HTMLSelectElement;
const genderSelect = document.getElementById('gender') as HTMLSelectElement;
const outfitSelect = document.getElementById('outfit') as HTMLSelectElement;
const presetPreview = document.getElementById('presetPreview') as HTMLImageElement;

let outfitPresets: OutfitPreset[] = [];

async function init() {
    try {
        outfitPresets = await loadOutfitPresets();
    } catch (e) {
        console.error('Falha ao carregar outfit presets:', e);
    }
    
    presetSelect?.addEventListener('change', renderOutfitOptions);
    genderSelect?.addEventListener('change', renderOutfitOptions);
    outfitSelect?.addEventListener('change', updatePreview);

    renderOutfitOptions();
}

function renderOutfitOptions() {
    if (!outfitSelect || !presetSelect || !genderSelect) return;

    const vocation = presetSelect.value as VocationId;
    const gender = genderSelect.value as Gender;

    const availableOutfits = filterOutfitsByVocationAndGender(outfitPresets, vocation, gender)
        .filter(outfit => outfit.showInCreation !== false);

    outfitSelect.innerHTML = '';

    for (const outfit of availableOutfits) {
        const option = document.createElement('option');
        option.value = outfit.id;
        option.textContent = outfit.name;
        outfitSelect.appendChild(option);
    }

    // Se não houver outfits dinâmicos cadastrados, adiciona um default fictício
    if (availableOutfits.length === 0) {
        const option = document.createElement('option');
        option.value = `default_${vocation}_${gender}`;
        option.textContent = `Padrão (${vocation})`;
        outfitSelect.appendChild(option);
    }

    updatePreview();
}

function updatePreview(): void {
    if (presetPreview && outfitSelect && presetSelect && genderSelect) {
        const outfitId = outfitSelect.value;
        const outfit = findOutfitPreset(outfitPresets, outfitId);

        if (outfit) {
            presetPreview.src = `/${outfit.spriteSheetUrl || ''}`;
        } else {
            const vocation = presetSelect.value as VocationId;
            const gender = genderSelect.value as Gender;
            presetPreview.src = `/tiles/characters/vocations/${gender}/${vocation}.png`;
        }
    }
}

let charName = '';
let selectedVocation: VocationId = 'knight';
let selectedGender: Gender = 'male';
let selectedOutfitId = '';
let selectedSpriteSheetUrl = '';

function showStep(n: number): void {
    (document.getElementById('step1') as HTMLElement).hidden = n !== 1;
    (document.getElementById('step2') as HTMLElement).hidden = n !== 2;
    (document.getElementById('step3') as HTMLElement).hidden = n !== 3;
    stepLabel.textContent = `Passo ${n} de 3 — ${n === 1 ? 'Nome' : n === 2 ? 'Classe e Gênero' : 'Confirmar'}`;
}

document.getElementById('next1')?.addEventListener('click', () => {
    errEl.hidden = true;
    const name = (document.getElementById('charName') as HTMLInputElement).value;
    const err = validateCharacterName(name);
    if (err) {
        errEl.textContent = err;
        errEl.hidden = false;
        return;
    }
    charName = name.trim();
    showStep(2);
});

document.getElementById('next2')?.addEventListener('click', () => {
    selectedVocation = presetSelect.value as VocationId;
    selectedGender = genderSelect.value as Gender;
    selectedOutfitId = outfitSelect.value;

    const outfit = findOutfitPreset(outfitPresets, selectedOutfitId);
    if (outfit) {
        selectedSpriteSheetUrl = outfit.spriteSheetUrl;
    } else {
        selectedSpriteSheetUrl = `tiles/characters/vocations/${selectedGender}/${selectedVocation}.png`;
    }

    const outfitLabel = outfit ? outfit.name : selectedOutfitId;
    (document.getElementById('summaryName') as HTMLElement).textContent = `${charName} (${selectedVocation.toUpperCase()}, ${selectedGender.toUpperCase()}, Visual: ${outfitLabel})`;
    showStep(3);
});

document.getElementById('confirmCreate')?.addEventListener('click', async () => {
    errEl.hidden = true;
    try {
        await createCharacter(
            session.userId,
            charName,
            selectedVocation,
            selectedGender,
            selectedOutfitId,
            selectedSpriteSheetUrl
        );
        track('character_created', { preset: selectedOutfitId, gender: selectedGender });
        location.href = '/characters.html';
    } catch (err) {
        errEl.textContent = err instanceof Error ? err.message : 'Erro ao criar personagem.';
        errEl.hidden = false;
    }
});

// Inicializa o fluxo
void init();
showStep(1);
