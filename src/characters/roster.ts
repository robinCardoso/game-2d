import '../shared/shell.css';
import { requireAuth, signOut, getProfile } from '../shared/authGuard';
import {
    listCharacters,
    softDeleteCharacter,
    markCharacterPlayed,
} from '../shared/characterStore';
import type { CharacterRow } from '../shared/types';
import { track } from '../shared/analytics';

const session = await requireAuth();
const errEl = document.getElementById('rosterError') as HTMLElement;
const grid = document.getElementById('charGrid') as HTMLElement;
const empty = document.getElementById('emptyState') as HTMLElement;
const enterBtn = document.getElementById('enterWorldBtn') as HTMLButtonElement;
const deleteBtn = document.getElementById('deleteCharBtn') as HTMLButtonElement;
const emailEl = document.getElementById('accountEmail') as HTMLElement;
const studioLink = document.getElementById('studioLink') as HTMLAnchorElement;

emailEl.textContent = session.email;

const profile = await getProfile();
if (!profile?.canAccessStudio) {
    studioLink.style.display = 'none';
}

let characters: CharacterRow[] = [];
let selectedId: string | null = null;

async function loadRoster(): Promise<void> {
    try {
        characters = await listCharacters(session.userId);
        renderGrid();
    } catch (err) {
        errEl.textContent = err instanceof Error ? err.message : 'Erro ao carregar personagens.';
        errEl.hidden = false;
    }
}

function renderGrid(): void {
    grid.innerHTML = '';
    empty.hidden = characters.length > 0;
    for (const c of characters) {
        const card = document.createElement('div');
        card.className = 'char-card' + (c.id === selectedId ? ' selected' : '');
        card.dataset.id = c.id;
        card.innerHTML = `
          <img src="${c.outfitConfig.spriteSheetUrl || '/tiles/characters/knight.png'}" alt="" />
          <h3>${escapeHtml(c.name)}</h3>
          <p>${c.lastPlayedAt ? 'Último login: ' + new Date(c.lastPlayedAt).toLocaleDateString('pt-BR') : 'Nunca jogou'}</p>
        `;
        card.addEventListener('click', () => {
            selectedId = c.id;
            renderGrid();
            enterBtn.disabled = false;
            deleteBtn.disabled = false;
        });
        grid.appendChild(card);
    }
    if (!selectedId && characters.length === 1) {
        selectedId = characters[0].id;
        renderGrid();
        enterBtn.disabled = false;
        deleteBtn.disabled = false;
    }
}

function escapeHtml(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

enterBtn.addEventListener('click', async () => {
    if (!selectedId) return;
    try {
        await markCharacterPlayed(selectedId, session.userId);
        sessionStorage.setItem('activeCharacterId', selectedId);
        track('first_world_enter', { characterId: selectedId });
        location.href = `/play.html?characterId=${encodeURIComponent(selectedId)}`;
    } catch (err) {
        errEl.textContent = err instanceof Error ? err.message : 'Erro ao entrar.';
        errEl.hidden = false;
    }
});

deleteBtn.addEventListener('click', async () => {
    console.log('[roster.ts] Excluir clicked. selectedId:', selectedId, 'session.userId:', session?.userId);
    if (!selectedId) return;
    console.log('[roster.ts] Showing confirm dialog...');
    const confirmed = confirm('Excluir este personagem? Esta ação não pode ser desfeita.');
    console.log('[roster.ts] Confirm dialog result:', confirmed);
    if (!confirmed) return;
    try {
        console.log('[roster.ts] Calling softDeleteCharacter...');
        await softDeleteCharacter(selectedId, session.userId);
        console.log('[roster.ts] softDeleteCharacter completed. Reloading roster...');
        selectedId = null;
        enterBtn.disabled = true;
        deleteBtn.disabled = true;
        await loadRoster();
        console.log('[roster.ts] Roster reloaded.');
    } catch (err) {
        console.error('[roster.ts] Error deleting character:', err);
        errEl.textContent = err instanceof Error ? err.message : 'Erro ao excluir.';
        errEl.hidden = false;
    }
});

document.getElementById('logoutBtn')?.addEventListener('click', async () => {
    await signOut();
    location.href = '/login.html';
});

void loadRoster();
