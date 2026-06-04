import type { CharacterSpriteConfig } from '../character/spriteAnimation';
import type { Gender, CharacterAppearance } from '../../shared/types/character';

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
    vocation?: string;
    level?: number;
    experience?: number;
    gender?: Gender;
    appearance?: CharacterAppearance;
}

export const MAX_CHARACTERS_PER_ACCOUNT = 4;

export const OUTFIT_PRESETS: Record<string, { label: string; config: Partial<CharacterSpriteConfig> }> = {
    knight: {
        label: 'Cavaleiro (Knight)',
        config: { spriteSheetUrl: 'tiles/characters/knight.png', name: 'Cavaleiro' },
    },
    mage: {
        label: 'Mago (Mage)',
        config: { spriteSheetUrl: 'tiles/characters/mage.png', name: 'Mago' },
    },
    archer: {
        label: 'Arqueiro (Archer)',
        config: { spriteSheetUrl: 'tiles/characters/archer.png', name: 'Arqueiro' },
    },
};

