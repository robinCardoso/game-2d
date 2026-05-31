# AGENTS.md — guia para agentes IA

Este repositório é um **Studio 2D estilo Tibia** (editor + engine). Leia isto antes de alterar mapas, tiles ou sprites.

## Regras Cursor (obrigatório)

| Regra | Escopo |
|-------|--------|
| [.cursor/rules/studio-map-sprites.mdc](.cursor/rules/studio-map-sprites.mdc) | **Sempre ativa** — invariantes de sprites, mapas, random, APIs |

## Documentação técnica

| Documento | Conteúdo |
|-----------|----------|
| [docs/studio-improvements-log.md](docs/studio-improvements-log.md) | Log de melhorias + checklist de regressão |
| [docs/map-format.md](docs/map-format.md) | Formato `MapDocument`, `ref`, tileRefs |
| [docs/sprite-exporter-walkthrough.md](docs/sprite-exporter-walkthrough.md) | Calibrador, export, exclusão |
| [docs/architecture.md](docs/architecture.md) | Camadas engine / editor |
| [docs/ui-menus.md](docs/ui-menus.md) | IDs de UI estáveis |

## Invariantes críticas (resumo)

1. `ENGINE_CONFIG.TILE_SIZE = 32`
2. `buildTileRegistryAsync()` antes de carregar mapas
3. `ref` estável no JSON; `tileRefResolver.ts` no load
4. Random (`🎲`) **só** em `resolvePaintTileId` — nunca no `draw()`
5. Strips `*_variants` inferem `variantGroup` se ausente
6. Exclusão de sprite: `sprite-usage` → `delete-map-sprite` (dev only)

## Ao implementar melhorias nesta área

1. Manter invariantes acima
2. Atualizar [docs/studio-improvements-log.md](docs/studio-improvements-log.md)
3. Ajustar [.cursor/rules/studio-map-sprites.mdc](.cursor/rules/studio-map-sprites.mdc) se novas regras surgirem
4. Rodar checklist manual da seção 7 do log de melhorias

## Comandos

```bash
npm run dev    # Studio + APIs Vite (save/delete sprites, mapas)
```

Reiniciar dev server após mudanças em `vite.config.ts`.
