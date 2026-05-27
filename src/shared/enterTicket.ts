/**
 * Ticket de entrada no WebSocket — evita spoof de nome no join.
 * MVP: HMAC simples com segredo compartilhado (dev).
 */

export interface EnterTicketPayload {
    characterId: string;
    accountId: string;
    name: string;
    exp: number;
}

const DEV_SECRET = 'game2d-dev-enter-secret-change-in-prod';

function base64UrlEncode(str: string): string {
    return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(str: string): string {
    const pad = str.length % 4 === 0 ? '' : '='.repeat(4 - (str.length % 4));
    return atob(str.replace(/-/g, '+').replace(/_/g, '/') + pad);
}

async function hmacSign(message: string, secret: string): Promise<string> {
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
        'raw',
        enc.encode(secret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
    );
    const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
    return base64UrlEncode(String.fromCharCode(...new Uint8Array(sig)));
}

export async function createEnterTicket(
    characterId: string,
    accountId: string,
    name: string,
    ttlMs = 120_000
): Promise<string> {
    const payload: EnterTicketPayload = {
        characterId,
        accountId,
        name,
        exp: Date.now() + ttlMs,
    };
    const body = base64UrlEncode(JSON.stringify(payload));
    const secret = import.meta.env.VITE_ENTER_TICKET_SECRET || DEV_SECRET;
    const sig = await hmacSign(body, secret);
    return `${body}.${sig}`;
}

export async function verifyEnterTicket(ticket: string): Promise<EnterTicketPayload | null> {
    const parts = ticket.split('.');
    if (parts.length !== 2) return null;
    const [body, sig] = parts;
    const secret = import.meta.env.VITE_ENTER_TICKET_SECRET || DEV_SECRET;
    const expected = await hmacSign(body, secret);
    if (sig !== expected) return null;
    try {
        const payload = JSON.parse(base64UrlDecode(body)) as EnterTicketPayload;
        if (!payload.exp || Date.now() > payload.exp) return null;
        if (!payload.characterId || !payload.name) return null;
        return payload;
    } catch {
        return null;
    }
}
