# Auto-borda — UI e fluxo ADM

> **Escopo deste documento:** interface do Studio (Criar Sprites, calibrador, Pin, Tile). O motor de camadas no mapa (`baseId` + overlay + border overlay) é fase futura.

## Regra central

Ao pintar **grama** com auto-borda ligada, **qualquer célula de chão** (pedra, areia, terra, madeira, etc.) **adjacente** à grama recebe a **máscara de borda por cima**, sem apagar o piso de baixo.

- Um único conjunto de máscaras serve para **todos** os pisos — arte de “filete de grama” genérico sobreposto à base.
- **Não existe** na UI campo “vizinho = pedra / areia / água”.

## Modelo de camadas (referência para o motor)

| Camada | Conteúdo | Apagada? |
|--------|----------|----------|
| **Base** | Qualquer tile de chão (`paletteCategory: ground`) | Não |
| **Overlay fill** | Grama pintada | Borracha remove só isto |
| **Overlay borda** | Máscara do conjunto `grass_edges` | Recalculada automaticamente |

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

Lista `#mapSpriteServerSelect`: optgroups **Sprites** | **Conjuntos auto-borda** (quando API existir).

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
| `#autoBorderRecalcFloorBtn` | Recalcular andar (disabled) |

### Aba Tile

| ID | Função |
|----|--------|
| `#tileAutoBorderStatusChip` | Ex.: `Auto-borda: Bordas de grama` |

Módulo: `src/editor/autoBorderUi.ts` — mock `grass_edges`, smart default ao selecionar pincel `grass`.

## Fluxo ADM

1. **Criar Sprites** → tipo **Conjunto auto-borda** → preencher `grass_edges`, fill `grass`.
2. Carregar PNG → **Calibrar grade** → atribuir máscaras 0–15 → **Confirmar conjunto**.
3. **Salvar conjunto** (UI stub; persistência via API futura).
4. No mapa: pintar **qualquer chão** como base.
5. **Pin** → Auto-borda ON (ou ligar automaticamente ao escolher Grama 🎲).
6. **Tile** → **Grama aleatório** → pintar.
7. Motor (futuro): overlay grama; em todo chão vizinho elegível, overlay borda — sem config extra.

## Detecção de vizinho (motor — referência)

```text
Para cada célula (x,y) com overlay grama:
  Para cada vizinho cardinal (cx,cy):
    Se célula tem base chão (ground, walkable típico)
    E NÃO tem overlay grama
    → aplicar borderOverlayId do conjunto grass_edges (máscara por bits N/E/S/O)
```

Sem comparar `variantGroup` stone vs sand — só “é chão” vs “tem grama ao lado”.

## Fora de escopo (UI atual)

- Campo “terreno vizinho” na UI ou JSON editável pelo ADM
- Conjuntos separados `grass_stone`, `grass_sand`, … (backlog)
- Aba Borda dedicada no mapa
- Tiles de borda na paleta Tile
- Camadas no `worldMap` (1 id/célula hoje)

## Ver também

- [ui-menus.md](./ui-menus.md) — mapa de painéis e IDs estáveis
- [studio-improvements-log.md](./studio-improvements-log.md) — histórico de melhorias do Studio
