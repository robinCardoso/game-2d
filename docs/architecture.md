# Arquitetura — Tibia Web Engine

## Camadas

```
┌─────────────────────────────────────────────────────────────┐
│  EDITOR (ADM) — index.html + src/editor/* (futuro)          │
│  Pintar mapa, undo, tileset, dev tools, export              │
└───────────────────────────┬─────────────────────────────────┘
                            │ usa API pública
┌───────────────────────────▼─────────────────────────────────┐
│  ENGINE — src/engine/ + src/movement/ + src/character/        │
│  Mapa, tiles, colisão, escadas, grid, speed, terreno          │
└───────────────────────────┬─────────────────────────────────┘
                            │ lê dados
┌───────────────────────────▼─────────────────────────────────┐
│  DADOS — JSON de mapa, itemDefinitions, assets/tiles/         │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  CLIENTE JOGADOR (futuro) — conta IndexedDB, char, cidade   │
│  Não misturar com editor; consome a mesma ENGINE            │
└─────────────────────────────────────────────────────────────┘
```

## Pastas

| Pasta | Responsabilidade |
|-------|------------------|
| `src/engine/` | Mundo, mapa, colisão, registro de tiles |
| `src/movement/` | Grid, passos, tween, escadas (chama engine) |
| `src/character/` | Speed, equip, buffs, terreno no passo |
| `src/functions/` | tileConfig, roles, history (editor + regras) |
| `src/main.ts` | **Shell do editor ADM** (enquanto não há `src/editor/`) |

## Tiles

- Tamanho global: `ENGINE_CONFIG.TILE_SIZE` (**64** px) em `engine/config.ts`
- Assets PNG em `tiles/**` devem ser **64×64** (escadas: sufixo `_64x64`, ex. `marble_stairs_up_64x64.png`)
- Colisão: hitbox proporcional via `collisionHitboxSize()`

## Formato de mapa (`MapDocument` v1)

- `version`, `name`, `size`, `tileSize`, `floors`, `spawn`
- Export/import pelo editor usa `serializeMapDocument` / `deserializeMapDocument`
- Cliente futuro carrega o mesmo JSON (fetch ou IndexedDB de mapas publicados)

## O que NÃO vai na engine

- UI de conta / personagem / cidade
- IndexedDB de usuário
- Painel de tileset e ferramentas de pintura

## Andares (Z)

- Configurado em `engine/config.ts`: **MIN_FLOOR_Z = -7**, **MAX_FLOOR_Z = +7**
- UI: `#floorSelector` gerado por `editor/floorSelector.ts` (grade 5 colunas, scroll)
- Mapas importados recebem `ensureAllFloors()` — andares ausentes viram vazio (`-1`)

## Roadmap engine (antes do cliente jogador)

1. ✅ `worldMap` + `MapDocument` v1
2. ✅ Colisão e escadas em `engine/collision.ts`
3. ✅ Andares -7 … +7
3. ⬜ `facing` (N/S/E/O) no grid — ver `docs/character-sprite-engine.md`
4. ⬜ `CharacterRenderer` + Character Studio (sprites separados dos tiles)
5. ⬜ `GameLoop` tipado (update/draw injetável)
6. ⬜ Publicar mapa (arquivo estático ou API)
