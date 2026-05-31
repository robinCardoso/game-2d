# Log de melhorias do Studio (mapa + sprites)

Documento de referência para humanos e agentes IA. **Atualizar este arquivo** quando mudar calibrador, registry, carregamento de mapas ou APIs de sprite.

Última revisão: **2026-05-31**

---

## Resumo executivo

| Área | Problema que existia | Solução implementada |
|------|----------------------|----------------------|
| Calibrador multi-select | Clique não selecionava frames | `click` dedicado; drag off em multi-select; cleanup listeners |
| Calibrador ao editar | Grade 1×1 / 64px default | `mapSpriteCalibration.ts` + inferência ao carregar sprite |
| Mapa diferente a cada F5 | IDs instáveis + race no registry | Registry determinístico + resolução por `ref` |
| Random no mapa salvo | Confusão random vs render | Random **só** em `resolvePaintTileId`; mapa guarda ids fixos |
| Variantes soltas na paleta | Strip sem `variantGroup` | `inferVariantGroupForStrip()` + export inferido |
| Exclusão de sprites | Só existia em `dist/` | UI 🗑️ + `sprite-usage` + `delete-map-sprite` no source |
| Metadados órfãos | `01_grama_randon` vs `01_grama.png` | Chave JSON = filename do PNG |

---

## Módulos e arquivos-chave

```
src/engine/config.ts              TILE_SIZE = 32
src/engine/tileRegistry.ts        buildTileRegistryAsync (ordem path)
src/engine/tileRefResolver.ts     resolveMapTileId, remapWorldMapTileIds
src/engine/tileVariants.ts        resolvePaintTileId (só pintura)
src/engine/worldMap.ts            loadMapFromJson(..., tileRegistry?)
src/editor/mapSpriteCalibration.ts inferMapSpriteCalibration
src/editor/mapSpriteEditor.ts     calibrador, exclusão, sync calibração
src/editor/characterCalibratorModal.ts  modo mapa, multi-select
src/editor/mapSpriteBatchExport.ts export strip + grupo inferido
vite.config.ts                    APIs list/usage/delete/save sprites
tiles/tile_properties.json        metadados por filename
public/tile_variant_groups.json   labels preview 🎲
```

---

## 1. Calibrador (modo mapa)

### Multi-seleção
- Checkbox `#calMapMultiSelectToggle` resetado ao abrir modal.
- Seleção via `click` no canvas (não depender só de mouseup sem drag).
- Arraste de margem desativado quando multi-select ativo.
- Listeners removidos com `AbortController` ao fechar.

### Grade ao editar sprite existente
- `inferMapSpriteCalibration(imageW, imageH, hints)` — strip 128×32 → 4×1 frames 32px.
- Campos do painel + `initialGridCols/Rows` passados ao calibrador.
- Persistência opcional em `tile_properties`: `frameWidth`, `gridCols`, `sheetLayout`, etc.

---

## 2. Carregamento de mapas (estabilidade)

### Causa raiz do “mapa mudava a cada refresh”
1. IDs numéricos atribuídos na ordem de `img.onload` (não determinística).
2. Loader usava só `id` do JSON, ignorando `ref` / `tileRefs`.
3. Mapa podia carregar antes do registry terminar.

### Correções
```text
tileRegistryReady (await) → bootstrapApp → loadMapFile(..., TILE_TYPES)
loadMapFromJson → deserializeMapDocument(..., registry)
  → resolveTilesByFloor (ref por célula)
  → remapWorldMapTileIds (fallback tileRefs)
reloadTileRegistry → snapshot com refs → remapear worldMap
```

### Regras
- **Salvar mapa:** sempre enriquecer com `ref` (`enrichTilesWithRefs`).
- **Carregar mapa:** sempre passar registry atual para resolver refs.
- **Pintar:** `resolvePaintTileId` sorteia; célula salva id fixo da variante escolhida.

---

## 3. Variant strips e pincel 🎲

### Um PNG, N tiles no registry
- Export “Exportar selecionados” → **1 PNG** horizontal (`N × 32` px).
- Registry expande em N entradas (`fileKey`: `nome#0` … `#N-1`).

### Pincel aleatório (9000–9999)
- Criado por `attachVariantBrushes()` quando ≥2 tiles com mesmo `variantGroup`.
- Existe só na paleta do editor; **nunca** no JSON do mapa.

### Fail-safe de grupo
- Sem `variantGroup` no JSON → inferir de filename (`ground_pedra_variants` → `stone`).
- Export batch com “Sem grupo” ainda grava grupo inferido quando possível.

---

## 4. Exclusão segura de sprites

### UI
- `#deleteMapSpriteBtn` no painel **Criar Sprites** (visível ao selecionar sprite na lista).

### Fluxo
1. `GET /api/sprite-usage?filename=`
2. Se `totalCells > 0` → bloquear com lista de mapas
3. `DELETE /api/delete-map-sprite?filename=&category=&force=false`
4. Remove PNG, `tile_properties`, ajusta `tile_variant_groups.json`
5. `reloadTileRegistry()` + refresh paleta

### Pendente / backlog
- `force=true` + substituição de refs nos mapas (migração automática)

---

## 5. Paleta Tileset vs seletor Criar Sprites

| | Tileset `#tileSelector` | `#mapSpriteServerSelect` |
|--|-------------------------|---------------------------|
| Fonte | Glob `tiles/**/*.png` | API `/api/list-map-sprites` |
| Pastas | Todo `tiles/` | Só `tiles/maps/` |
| Edição | Pintar mapa | CRUD sprite + calibrador |

Mesmo PNG em `tiles/maps/grass/01_grama.png` aparece nos dois (nomes podem diferir capitalização).

---

## 6. Melhorias relacionadas (sessões anteriores)

- Editor unificado Personagem/NPC/Mob (`spriteSheetEditor.ts`)
- Spawn com `TILE_SIZE` correto (`entity.ts`, `spriteDraw.ts`)
- MapDocument esparso v1 — ver `docs/map-format.md`

---

## 7. Testes manuais de regressão

1. **F5 no Studio** — mapa salvo idêntico (mesmas refs visuais).
2. **Calibrador** — strip 128×32 abre como 4×1, multi-select alterna tiles verdes.
3. **Pintar 🎲** — salvar, F5 — células não mudam aleatoriamente.
4. **Excluir sprite** — bloqueio se usado em `public/maps/*.json`.
5. **Paleta** — strip sem grupo vira 🎲 (≥2 frames), não tiles soltos.
6. **Criar Sprites** — selecionar existente preenche 32×32 e grade correta.

---

## 8. Referências

- [sprite-exporter-walkthrough.md](./sprite-exporter-walkthrough.md)
- [map-format.md](./map-format.md)
- [architecture.md](./architecture.md)
- Regra Cursor: `.cursor/rules/studio-map-sprites.mdc`
