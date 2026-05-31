Vou mapear como os sprites são salvos e referenciados no projeto para definir o que remover e como detectar uso.

Hoje não existe remoção de sprite no Studio — só criar/salvar. A screenshot é do painel Criar Sprites (tiles de mapa). Abaixo está o que o sistema precisaria apagar, como detectar uso e o que fazer quando estiver em uso.

Estado atual
Tipo	Salvar	Remover
Sprite de mapa (Criar Sprites)
POST /api/save-map-sprite
Não existe
Personagem / NPC / Mob
POST /api/save-character
Não existe
Spawn no mapa
JSON do mapa
Sim (borracha SPWN)
Mapa no registry
—
Só remove do registry; não apaga arquivo
O que remover ao excluir um sprite de mapa
Exemplo: grama_20_var_variants em grass-random.

Artefato	Caminho / chave
PNG
tiles/maps/grass-random/grama_20_var_variants.png
Metadados
Entrada em tiles/tile_properties.json → chave grama_20_var_variants
Catálogo
public/tile_catalog.json — regenerado ao recarregar registry (não editar à mão)
Grupo aleatório
public/tile_variant_groups.json se previewTileFileKey apontar para esse arquivo
Auto-borda
auto_border_sets.json + PNGs em tiles/terrain/borders/... (se for tile de borda)
Strip de variantes (20 frames): 1 PNG vira 20 IDs no registry (grama_20_var_variants#0 … #19). Apagar o PNG remove todos de uma vez.

Como verificar se está em uso
A referência estável é o ref / fileKey, não o ID numérico (IDs mudam entre sessões).

flowchart LR
  PNG["grama_20_var_variants.png"]
  Props["tile_properties.json"]
  Registry["tileRegistry fileKey"]
  Maps["public/maps/*.json"]
  Variant["tile_variant_groups.json"]
  PNG --> Props --> Registry
  Registry --> Maps
  Registry --> Variant


1. Varredura nos mapas (principal)
Para cada public/maps/*.json:

Em tileRefs: ref === "grama_20_var_variants" ou ref.startsWith("grama_20_var_variants#")
Em tiles (por andar): mesmo critério no campo ref, ou id se cruzar com o registry atual
Mapas antigos/densos: células com IDs que hoje apontam para esse fileKey
Retorno útil:

meu_mapa.json — 847 células (refs grama_20_var_variants#0…#19)
orc_cave.json — 0 células
2. Grupo de variação aleatória
Se variantGroup: "grass" e o pincel 🎲 usa só esse PNG, apagar quebra a grama aleatória.

Checar:

tile_properties.json → quantos PNGs têm variantGroup: "grass"
public/tile_variant_groups.json → previewTileFileKey
3. Mapa aberto na memória
Antes de apagar, comparar também o worldMap da sessão (pode ter células ainda não salvas).

4. Auto-borda (se aplicável)
Se o tile participa de conjunto de borda (terrainGroup, borderMask, etc.), verificar auto_border_sets.json e tiles irmãos do mesmo conjunto.

Personagem / NPC / Mob (outro fluxo)
Verificar	Onde
Spawn no mapa
MapDocument.spawns[] com name igual ao preset
Catálogo
public/creature_presets.json → configPath
Arquivos
tiles/characters/{categoria}/{nome}.json + .png
O que fazer se estiver em uso
Opção A — Bloquear (recomendado como padrão)
Não é possível excluir "grama_20_var_variants".
Em uso em: meu_mapa.json (847 células).
Remova ou substitua no mapa antes de excluir.
Opção B — Substituir antes de apagar
Escolher tile substituto (ex.: outra grama)
Rodar migração nos mapas: trocar refs/IDs
Salvar mapas
Aí sim apagar PNG + tile_properties
Opção C — Exclusão forçada (só GM avançado)
Apaga arquivos mesmo com uso
Células ficam com tile inválido → engine trata como vazio (-1) ou placeholder rosa
Exige varredura pós-delete nos mapas ou aceitar mapas “quebrados”
Opção D — Arquivar (soft delete)
Mover para tiles/_archive/... em vez de apagar
Sai da paleta, mapas antigos continuam até migrar
API sugerida (quando implementar)
GET  /api/sprite-usage?filename=grama_20_var_variants
     → { maps: [{ mapId, cellCount, refs }], variantGroups, autoBorderSets }
DELETE /api/delete-map-sprite
     ?filename=...&category=grass-random&force=false
Fluxo no UI (painel Criar Sprites):

Botão Excluir sprite
Chamar sprite-usage
Se cellCount > 0 → modal com lista + Cancelar / Substituir… / Forçar (GM)
Se livre → apaga PNG + tile_properties + limpa tile_variant_groups se for o último do grupo
reloadTileRegistry() + refresh paleta
Resumo prático
Pergunta	Resposta
O que apagar?
PNG + entrada em tile_properties.json + referências em variant groups / auto-borda
Como saber se usa?
Escanear public/maps/*.json por ref / fileKey (nome ou nome#0…#N)
Se estiver em uso?
Bloquear, ou substituir nos mapas, ou forçar (com risco de tiles quebrados)
implemente o fluxo completo (API + botão Excluir no painel Criar Sprites)