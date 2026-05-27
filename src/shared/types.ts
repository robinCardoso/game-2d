import type { CharacterSpriteConfig } from '../character/spriteAnimation';

export interface AuthSession {
    userId: string;
    email: string;
}

export interface UserProfile {
    id: string;
    displayName: string | null;
    role: 'player' | 'gm' | 'admin';
    canAccessStudio: boolean;
}

export interface CharacterRow {
    id: string;
    accountId: string;
    name: string;
    outfitConfig: CharacterSpriteConfig;
    spawnMapId: string;
    createdAt: string;
    lastPlayedAt: string | null;
    deletedAt?: string | null;
}

export const MAX_CHARACTERS_PER_ACCOUNT = 4;

export const OUTFIT_PRESETS: Record<string, { label: string; config: Partial<CharacterSpriteConfig> }> = {
    knight: {
        label: 'Cavaleiro',
        config: { spriteSheetUrl: 'tiles/characters/knight.png', name: 'Cavaleiro' },
    },
};
