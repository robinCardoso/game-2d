import { requireAuth, signOut } from '../shared/authGuard';
import { getCharacter } from '../shared/characterStore';
import { track } from '../shared/analytics';
import { startPlay } from './playApp';

const params = new URLSearchParams(location.search);
const characterId = params.get('characterId');

if (!characterId) {
    location.href = '/characters.html';
} else {
    try {
        const session = await requireAuth();
        const character = await getCharacter(characterId, session.userId);
        if (!character) {
            location.href = '/characters.html';
        } else {
            track('first_world_enter', { characterId });
            await startPlay(character, session.userId);
        }
    } catch {
        /* redirect em requireAuth */
    }
}

document.getElementById('logoutPlay')?.addEventListener('click', async (e) => {
    e.preventDefault();
    await signOut();
    location.href = '/login.html';
});
