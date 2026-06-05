import type { AuthSession, CharacterRow, UserProfile } from './types';
import type { Gender, VocationId } from '../../shared/types/character';
import { createDefaultCharacterConfig } from '../character/characterSerializer';
import { MAX_CHARACTERS_PER_ACCOUNT } from './types';
import { DEFAULT_GAME_CONFIG } from '../game-data/default/game.config';

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
        let parsed = raw ? (JSON.parse(raw) as CharacterRow[]) : [];

        // Migração: Se houver uma sessão mock ativa, migra personagens órfãos (com ID antigo mock_*)
        // para o novo ID de usuário determinístico (mock_user_*) para que o desenvolvedor não perca seus testes.
        const sessionRaw = localStorage.getItem(SESSION_KEY);
        if (sessionRaw) {
            try {
                const session = JSON.parse(sessionRaw) as AuthSession;
                if (session && session.userId) {
                    let migrated = false;
                    parsed = parsed.map(c => {
                        if (c.accountId && c.accountId.startsWith('mock_') && !c.accountId.startsWith('mock_user_')) {
                            c.accountId = session.userId;
                            migrated = true;
                        }
                        return c;
                    });
                    if (migrated) {
                        localStorage.setItem(CHARS_KEY, JSON.stringify(parsed));
                    }
                }
            } catch (e) {}
        }

        return parsed.map(c => {
            const config = c.outfitConfig as any || {};
            const vocation = c.vocation ?? config.vocation ?? 'knight';
            const gender = c.gender ?? config.gender ?? 'male';
            const spriteSheetUrl = c.outfitConfig?.spriteSheetUrl || `tiles/characters/vocations/${gender}/${vocation}.png`;
            return {
                ...c,
                vocation,
                level: c.level ?? config.level ?? 1,
                experience: c.experience ?? config.experience ?? 0,
                gender,
                appearance: c.appearance ?? config.appearance ?? {
                    gender: gender as 'male' | 'female',
                    outfitId: config.appearance?.outfitId || `default_${vocation}_${gender}`,
                    spriteSheetUrl,
                },
                gameId: c.gameId ?? config.gameId ?? DEFAULT_GAME_CONFIG.id,
                mapId: c.mapId || config.mapId || c.spawnMapId || DEFAULT_GAME_CONFIG.start.mapId,
                position: c.position ?? config.position ?? { ...DEFAULT_GAME_CONFIG.start.position },
                direction: c.direction ?? config.direction ?? DEFAULT_GAME_CONFIG.start.direction,
            };
        });
    } catch (err) {
        console.error("Erro ao ler personagens do mockAuth:", err);
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
    const normalizedEmail = email.trim().toLowerCase();
    const cleanEmail = normalizedEmail.replace(/[^a-zA-Z0-9]/g, '_');
    const userId = `mock_user_${cleanEmail}`;
    const session: AuthSession = { userId, email: normalizedEmail };
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    const studio = normalizedEmail.endsWith('@gm.dev') || import.meta.env.VITE_MOCK_STUDIO === 'true';
    const profile: UserProfile = {
        id: session.userId,
        displayName: normalizedEmail.split('@')[0],
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

export async function mockCreateCharacter(
    accountId: string,
    name: string,
    vocationId: VocationId,
    gender: Gender,
    outfitId: string,
    spriteSheetUrl: string,
    spawnMapId: string
): Promise<CharacterRow> {
    const chars = readChars();
    const active = chars.filter((c) => c.accountId === accountId && !c.deletedAt);
    if (active.length >= MAX_CHARACTERS_PER_ACCOUNT) {
        throw new Error(`Limite de ${MAX_CHARACTERS_PER_ACCOUNT} personagens por conta.`);
    }

    const base = createDefaultCharacterConfig();
    base.name = name;
    base.spriteSheetUrl = spriteSheetUrl;

    const appearance = {
        gender,
        outfitId,
        spriteSheetUrl,
    };

    const row: CharacterRow = {
        id: uid(),
        accountId,
        name,
        outfitConfig: {
            ...base,
            vocation: vocationId,
            level: 1,
            experience: 0,
            gender,
            appearance,
            gameId: DEFAULT_GAME_CONFIG.id,
            mapId: spawnMapId,
            position: { ...DEFAULT_GAME_CONFIG.start.position },
            direction: DEFAULT_GAME_CONFIG.start.direction,
        } as any,
        spawnMapId,
        createdAt: new Date().toISOString(),
        lastPlayedAt: null,
        vocation: vocationId,
        level: 1,
        experience: 0,
        gender,
        appearance,
        gameId: DEFAULT_GAME_CONFIG.id,
        mapId: spawnMapId,
        position: { ...DEFAULT_GAME_CONFIG.start.position },
        direction: DEFAULT_GAME_CONFIG.start.direction,
    };
    chars.push(row);
    writeChars(chars);
    return row;
}

export function mockSoftDeleteCharacter(id: string, accountId: string): void {
    console.log('[mockSoftDeleteCharacter] Request:', { id, accountId });
    const chars = readChars();
    console.log('[mockSoftDeleteCharacter] All characters:', chars);
    const c = chars.find((x) => x.id === id && x.accountId === accountId);
    console.log('[mockSoftDeleteCharacter] Found match:', c);
    if (c) {
        c.deletedAt = new Date().toISOString();
        writeChars(chars);
        console.log('[mockSoftDeleteCharacter] Successfully marked deleted and saved.');
    } else {
        console.warn('[mockSoftDeleteCharacter] No character matched search criteria.');
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

export function mockUpdateCharacterLocation(
    id: string,
    location: {
        mapId: string;
        position: { x: number; y: number; z: number };
        direction: 'north' | 'south' | 'east' | 'west';
    }
): void {
    const chars = readChars();
    const c = chars.find((x) => x.id === id);
    if (c) {
        c.mapId = location.mapId;
        c.position = { ...location.position };
        c.direction = location.direction;
        if (c.outfitConfig) {
            (c.outfitConfig as any).mapId = location.mapId;
            (c.outfitConfig as any).position = { ...location.position };
            (c.outfitConfig as any).direction = location.direction;
        }
        writeChars(chars);
    }
}
