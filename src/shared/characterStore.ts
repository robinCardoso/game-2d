import {
    isMockAuthEnabled,
    mockCreateCharacter,
    mockGetCharacter,
    mockIsNameTaken,
    mockListCharacters,
    mockSoftDeleteCharacter,
    mockUpdateLastPlayed,
} from './mockAuth';
import { getSupabase, isSupabaseConfigured, mapDbCharacter, type DbCharacter } from './supabaseClient';
import type { CharacterRow } from './types';
import { createDefaultCharacterConfig } from '../character/characterSerializer';
import { MAX_CHARACTERS_PER_ACCOUNT } from './types';

export async function listCharacters(accountId: string): Promise<CharacterRow[]> {
    if (isMockAuthEnabled()) {
        return mockListCharacters(accountId);
    }
    const { data, error } = await getSupabase()
        .from('characters')
        .select('*')
        .eq('account_id', accountId)
        .is('deleted_at', null)
        .order('last_played_at', { ascending: false, nullsFirst: false });
    if (error) throw error;
    return (data as DbCharacter[]).map(mapDbCharacter);
}

export async function getCharacter(id: string, accountId: string): Promise<CharacterRow | null> {
    if (isMockAuthEnabled()) {
        return mockGetCharacter(id, accountId);
    }
    const { data, error } = await getSupabase()
        .from('characters')
        .select('*')
        .eq('id', id)
        .eq('account_id', accountId)
        .is('deleted_at', null)
        .maybeSingle();
    if (error) throw error;
    return data ? mapDbCharacter(data as DbCharacter) : null;
}

export async function createCharacter(
    accountId: string,
    name: string,
    presetId: string,
    spawnMapId = 'rookgaard'
): Promise<CharacterRow> {
    if (isMockAuthEnabled()) {
        if (mockIsNameTaken(name)) {
            throw new Error('Este nome já está em uso.');
        }
        return mockCreateCharacter(accountId, name, presetId, spawnMapId);
    }
    const existing = await listCharacters(accountId);
    if (existing.length >= MAX_CHARACTERS_PER_ACCOUNT) {
        throw new Error(`Limite de ${MAX_CHARACTERS_PER_ACCOUNT} personagens por conta.`);
    }
    const base = createDefaultCharacterConfig();
    base.name = name;
    base.spriteSheetUrl = 'tiles/characters/knight.png';

    const { data, error } = await getSupabase()
        .from('characters')
        .insert({
            account_id: accountId,
            name: name.trim(),
            outfit_config: base,
            spawn_map_id: spawnMapId,
        })
        .select()
        .single();
    if (error) {
        if (error.code === '23505') throw new Error('Este nome já está em uso.');
        throw error;
    }
    return mapDbCharacter(data as DbCharacter);
}

export async function softDeleteCharacter(id: string, accountId: string): Promise<void> {
    if (isMockAuthEnabled()) {
        mockSoftDeleteCharacter(id, accountId);
        return;
    }
    const { error } = await getSupabase()
        .from('characters')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', id)
        .eq('account_id', accountId);
    if (error) throw error;
}

export async function markCharacterPlayed(id: string, accountId: string): Promise<void> {
    if (isMockAuthEnabled()) {
        mockUpdateLastPlayed(id, accountId);
        return;
    }
    const { error } = await getSupabase()
        .from('characters')
        .update({ last_played_at: new Date().toISOString() })
        .eq('id', id)
        .eq('account_id', accountId);
    if (error) throw error;
}

export function validateCharacterName(name: string): string | null {
    const trimmed = name.trim();
    if (trimmed.length < 3 || trimmed.length > 20) {
        return 'Nome deve ter entre 3 e 20 caracteres.';
    }
    if (!/^[a-zA-Z0-9 ]+$/.test(trimmed)) {
        return 'Use apenas letras, números e espaços.';
    }
    return null;
}

export { isSupabaseConfigured };
