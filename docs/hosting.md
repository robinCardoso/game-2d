# Hospedagem recomendada

| Camada | Serviço | Notas |
|--------|---------|-------|
| Landing, auth, play, studio (estático) | Vercel / Cloudflare Pages | `npm run build` — MPA |
| Auth + Postgres | Supabase | Ver `supabase/schema.sql` |
| Game server WebSocket | Fly.io / Hetzner VPS | `server/` — não use Hostgator shared para WS |

## Variáveis de produção

- `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
- `VITE_GAME_SERVER_WS=wss://seu-servidor:8787`
- `ENTER_TICKET_SECRET` no servidor (igual a `VITE_ENTER_TICKET_SECRET` no build do cliente)
- `VITE_STUDIO_GUARD=true` em build de produção

## Deploy estático (Vercel)

```bash
npm run build
# dist/ contém index.html, play.html, studio.html, etc.
```

## Deploy game server

```bash
cd server && npm install && npm start
# Porta GAME_SERVER_PORT (padrão 8787)
```

## Analytics

`VITE_ANALYTICS=true` — eventos no console; integrar PostHog/Plausible em `src/shared/analytics.ts`.
