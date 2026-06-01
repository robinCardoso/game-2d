# Auto-borda — UI, persistência e motor

> **Escopo:** interface do Studio, persistência de conjuntos (`grass_edges`, etc.) e motor de camadas no mapa (`base` + overlay grama + overlay borda).

## Analogia correta (como ler o mapa)

```text
[ pedra ][ pedra ][ pedra ]     ← borda (filete) desenhada AQUI, sobre a pedra
[ pedra ][ GRAMA  ][ GRAMA  ]     ← fill de grama (overlay) AQUI
[ pedra ][ GRAMA  ][ pedra ]
```

- **Grama** = overlay em cima da pedra (a pedra continua embaixo).
- **Filete** = overlay na **célula de pedra vizinha**, não na grama.
- A **máscara** diz de onde vem a grama vizinha (N=1, E=2, S=4, O=8).
- O PNG da máscara tem **preto = transparente** (só o filete aparece sobre a pedra).

Erro comum: confundir **número do slot** (Col 1, Col 2…) com **número da máscara** (1, 2, 4, 8). Use o preset **4 cardinais** no calibrador.

## Regra central

Ao pintar **grama** com auto-borda ligada, **qualquer célula de chão** (pedra, areia, terra, madeira, etc.) **adjacente** à grama recebe a **máscara de borda por cima**, sem apagar o piso de baixo.

- Um único conjunto de máscaras serve para **todos** os pisos — arte de “filete de grama” genérico sobreposto à base.
- **Não existe** na UI campo “vizinho = pedra / areia / água”.

## Modelo de camadas (motor)

| Camada | Conteúdo | Apagada? |
|--------|----------|----------|
| **Base** (`worldMap`) | Qualquer tile de chão (`paletteCategory: ground`) | Não |
| **Overlay fill** (`layers.grassOverlay`) | Grama pintada | Borracha remove só isto |
| **Overlay borda** (`layers.borderOverlay`) | Máscara do conjunto ativo | Recalculada automaticamente |

Persistência no JSON do mapa: campo `layers` com entradas esparsas `{ z, x, y, id }` por camada.

Módulos: `src/engine/mapPaintLayers.ts`, `src/engine/autoBorderEngine.ts`, `src/engine/terrain.ts` (velocidade com overlay grama).

A borda aparece na **célula de chão vizinha** (cardinal N/E/S/O), não na célula de grama.

**Gatilho:** pincel **Grama aleatório** + toggle **Auto-borda** ON.

## Caso de uso (assets atuais)

| Papel | Asset | Grupo |
|-------|--------|--------|
| Pintura | `grama_20_var_variants` → **Grama aleatório** | `grass` |
| Exemplos de chão | `ground_pedra_variants`, futuros areia/terra… | `stone`, etc. |

Conjunto MVP: **`grass_edges`** — label **“Bordas de grama”**.

## Mapa de IDs (UI)

### Criar Sprites — tipo `border_set`

| ID | Exemplo |
|----|---------|
| `#mapSpriteBorderSetIdInput` | `grass_edges` |
| `#mapSpriteBorderSetLabelInput` | `Bordas de grama` |
| `#mapSpriteFillTerrainInput` | `grass` |
| `#mapSpriteBorderCategoryInput` | `terrain/borders/grass_edges` |
| `#saveMapSpriteBorderSetBtn` | Salvar conjunto (stub) |

**Não criar:** ~~`#mapSpriteNeighborTerrainInput`~~

Lista `#mapSpriteServerSelect`: optgroups **Terreno** / **Itens** (sprites editáveis) + **Conjuntos auto-borda** (`GET /api/list-auto-border-sets`). Máscaras e sheet internos do conjunto **não** aparecem na lista de sprites — só o conjunto agregado.

### Calibrador — modo `borderSet`

| ID | Função |
|----|--------|
| `#calibratorBorderSetPanel` | Painel do modo borda |
| `#calBorderSetBadge` | Badge `grama → chão` |
| `#calBorderPreset3x3` / `#calBorderPreset4x4` | Presets de grade |
| `#calBorderCellList` | Máscaras 0–15 por célula |
| `#calBorderConfirmBtn` | Confirmar calibração do conjunto |

Módulo: `src/editor/borderSetCalibratorUi.ts`.

### Aba Pin

| ID | Função |
|----|--------|
| `#autoBorderToolbar` | Container |
| `#autoBorderEnabledToggle` | Liga/desliga |
| `#autoBorderSetSelect` | Conjunto ativo |
| `#autoBorderPaintHint` | Hint “qualquer chão vizinho” |
| `#autoBorderRecalcFloorBtn` | Recalcular andar |

### Aba Tile

| ID | Função |
|----|--------|
| `#tileAutoBorderStatusChip` | Ex.: `Auto-borda: Bordas de grama` |

Módulo: `src/editor/autoBorderUi.ts` — carrega conjuntos via `GET /api/list-auto-border-sets`, smart default ao selecionar pincel `grass`.

## Fluxo ADM

1. **Criar Sprites** → tipo **Conjunto auto-borda** → preencher `grass_edges`, fill `grass`.
2. Carregar PNG → **Calibrar grade** → atribuir máscaras 0–15 → **Confirmar conjunto**.
3. **Salvar conjunto** → grava sheet + PNGs por máscara + `public/auto_border_sets.json` + `tile_properties.json`.
4. No mapa: pintar **qualquer chão** como base.
5. **Pin** → Auto-borda ON (ou ligar automaticamente ao escolher Grama 🎲).
6. **Tile** → **Grama aleatório** → pintar.
7. Motor: overlay grama na célula pintada; em todo chão vizinho elegível, overlay borda — sem config extra. Botão **Recalcular andar** refaz o andar atual.

## Detecção de vizinho (motor)

```text
Para cada célula (x,y) com overlay grama:
  Para cada vizinho cardinal (cx,cy):
    Se célula tem base chão (ground, walkable típico)
    E NÃO tem overlay grama
    → aplicar borderOverlayId do conjunto grass_edges (máscara por bits N/E/S/O)
```

Sem comparar `variantGroup` stone vs sand — só “é chão” vs “tem grama ao lado”.

## Fora de escopo (UI atual)

- Aba Borda dedicada no mapa
- Tiles de borda na paleta Tile
- Conjuntos separados por tipo de chão (`grass_stone`, `grass_sand`, …) — backlog

## Ver também

- [ui-menus.md](./ui-menus.md) — mapa de painéis e IDs estáveis
- [studio-improvements-log.md](./studio-improvements-log.md) — histórico de melhorias do Studio
