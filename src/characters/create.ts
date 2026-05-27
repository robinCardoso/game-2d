import '../shared/shell.css';
import { requireAuth } from '../shared/authGuard';
import { createCharacter, validateCharacterName } from '../shared/characterStore';
import { track } from '../shared/analytics';

const session = await requireAuth();
const errEl = document.getElementById('createError') as HTMLElement;
const stepLabel = document.getElementById('wizardStep') as HTMLElement;

let charName = '';
let presetId = 'knight';

function showStep(n: number): void {
    (document.getElementById('step1') as HTMLElement).hidden = n !== 1;
    (document.getElementById('step2') as HTMLElement).hidden = n !== 2;
    (document.getElementById('step3') as HTMLElement).hidden = n !== 3;
    stepLabel.textContent = `Passo ${n} de 3 — ${n === 1 ? 'Nome' : n === 2 ? 'Aparência' : 'Confirmar'}`;
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
    (document.getElementById('summaryName') as HTMLElement).textContent = charName;
    showStep(3);
});

document.getElementById('confirmCreate')?.addEventListener('click', async () => {
    errEl.hidden = true;
    try {
        await createCharacter(session.userId, charName, presetId, 'rookgaard');
        track('character_created', { preset: presetId });
        location.href = '/characters.html';
    } catch (err) {
        errEl.textContent = err instanceof Error ? err.message : 'Erro ao criar personagem.';
        errEl.hidden = false;
    }
});

showStep(1);
