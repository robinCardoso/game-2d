import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { CharacterRow } from './types';
import type { CharacterSpriteConfig } from '../character/spriteAnimation';

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
    return {
        id: row.id,
        accountId: row.account_id,
        name: row.name,
        outfitConfig: row.outfit_config,
        spawnMapId: row.spawn_map_id,
        createdAt: row.created_at,
        lastPlayedAt: row.last_played_at,
        deletedAt: row.deleted_at,
        vocation: (row.outfit_config as any).vocation ?? 'knight',
        level: (row.outfit_config as any).level ?? 1,
        experience: (row.outfit_config as any).experience ?? 0,
        gender: (row.outfit_config as any).gender ?? 'male',
        appearance: (row.outfit_config as any).appearance ?? {
            gender: ((row.outfit_config as any).gender ?? 'male') as 'male' | 'female',
            vocation: ((row.outfit_config as any).vocation ?? 'knight') as 'knight' | 'mage' | 'archer',
            outfitId: `default_${(row.outfit_config as any).vocation ?? 'knight'}_${(row.outfit_config as any).gender ?? 'male'}`,
        },
    };
}
