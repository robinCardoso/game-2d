import type { AuthSession, CharacterRow, UserProfile } from './types';
import type { Gender, VocationId } from '../../shared/types/character';
import { createDefaultCharacterConfig } from '../character/characterSerializer';
import { MAX_CHARACTERS_PER_ACCOUNT } from './types';
import { OUTFIT_PRESETS } from '../game-data/default/outfits';

const SESSION_KEY = 'game2d_mock_session';
const PROFILE_KEY = 'game2d_mock_profile';
const CHARS_KEY = 'game2d_mock_characters';

function uid(): string {
    return `mock_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

export function isMockAuthEnabled(): boolean {
    if (import.meta.env.VITE_AUTH_MOCK === 'false') return false;
    if (import.meta.env.VITE_AUTH_MOCK === 'true') return true;
    return !import.meta.env.VITE_SUPABASE_URL;
}

function readChars(): CharacterRow[] {
    try {
        const raw = localStorage.getItem(CHARS_KEY);
        const parsed = raw ? (JSON.parse(raw) as CharacterRow[]) : [];
        return parsed.map(c => {
            const vocation = c.vocation ?? (c.outfitConfig as any).vocation ?? 'knight';
            const gender = c.gender ?? (c.outfitConfig as any).gender ?? 'male';
            return {
                ...c,
                vocation,
                level: c.level ?? (c.outfitConfig as any).level ?? 1,
                experience: c.experience ?? (c.outfitConfig as any).experience ?? 0,
                gender,
                appearance: c.appearance ?? (c.outfitConfig as any).appearance ?? {
                    gender: gender as 'male' | 'female',
                    vocation: vocation as 'knight' | 'mage' | 'archer',
                    outfitId: `default_${vocation}_${gender}`,
                },
            };
        });
    } catch {
        return [];
    }
}

function writeChars(chars: CharacterRow[]): void {
    localStorage.setItem(CHARS_KEY, JSON.stringify(chars));
}

export function mockGetSession(): AuthSession | null {
    try {
        const raw = localStorage.getItem(SESSION_KEY);
        return raw ? (JSON.parse(raw) as AuthSession) : null;
    } catch {
        return null;
    }
}

export function mockGetProfile(): UserProfile | null {
    const session = mockGetSession();
    if (!session) return null;
    try {
        const raw = localStorage.getItem(PROFILE_KEY);
        if (raw) return JSON.parse(raw) as UserProfile;
    } catch {
        /* ignore */
    }
    const studio =
        import.meta.env.VITE_MOCK_STUDIO === 'true' ||
        session.email.endsWith('@gm.dev');
    return {
        id: session.userId,
        displayName: session.email.split('@')[0],
        role: studio ? 'gm' : 'player',
        canAccessStudio: studio,
    };
}

export function mockSignUp(email: string, _password: string): AuthSession {
    const session: AuthSession = { userId: uid(), email: email.trim().toLowerCase() };
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    const studio = email.endsWith('@gm.dev') || import.meta.env.VITE_MOCK_STUDIO === 'true';
    const profile: UserProfile = {
        id: session.userId,
        displayName: email.split('@')[0],
        role: studio ? 'gm' : 'player',
        canAccessStudio: studio,
    };
    localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
    return session;
}

export function mockSignIn(email: string, _password: string): AuthSession {
    const existing = mockGetSession();
    if (existing && existing.email === email.trim().toLowerCase()) {
        return existing;
    }
    return mockSignUp(email, _password);
}

export function mockSignOut(): void {
    localStorage.removeItem(SESSION_KEY);
}

export function mockListCharacters(accountId: string): CharacterRow[] {
    return readChars().filter((c) => c.accountId === accountId && !c.deletedAt);
}

export function mockGetCharacter(id: string, accountId: string): CharacterRow | null {
    return mockListCharacters(accountId).find((c) => c.id === id) ?? null;
}

export function mockCreateCharacter(
    accountId: string,
    name: string,
    presetId: string,
    spawnMapId: string,
    gender: Gender = 'male'
): CharacterRow {
    const chars = readChars();
    const active = chars.filter((c) => c.accountId === accountId && !c.deletedAt);
    if (active.length >= MAX_CHARACTERS_PER_ACCOUNT) {
        throw new Error(`Limite de ${MAX_CHARACTERS_PER_ACCOUNT} personagens por conta.`);
    }
    const preset = OUTFIT_PRESETS[presetId as VocationId] || OUTFIT_PRESETS.knight;
    const spriteConfig = preset.sprites[gender];
    const base = createDefaultCharacterConfig();
    base.name = spriteConfig.name || name;
    base.spriteSheetUrl = spriteConfig.spriteSheetUrl || `tiles/characters/vocations/${gender}/${presetId}.png`;

    const appearance = {
        gender: gender as 'male' | 'female',
        vocation: presetId as 'knight' | 'mage' | 'archer',
        outfitId: `default_${presetId}_${gender}`,
    };

    const row: CharacterRow = {
        id: uid(),
        accountId,
        name,
        outfitConfig: {
            ...base,
            vocation: presetId,
            level: 1,
            experience: 0,
            gender,
            appearance,
        } as any,
        spawnMapId,
        createdAt: new Date().toISOString(),
        lastPlayedAt: null,
        vocation: presetId,
        level: 1,
        experience: 0,
        gender,
        appearance,
    };
    chars.push(row);
    writeChars(chars);
    return row;
}

export function mockSoftDeleteCharacter(id: string, accountId: string): void {
    const chars = readChars();
    const c = chars.find((x) => x.id === id && x.accountId === accountId);
    if (c) {
        c.deletedAt = new Date().toISOString();
        writeChars(chars);
    }
}

export function mockUpdateLastPlayed(id: string, accountId: string): void {
    const chars = readChars();
    const c = chars.find((x) => x.id === id && x.accountId === accountId);
    if (c) {
        c.lastPlayedAt = new Date().toISOString();
        writeChars(chars);
    }
}

export function mockIsNameTaken(name: string): boolean {
    const lower = name.trim().toLowerCase();
    return readChars().some((c) => !c.deletedAt && c.name.toLowerCase() === lower);
}
