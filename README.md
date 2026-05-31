# 2D World — engine e jogo web

MMORPG 2D no browser: editor GM, multi-mapas, dungeons instanciadas e multiplayer WebSocket.

## Jogar (jogador)

1. `npm install` e `npm run dev`
2. Abra **http://localhost:5173/** (landing)
3. Crie conta → personagem → **Entrar no mundo**

Documentação completa: [docs/player-journey.md](docs/player-journey.md)

### Rotas

| URL | Descrição |
|-----|-----------|
| `/` | Apresentação |
| `/login.html` | Login |
| `/characters.html` | Seleção de personagem |
| `/play.html` | Jogo |
| `/studio.html` | GM / editor de mapas |

**Modo mock (sem Supabase):** qualquer e-mail/senha. Use `gm@gm.dev` para flag GM no mock.

## Desenvolver mapas (GM)

1. `npm run dev`
2. Abra **http://localhost:5173/studio.html**
3. Em produção, exige `can_access_studio` no Supabase

## Multiplayer local

```bash
npm run dev:server   # WebSocket :8787
npm run dev          # cliente
```

## Build

```bash
npm run build
npm run preview
```

## Configuração

Copie `.env.example` → `.env`. Supabase: rode `supabase/schema.sql` no SQL Editor.

## Hospedagem

[docs/hosting.md](docs/hosting.md)

## Docs

- [AGENTS.md](AGENTS.md) — guia para agentes IA (invariantes, links)
- [Melhorias do Studio](docs/studio-improvements-log.md) — calibrador, mapas, exclusão de sprites
- [Formato de mapa](docs/map-format.md) — `MapDocument`, resolução por `ref`
- [Sprites de mapa](docs/sprite-exporter-walkthrough.md) — calibrador e APIs dev
- [Jornada do jogador](docs/player-journey.md)
- [Mapas instanciados e multiplayer](docs/instanced-maps-and-multiplayer.md)
- [Game server](server/README.md)
