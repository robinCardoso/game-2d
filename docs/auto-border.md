# Auto-Borda (preenchimento inteligente de bordas)

Sistema inspirado no Remere's Map Editor (RME): o ADM pinta apenas o **terreno base** (ex.: grama) e o engine recalcula automaticamente os tiles de **borda** conforme os vizinhos cardinais (N, E, S, W).

## Papéis do tile (na UI do Studio)

Ao criar sprites de terreno, o painel **Auto-borda** explica cada opção:

| Papel | Uso |
|-------|-----|
| **Preenchimento (fill)** | Terreno que o ADM pinta; o motor pode trocar por borda perto de outro terreno |
| **Borda (border)** | Transição (spritesheet 4×4); conjunto + máscara 0–15; não escolher na paleta |
| **Neutro** | Parede, árvore, decoração; auto-borda ignora |

No Studio: texto dinâmico ao mudar o dropdown e seção **Ver os 3 papéis** (Mapa → Pin e Criar → Sprites).

## Conceito rápido

| Bit | Vizinho que conta |
|-----|-------------------|
| 1 | Norte é o terreno vizinho (ex.: água) |
| 2 | Leste |
| 4 | Sul |
| 8 | Oeste |

A **máscara** (0–15) escolhe um dos 16 PNGs do conjunto ativo (ex.: `grass_water`).

## Passo a passo para o ADM

1. **Terreno base** — Studio → Criar → Sprites de mapa: importe `grass_64x64.png`, tipo Terreno. Em **Auto-borda**: marque *Participa do auto-borda*, **Papel = Preenchimento**, **Terreno = grass**. Salve.
2. **Terreno vizinho** — Idem para água: **Papel = Preenchimento**, **Terreno = water**.
3. **Conjunto de bordas** — Studio → Mapa → aba **🌿 Borda**: crie o conjunto (fill `grass`, vizinho `water`), importe spritesheet 4×4 (256×256, tiles 64 px) ou até 16 PNGs, confira a grade 0–15 e clique **Salvar conjunto**.
4. **Calibrar grade** — No calibrador visual, use **Divisão rápida**: informe colunas×linhas (ex. **4×4** para spritesheet de auto-borda) e clique **Aplicar divisão**; o sistema calcula o tamanho de cada frame.
5. **Recarregar** — **🔄 Recarregar tiles** (ou F5) para atualizar a paleta.
6. **Pintar** — Aba **✏️ Pin**: ligue **Auto-borda**, escolha o conjunto e o pincel de grama. Pinte perto da água; as bordas aparecem sozinhas.
7. **Desligar** — Com auto-borda OFF, o comportamento volta ao lápis clássico (sem recálculo).

## Arquivos no projeto

| Arquivo | Função |
|---------|--------|
| `public/auto_border_sets.json` | Manifest global dos conjuntos |
| `tiles/tile_properties.json` | `terrainGroup`, `tileRole`, `borderMask`, etc. |
| `tiles/terrain/borders/<set_id>/` | PNGs de borda por conjunto |
| `src/engine/autoBorder.ts` | Algoritmo de máscara e aplicação |
| `src/engine/autoBorderManifest.ts` | Carrega e resolve nomes → tileId |

## Exemplo incluído: `grass_water`

- Preenchimento: grama (`grass` / `grass_64x64`)
- Vizinho: água (`water` / `water_64x64`)
- Bordas: `tiles/terrain/borders/grass_water/grass_water_mask_0.png` … `_15.png` (arestas azuis indicam o lado que encosta na água)

## API de desenvolvimento

`POST /api/save-auto-border-set` — grava PNGs, `tile_properties.json` e `public/auto_border_sets.json` (somente com `npm run dev`).

## Onde os tiles aparecem (busca / paleta)

Há **dois fluxos** distintos:

| Onde | Como carrega | Quando atualiza |
|------|----------------|-----------------|
| **Criar → Sprites de mapa** | `GET /api/list-map-sprites` → dropdown *Sprites existentes* + datalist de *Subpasta* | Botão *Atualizar lista* ou após *Salvar no Servidor* |
| **Mapa → aba Tile** | `buildTileRegistry()` — Vite inclui todos os PNG em `tiles/**/*.png` | Após salvar sprite (recarrega registro), botão *Recarregar tiles* na aba Borda, ou F5 |

**Importante:** salvar/listar sprites via API só funciona com **`npm run dev`** (middleware Vite). Em `npm run preview` / build estático, `/api/*` retorna 404.

### Categorias na paleta (Pisos, Natureza, …)

A pasta do PNG (ex. `grass`, `water`, `borders/grass_water`) é mapeada para `paletteCategory` em `resolvePaletteCategory()` ([`src/engine/tileRegistry.ts`](../src/engine/tileRegistry.ts)): terrenos e bordas → **Pisos** (`ground`).

### Checklist se algo não aparecer

1. **Criar Sprites:** DevTools → existe `#mapSpriteServerSelect`? Network → `list-map-sprites` com `success: true`?
2. **Paleta do mapa:** aba Tile em **Tudo** — vê tiles? Em **Pisos** — grama/água/bordas devem aparecer.
3. PNG novo não na paleta: F5 ou *Recarregar tiles* (glob do Vite pode exigir reload completo para arquivos novos).
4. Servidor de dev rodando (`npm run dev`, não só preview).

### Pincel (preenchimento) vazio no dropdown

O select lista tiles com **terreno = fill do conjunto** (`grass`, etc.). Entram:

| Origem | Exemplo |
|--------|---------|
| Papel **Preenchimento** no `tile_properties` | `grass_64x64` (PNG precisa existir em `tiles/`) |
| Máscara **0** do conjunto no manifest | `grass_water_mask_0` em `auto_border_sets.json` |

Se só existirem PNGs de **borda** (`grass_water_mask_1`…`_15`) e não houver tile base `grass_64x64`, use a máscara 0 como interior — o manifest de exemplo aponta `"0": "grass_water_mask_0"`.

Após importar PNG ou editar conjunto: **Recarregar tiles** (aba Borda) ou F5. O dropdown é atualizado ao ligar auto-borda, trocar conjunto ou abrir a aba Pin.

**Evitar bugs recorrentes**

1. Todo conjunto precisa resolver a máscara 0 para um PNG real no disco.
2. `terrainGroup` do pincel deve bater com `fillTerrain` do conjunto.
3. Metadados em `tile_properties.json` sem PNG correspondente não criam tile no registro.
4. Ao salvar conjunto, confira no console avisos `[AutoBorder] Tile "…" não encontrado`.

## Referência

Roadmap: [ideas_rme_roadmap.md](../ideas_rme_roadmap.md) (item 5 — Auto-Border).
