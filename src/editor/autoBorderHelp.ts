export type TileRoleHelpKey = 'fill' | 'border' | 'neutral';

export const TILE_ROLE_TITLES: Record<TileRoleHelpKey, string> = {
    fill: 'Preenchimento (fill)',
    border: 'Borda (border)',
    neutral: 'Neutro',
};

/** Texto curto exibido conforme o papel selecionado no criador de sprites. */
export const TILE_ROLE_HELP: Record<TileRoleHelpKey, string> = {
    fill:
        'Terreno base que o ADM pinta no mapa (ex.: grama, água). Com auto-borda ligada no editor, o motor pode substituir a célula por um tile de borda quando houver vizinho de outro terreno.',
    border:
        'Arte de transição (ex.: grama encostando na água). Não escolha na paleta com auto-borda ON. Exige conjunto (ex. grass_water) e máscara 0–15; o sistema posiciona sozinho.',
    neutral:
        'Paredes, árvores e decoração. O auto-borda ignora: não vira preenchimento nem recebe borda automática. Use para objetos fora da lógica de terreno.',
};

export function normalizeTileRoleHelpKey(value: string): TileRoleHelpKey {
    if (value === 'border' || value === 'neutral') return value;
    return 'fill';
}

export function getTileRoleHelpText(role: string): string {
    return TILE_ROLE_HELP[normalizeTileRoleHelpKey(role)];
}

/** Bloco HTML estático com os três papéis (para &lt;details&gt; no Studio). */
export function buildAllTileRolesHelpHtml(): string {
    return (['fill', 'border', 'neutral'] as TileRoleHelpKey[])
        .map(
            (key) =>
                `<p style="margin: 0 0 8px;"><strong>${TILE_ROLE_TITLES[key]}</strong> — ${TILE_ROLE_HELP[key]}</p>`
        )
        .join('');
}
