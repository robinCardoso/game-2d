import type { CharacterSpriteConfig } from '../../character/spriteAnimation';

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
