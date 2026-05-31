# Análise — exclusão de sprites de mapa

> **Status (2026-05-31): implementado.** Este documento descreve o desenho original e o que foi entregue no código.

## Estado atual

| Tipo | Salvar | Remover |
|------|--------|---------|
| Sprite de mapa (Criar Sprites) | `POST /api/save-map-sprite` | ✅ `DELETE /api/delete-map-sprite` + botão 🗑️ |
| Personagem / NPC / Mob | `POST /api/save-character` | Não existe |
| Spawn no mapa | JSON do mapa | Sim (borracha SPWN) |
| Mapa no registry | — | Só remove do registry; não apaga arquivo |

## O que é removido ao excluir um sprite de mapa

Exemplo: `grama_20_var_variants` em `grass-random`.

| Artefato | Caminho / chave |
|----------|-----------------|
| PNG | `tiles/maps/grass-random/grama_20_var_variants.png` |
| Metadados | Entrada em `tiles/tile_properties.json` → chave `grama_20_var_variants` |
| Catálogo | `public/tile_catalog.json` — regenerado ao recarregar registry |
| Grupo aleatório | `public/tile_variant_groups.json` — preview repontado ou grupo removido |

Strip de variantes (N frames): 1 PNG → N IDs no registry (`grama_20_var_variants#0` … `#N-1`). Apagar o PNG remove todos de uma vez.

## Verificação de uso (implementada)

Referência estável: **`ref` / fileKey**, não o ID numérico.

```
GET /api/sprite-usage?filename=grama_20_var_variants
```

Retorno inclui `maps[]`, `totalCells`, `variantGroups`, `isPreviewTile`.

Varredura em `public/maps/*.json`:
- `tileRefs`: `ref === filename` ou `ref.startsWith(filename#)`
- `tiles[z][]`: mesmo critério no campo `ref`

## Fluxo UI (implementado)

1. Painel **Criar Sprites** → `#deleteMapSpriteBtn`
2. `GET /api/sprite-usage`
3. Se `totalCells > 0` → modal com mapas afetados; **bloqueio** (409 no DELETE)
4. Se livre → `DELETE /api/delete-map-sprite?force=false`
5. `reloadTileRegistry()` + refresh paleta

### Pendente (backlog)

- Opção **Substituir** antes de apagar (migração automática de refs nos mapas)
- `force=true` com confirmação GM
- Soft delete / arquivo em `tiles/_archive/`
- Exclusão de personagem/NPC/Mob
- Limpeza de `auto_border_sets.json` ao excluir tile de borda

## Resolução estável de tiles (relacionado)

Desde a mesma leva de melhorias:

- `tileRefResolver.ts` — mapas resolvem `ref` → id no load
- `buildTileRegistryAsync()` — ordem determinística de path
- Random 🎲 só na pintura, não na renderização

Ver [docs/studio-improvements-log.md](docs/studio-improvements-log.md) e `.cursor/rules/studio-map-sprites.mdc`.
