import {
    isMockAuthEnabled,
    mockGetProfile,
    mockGetSession,
    mockSignIn,
    mockSignOut,
    mockSignUp,
} from './mockAuth';
import { getSupabase, isSupabaseConfigured } from './supabaseClient';
import type { AuthSession, UserProfile } from './types';

export async function getSession(): Promise<AuthSession | null> {
    if (isMockAuthEnabled()) {
        return mockGetSession();
    }
    if (!isSupabaseConfigured()) return null;
    const { data } = await getSupabase().auth.getSession();
    if (!data.session?.user) return null;
    return {
        userId: data.session.user.id,
        email: data.session.user.email ?? '',
    };
}

export async function getProfile(): Promise<UserProfile | null> {
    if (isMockAuthEnabled()) {
        return mockGetProfile();
    }
    const session = await getSession();
    if (!session || !isSupabaseConfigured()) return null;
    const { data, error } = await getSupabase()
        .from('profiles')
        .select('id, display_name, role, can_access_studio')
        .eq('id', session.userId)
        .maybeSingle();
    if (error || !data) {
        return {
            id: session.userId,
            displayName: session.email.split('@')[0],
            role: 'player',
            canAccessStudio: false,
        };
    }
    return {
        id: data.id,
        displayName: data.display_name,
        role: data.role as UserProfile['role'],
        canAccessStudio: data.can_access_studio,
    };
}

export async function signUp(email: string, password: string): Promise<void> {
    if (isMockAuthEnabled()) {
        await mockSignUp(email, password);
        return;
    }
    const { error } = await getSupabase().auth.signUp({ email, password });
    if (error) throw error;
}

export async function signIn(email: string, password: string): Promise<void> {
    if (isMockAuthEnabled()) {
        await mockSignIn(email, password);
        return;
    }
    const { error } = await getSupabase().auth.signInWithPassword({ email, password });
    if (error) throw error;
}

export async function signOut(): Promise<void> {
    if (isMockAuthEnabled()) {
        mockSignOut();
        return;
    }
    if (isSupabaseConfigured()) {
        await getSupabase().auth.signOut();
    }
}

export async function requireAuth(redirectTo = '/login.html'): Promise<AuthSession> {
    const session = await getSession();
    if (!session) {
        const next = encodeURIComponent(location.pathname + location.search);
        location.href = `${redirectTo}?next=${next}`;
        throw new Error('Não autenticado');
    }
    return session;
}

export async function requireStudioAccess(): Promise<UserProfile> {
    await requireAuth();
    const profile = await getProfile();
    if (!profile?.canAccessStudio) {
        alert('Acesso ao GM Studio negado. Use conta @gm.dev no modo mock ou habilite can_access_studio no Supabase.');
        location.href = '/characters.html';
        throw new Error('Sem acesso ao studio');
    }
    return profile;
}

export async function redirectIfAuthenticated(target = '/characters.html'): Promise<void> {
    const session = await getSession();
    if (session) {
        location.href = target;
    }
}
