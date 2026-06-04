import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { CharacterRow } from './types';
import type { CharacterSpriteConfig } from '../character/spriteAnimation';
import { DEFAULT_GAME_CONFIG } from '../game-data/default/game.config';

let client: SupabaseClient | null = null;

export function isSupabaseConfigured(): boolean {
    return !!(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY);
}

export function getSupabase(): SupabaseClient {
    if (!isSupabaseConfigured()) {
        throw new Error('Supabase não configurado. Defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY.');
    }
    if (!client) {
        client = createClient(
            import.meta.env.VITE_SUPABASE_URL!,
            import.meta.env.VITE_SUPABASE_ANON_KEY!
        );
    }
    return client;
}

export interface DbCharacter {
    id: string;
    account_id: string;
    name: string;
    outfit_config: CharacterSpriteConfig;
    spawn_map_id: string;
    created_at: string;
    last_played_at: string | null;
    deleted_at: string | null;
}

export function mapDbCharacter(row: DbCharacter): CharacterRow {
    const config = row.outfit_config as any;
    const vocation = config.vocation ?? 'knight';
    const gender = config.gender ?? 'male';
    const spriteSheetUrl = config.spriteSheetUrl || `tiles/characters/vocations/${gender}/${vocation}.png`;
    return {
        id: row.id,
        accountId: row.account_id,
        name: row.name,
        outfitConfig: row.outfit_config,
        spawnMapId: row.spawn_map_id,
        createdAt: row.created_at,
        lastPlayedAt: row.last_played_at,
        deletedAt: row.deleted_at,
        vocation: vocation,
        level: config.level ?? 1,
        experience: config.experience ?? 0,
        gender: gender,
        appearance: config.appearance ?? {
            gender: gender as 'male' | 'female',
            outfitId: config.appearance?.outfitId || `default_${vocation}_${gender}`,
            spriteSheetUrl,
        },
        gameId: config.gameId ?? DEFAULT_GAME_CONFIG.id,
        mapId: config.mapId || row.spawn_map_id || DEFAULT_GAME_CONFIG.start.mapId,
        position: config.position ?? { ...DEFAULT_GAME_CONFIG.start.position },
        direction: config.direction ?? DEFAULT_GAME_CONFIG.start.direction,
    };
}
