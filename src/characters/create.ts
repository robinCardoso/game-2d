import '../shared/shell.css';
import { requireAuth } from '../shared/authGuard';
import { createCharacter, validateCharacterName } from '../shared/characterStore';
import { track } from '../shared/analytics';
import type { Gender, VocationId } from '../../shared/types/character';
import { OUTFIT_PRESETS } from '../game-data/default/outfits';

const session = await requireAuth();
const errEl = document.getElementById('createError') as HTMLElement;
const stepLabel = document.getElementById('wizardStep') as HTMLElement;
const presetSelect = document.getElementById('preset') as HTMLSelectElement;
const genderSelect = document.getElementById('gender') as HTMLSelectElement;
const presetPreview = document.getElementById('presetPreview') as HTMLImageElement;

function updatePreview(): void {
    if (presetPreview && presetSelect && genderSelect) {
        const vocation = presetSelect.value as VocationId;
        const gender = genderSelect.value as Gender;
        const preset = OUTFIT_PRESETS[vocation];
        if (preset) {
            presetPreview.src = `/${preset.sprites[gender]?.spriteSheetUrl || ''}`;
        }
    }
}

presetSelect?.addEventListener('change', updatePreview);
genderSelect?.addEventListener('change', updatePreview);

let charName = '';
let presetId = 'knight';
let selectedGender: Gender = 'male';

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
    presetId = (document.getElementById('preset') as HTMLSelectElement).value;
    selectedGender = (document.getElementById('gender') as HTMLSelectElement).value as Gender;
    (document.getElementById('summaryName') as HTMLElement).textContent = `${charName} (${presetId.toUpperCase()}, ${selectedGender.toUpperCase()})`;
    showStep(3);
});

document.getElementById('confirmCreate')?.addEventListener('click', async () => {
    errEl.hidden = true;
    try {
        await createCharacter(session.userId, charName, presetId, undefined, selectedGender);
        track('character_created', { preset: presetId, gender: selectedGender });
        location.href = '/characters.html';
    } catch (err) {
        errEl.textContent = err instanceof Error ? err.message : 'Erro ao criar personagem.';
        errEl.hidden = false;
    }
});

showStep(1);
