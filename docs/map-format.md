# Formato de mapa (`MapDocument`) — referência para humanos e IA

Este documento descreve como mapas são **salvos em disco**, **carregados pela engine** e **gerados por ferramentas/IA**. Mantenha-o atualizado quando o formato evoluir.

## Arquivos envolvidos

| Arquivo | Papel |
|---------|--------|
| `public/maps/*.json` | Mapas do jogo (um JSON por mapa) |
| `public/maps/map.schema.json` | JSON Schema do layout atual |
| `public/tile_catalog.json` | Catálogo global de tiles (ids, nomes, refs) — gerado no dev |
| `public/tile_variant_groups.json` | Metadados opcionais de grupos aleatórios (label, pesos) |
| `tiles/tile_properties.json` | Propriedades por PNG (`variantGroup`, `walkable`, etc.) |

## Identificador de formato

```
format: "game-2d/map-sparse-v1"
```

- Constante em código: `MAP_FORMAT_ID` (`src/engine/tileCatalog.ts`)
- Mapas novos exportados pelo studio incluem também `"$schema": "./map.schema.json"`
- **Versão do documento:** `version: 1` (campo separado do `format`)

> **Melhoria futura:** ao mudar o layout (ex. compressão RLE, chunks), incrementar `format` (`map-sparse-v2`) e manter loader compatível com v1.

---

## Sistema de coordenadas

Gravado em `coordSystem` no JSON e repetido no catálogo global.

| Eixo | Significado |
|------|-------------|
| **X** | Coluna — `0` = oeste; aumenta para **leste** (direita na tela) |
| **Y** | Linha — `0` = norte; aumenta para **sul** (baixo no canvas) |
| **Z** | Andar — `-7` (subsolo) … `0` (térreo) … `+7` (céu) |

- Origem: **canto superior esquerdo** (`origin: "top-left"`)
- Grade: **N×N** células (`size`, padrão `256`)
- Célula vazia na memória: `emptyTileId: -1` (não aparece no JSON esparso)
- Tamanho visual do tile: `tileSize` (px no PNG, hoje `32`)

Função que gera o bloco: `getMapCoordSystem()` em `src/engine/tileCatalog.ts`.

---

## Layout preferido (mapa esparso)

Só são serializadas **células pintadas**. Mapa vazio = sem chave `tiles`.

```json
{
  "$schema": "./map.schema.json",
  "format": "game-2d/map-sparse-v1",
  "version": 1,
  "name": "Caverna exemplo",
  "mapId": "orc_cave",
  "size": 256,
  "tileSize": 32,
  "coordSystem": { "...": "..." },
  "tileRefs": {
    "13": {
      "id": 13,
      "name": "grama (20 var.) · 1",
      "ref": "grama_20_var_variants#0",
      "category": "ground",
      "variantGroup": "grass",
      "variantIndex": 0,
      "walkable": true
    }
  },
  "spawn": { "x": 50, "y": 50, "z": 0 },
  "tiles": {
    "0": [
      { "x": 43, "y": 47, "id": 13, "ref": "grama_20_var_variants#0" }
    ]
  },
  "portals": [],
  "spawns": []
}
```

### Campo `tiles`

- Chave = andar **Z** como string (`"0"`, `"-1"`, `"3"`)
- Valor = array de células `{ x, y, id, ref? }`
- Ordenação ao salvar: **Y crescente**, depois **X**
- `ref` é **informativo** (legível para IA/Git); a engine resolve pelo **`id`**

### Campo `tileRefs`

- Subconjunto do catálogo: **apenas ids usados neste mapa**
- Chave = id em string (`"13"`)
- Gerado automaticamente no save quando há `tileRegistry` disponível

### Campos omitidos quando vazios

Para reduzir ruído, o export **não inclui**:

- `tiles` — se nenhuma célula pintada
- `metadata`, `houses` — se `{}`
- `spawns`, `portals` — se `[]`

---

## Catálogo global (`tile_catalog.json`)

Gerado/atualizado no **dev** quando:

1. O registry de tiles recarrega (`reloadTileRegistry` em `src/main.ts`)
2. Um mapa é salvo em `public/maps/`

Endpoint: `POST /api/save-tile-catalog` (middleware Vite).

Estrutura resumida:

```json
{
  "version": 1,
  "generatedAt": "2026-05-31T12:00:00.000Z",
  "tileSize": 32,
  "format": "game-2d/map-sparse-v1",
  "coordSystem": { "...": "..." },
  "variantBrushes": {
    "grass": {
      "brushId": 9000,
      "label": "Grama aleatório",
      "memberIds": [7, 8, 9, "..."]
    }
  },
  "tiles": [
    {
      "id": 13,
      "name": "grama (20 var.) · 1",
      "ref": "grama_20_var_variants#0",
      "category": "ground",
      "variantGroup": "grass",
      "variantIndex": 0,
      "walkable": true
    }
  ]
}
```

### Significado de `ref` (fileKey)

| Exemplo | Significado |
|---------|-------------|
| `grama_20_var_variants#0` | Frame `0` do strip horizontal `grama_20_var_variants.png` |
| `stone_floor` | PNG único `stone_floor.png` |

Strip detectado quando largura PNG = `N × tileSize` ou `variantStripFrames` em `tile_properties.json`.

---

## Tiles, IDs e variantes aleatórias

### IDs numéricos

- Atribuídos em runtime por `buildTileRegistryAsync()` (`src/engine/tileRegistry.ts`)
- **Não são estáveis entre sessões** se a ordem de PNGs no disco mudar
- Para IA/scripts: preferir validar com `ref` + `tileRefs`, mas a engine grava **`id`**

### Pincéis aleatórios (🎲)

