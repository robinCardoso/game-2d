import { createHmac, timingSafeEqual } from 'node:crypto';

export interface EnterTicketPayload {
    characterId: string;
    accountId: string;
    name: string;
    exp: number;
}

const DEV_SECRET = process.env.ENTER_TICKET_SECRET ?? 'game2d-dev-enter-secret-change-in-prod';

function base64UrlDecode(str: string): string {
    const pad = str.length % 4 === 0 ? '' : '='.repeat(4 - (str.length % 4));
    return Buffer.from(str.replace(/-/g, '+').replace(/_/g, '/') + pad, 'base64').toString('utf8');
}

function sign(body: string): string {
    return createHmac('sha256', DEV_SECRET)
        .update(body)
        .digest('base64url');
}

export function verifyEnterTicket(ticket: string): EnterTicketPayload | null {
    const parts = ticket.split('.');
    if (parts.length !== 2) return null;
    const [body, sig] = parts;
    const expected = sign(body);
    try {
        const a = Buffer.from(sig);
        const b = Buffer.from(expected);
        if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    } catch {
        return null;
    }
    try {
        const payload = JSON.parse(base64UrlDecode(body)) as EnterTicketPayload;
        if (!payload.exp || Date.now() > payload.exp) return null;
        if (!payload.characterId || !payload.name) return null;
        return payload;
    } catch {
        return null;
    }
}
