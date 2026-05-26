# UI do editor — menus e painéis

## Comportamento

1. **Menu superior** — ações rápidas e dropdowns (Arquivo, Editar, Ver…).
2. **Pílulas** (Pintar, Tiles, Andar) — abrem o **flyout** lateral; segundo clique fecha.
3. **Flyout** — um painel por vez, ~300px; mapa ocupa o resto da tela.
4. **Barra de status** — posição, Z, speed sempre visíveis (sem abrir painel).
5. **Esc** — fecha flyout.

## Adicionar opção futura

| Tipo | Onde |
|------|------|
| Ação única (export, etc.) | `index.html` → dropdown em Arquivo/Editar |
| Painel com formulário | Nova `<section class="flyout-section" data-panel="meuId">` + `menu-pill` ou item em dropdown com `data-open-panel="meuId"` |
| Menu com 1 só opção | Preferir `menu-pill` direto (ex.: Conta) em vez de dropdown com 1 item |
| Registro de título | `menuBar.ts` → `PANEL_TITLES` |
| Atalho que abre painel | `data-open-panel="meuId"` no botão |

## IDs estáveis (não renomear sem atualizar `main.ts`)

`exportBtn`, `importMapBtn`, `tileSelector`, `floorSelector`, `roleSelector`, `collisionToggle`, `boatToggle`, `posX`…`posZ`, dev buttons.

## Player vs GM

Elementos com `data-requires-edit="true"` somem quando cargo = Player (`setEditorMenusVisible`).