- IDs virtuais **9000–9999** (`VARIANT_BRUSH_ID_BASE`)
- Existem **só na paleta do editor** — sorteiam variantes ao pintar
- **Mapas salvos nunca devem usar brush id** — apenas ids concretos das variantes
- IA: escolher um id de `variantBrushes.grass.memberIds` ou variantes do catálogo com mesmo `variantGroup`

### Grupos de variação

- `variantGroup` em `tile_properties.json` (ex. `"grass"`)
- Manifest opcional: `public/tile_variant_groups.json`
- Documentação de implementação: `.cursor/plans/tiles_aleatórios_estilo_tibia_6650291f.plan.md`

---

## Formatos legados (ainda suportados na importação)

| Campo | Descrição | Quando usar |
|-------|-----------|-------------|
| `floors` | Grade densa `floors[z][y][x]` | Mapas antigos (~11 MB para 256×256×15 andares) |
| `sparseTiles` | `[x, y, z, id][]` compacto | Transição; preferir `tiles` agrupado |

Ordem de leitura em `deserializeMapDocument()`:

1. `tiles` (agrupado)
2. `sparseTiles`
3. `floors`
4. Mapa vazio (`createEmptyWorldMap`)

Sanitização: `src/engine/mapImportSanitizer.ts` (`sanitizeTilesByFloor`, `sanitizeSparseTiles`).

---

## Pipeline no código

```
Pintura (worldMap em memória, grade densa 256×256×15)
        │
        ▼
serializeMapDocument(worldMap, { tileRegistry, spawn, ... })
        │  collectSparseTiles → groupSparseEntriesByFloor
        │  enrichTilesWithRefs + tileRefs
        ▼
formatMapDocumentJson(doc)  →  JSON legível
        │
        ▼
POST /api/save-map  →  public/maps/<id>.json
```

| Função | Arquivo |
|--------|---------|
| `serializeMapDocument` | `src/engine/worldMap.ts` |
| `deserializeMapDocument` / `loadMapFromJson` | `src/engine/worldMap.ts` |
| `formatMapDocumentJson` | `src/engine/mapDocumentFormat.ts` |
| `buildFullTileCatalog` | `src/engine/tileCatalog.ts` |
| Save dev | `src/utils/mapDevSave.ts` |
| API save mapa/catálogo | `vite.config.ts` |

---

## Outros campos do mapa

### `spawn`

Posição inicial do jogador: `{ x, y, z }`. Obrigatório.

### `metadata`

Chave `"z_y_x"` → `{ actionId?, uniqueId?, zoneId?, houseId? }` (estilo OT/Tibia).

### `spawns`

Criaturas/NPCs: `{ id, name, x, y, z, type: "monster" | "npc" }`.

### `portals`

Conexão entre mapas: tile de origem + mapa/coords destino (`targetMapId`, `targetX/Y/Z`).

### `houses`

Metadados de casas (id, nome, aluguel, entrada).

---

## Guia rápido para IA gerar mapas

1. Ler **`/tile_catalog.json`** — lista de tiles válidos
2. Ler **`/maps/map.schema.json`** — estrutura e tipos
3. Montar JSON com `format: "game-2d/map-sparse-v1"`
4. Preencher `tiles["<z>"]` com `{ x, y, id }` dentro de `0 … size-1`
5. Incluir `spawn` dentro dos limites
6. Opcional: `tileRefs` coerente com os ids usados
7. **Não** preencher grade densa; **não** usar ids 9000+ (pincéis)
8. Salvar em `public/maps/<mapId>.json` e registrar em `MAP_REGISTRY` se necessário

### Prompt base (copiar/adaptar)

```text
Você gera mapas para o jogo 2D (formato game-2d/map-sparse-v1).

Regras:
- Coordenadas: X leste, Y sul, Z andar (-7 a +7). Origem top-left.
- Use apenas tile ids do arquivo tile_catalog.json.
- Salve células em tiles["<z>"]: [{ "x", "y", "id" }]. Células vazias não entram.
- Nunca use ids 9000+ (são pincéis do editor, não tiles de mapa).
- Inclua spawn { x, y, z } dentro da grade (0 .. size-1).
- Valide contra public/maps/map.schema.json.
```

---

## Melhorias futuras (backlog documentado)

Ideias alinhadas ao formato atual — implementar incrementando `format` ou `version`:

| Melhoria | Benefício |
|----------|-----------|
| **IDs estáveis por `ref`** | Loader resolve `ref` → id; IA não depende de ordem de PNGs |
| **`format: map-sparse-v2` com chunks** | Regiões 16×16 para mapas enormes sem array gigante |
| **RLE por linha** | `"rows": { "0": { "47": [[42,13],[43,16]] } }` — menos repetitivo |
| **Validação no save** | Rejeitar ids inexistentes, coords fora da grade |
| **Diff/merge para IA** | Patch `{ "add": [...], "remove": [...] }` em vez de reescrever mapa |
| **Export `tile_catalog` versionado** | Hash do registry; mapa referencia `catalogVersion` |
| **Nomes simbólicos** | `"tile": "grass:3"` além de `id` (resolver no load) |
| **Compressão gzip** | `.json.gz` para produção; manter JSON legível no dev |
| **Testes golden-file** | Round-trip serialize → load → serialize para mapas exemplo |

Ao implementar qualquer item, atualizar:

- `public/maps/map.schema.json`
- `MAP_FORMAT_ID` / `getMapCoordSystem()`
- Esta documentação

---

## Referências cruzadas

- [architecture.md](./architecture.md) — visão geral da engine
- [instanced-maps-and-multiplayer.md](./instanced-maps-and-multiplayer.md) — mapas instanciados
- Plano tiles aleatórios: `.cursor/plans/tiles_aleatórios_estilo_tibia_6650291f.plan.md`
