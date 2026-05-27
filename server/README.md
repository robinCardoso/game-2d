# Game server (Fase 2 — MVP localhost)

Servidor WebSocket mínimo para **join** e **sync de tile** entre abas/jogadores no mesmo `mapId`.

Não escolhe cloud nem auth — roda 100% em `localhost`.

## Estrutura

```
server/
  package.json
  tsconfig.json
  src/
    index.ts      # HTTP health + WebSocket
    GameRoom.ts   # sala única (MVP)
shared/
  protocol.ts     # tipos e validação (cliente + servidor)
src/net/
  gameNetClient.ts
```

## Como rodar

**Terminal 1 — servidor:**

```bash
cd server
npm install
npm run dev
```

Saída esperada:

```
[game-2d-server] WS    ws://localhost:8787
```

**Terminal 2 — cliente Vite:**

```bash
npm run dev
```

Na raiz do projeto também:

```bash
npm run dev:server
```

Em modo dev, o cliente conecta automaticamente em `ws://localhost:8787`. Abra **duas abas** no mesmo mapa (`mainland`) e mova com as setas — o outro jogador aparece como quadrado rosa.

## Variáveis

| Variável | Onde | Padrão |
|----------|------|--------|
| `GAME_SERVER_PORT` | servidor | `8787` |
| `VITE_GAME_SERVER_WS` | cliente | em dev: `ws://localhost:8787`; use `false` para desligar |

## Protocolo (v1)

Mensagens JSON com campo `v: 1`.

### Cliente → servidor

| `type` | Campos principais |
|--------|-------------------|
| `join` | `name`, `mapId`, `tileX`, `tileY`, `z` |
| `move` | `mapId`, `tileX`, `tileY`, `z` |
| `map_change` | igual ao `move` (troca de mapa) |
| `ping` | `t` (timestamp) |
| `leave` | — |

### Servidor → cliente

| `type` | Descrição |
|--------|-----------|
| `welcome` | `playerId` + lista `players` no mesmo mapa |
| `player_joined` | novo jogador |
| `player_left` | saiu |
| `player_moved` | tile atualizado |
| `error` | `code`, `message` |

Detalhes: [`shared/protocol.ts`](../shared/protocol.ts) e [`docs/instanced-maps-and-multiplayer.md`](../docs/instanced-maps-and-multiplayer.md).

## Fase 2b (implementado)

- **Salas** `mapId` ou `mapId@instanceId` (`shared/roomKey.ts`).
- **Walkable** no servidor a partir dos JSON em `public/maps/` (`MapCollisionStore` + `shared/tileWalkable.ts`).
- **Passo adjacente** obrigatório em `move` (1 tile ou escada |dz|=1); `map_change` libera teleporte de portal.
- **Dungeons instanciadas**: servidor agrupa jogadores sem `instanceId` na mesma sala (até 8) e devolve `instanceId` no `welcome`.
- **`position_correction`**: servidor devolve tile autoritativo se o movimento for rejeitado.

## Limitações

- Colisão usa o **template** do JSON, não tiles editados na instância local.
- Sem persistência, party explícita, combate ou rate-limit.

Próximos passos: tick autoritativo, estado de instância no servidor, Supabase auth (opcional).
