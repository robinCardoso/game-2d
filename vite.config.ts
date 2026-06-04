import { defineConfig } from 'vite';
import fs from 'fs';
import path from 'path';

const MAX_MAP_SAVE_BYTES = 20 * 1024 * 1024;

interface GameConfig {
  charactersDir: string;
  mapsDir: string;
  tilesDir: string;
}

function getGameConfig(): GameConfig {
  const configPath = path.resolve(__dirname, 'game_config.json');
  if (fs.existsSync(configPath)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      return {
        charactersDir: parsed.charactersDir || 'tiles/characters',
        mapsDir: parsed.mapsDir || 'public/maps',
        tilesDir: parsed.tilesDir || 'tiles'
      };
    } catch (e) {
      console.error('[Config] Erro ao ler game_config.json, usando padrão:', e);
    }
  }
  return {
    charactersDir: 'tiles/characters',
    mapsDir: 'public/maps',
    tilesDir: 'tiles'
  };
}

function sanitizeMapSaveFilename(filename: unknown): string | null {
  if (typeof filename !== 'string') return null;
  const base = filename.replace(/^.*[/\\]/, '').trim().toLowerCase();
  const withExt = base.endsWith('.json') ? base : `${base}.json`;
  const id = withExt.slice(0, -5);
  if (!id || !/^[a-z0-9_-]+$/.test(id)) return null;
  return withExt;
}

/** Copia campos de calibração da grade para tile_properties.json. */
function mergeMapSpriteCalibrationEntry(
  entry: Record<string, unknown>,
  properties: Record<string, unknown> | undefined
): void {
  if (!properties) return;
  const intFields = [
    'frameWidth',
    'frameHeight',
    'offsetX',
    'offsetY',
    'gapX',
    'gapY',
    'gridCols',
    'gridRows',
  ] as const;
  for (const key of intFields) {
    const v = properties[key];
    if (typeof v === 'number' && Number.isFinite(v)) {
      entry[key] = Math.floor(v);
    }
  }
  const layout = properties.sheetLayout;
  if (layout === 'horizontal' || layout === 'vertical') {
    entry.sheetLayout = layout;
  }
}

function sanitizeMapSpriteFilename(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const cleaned = raw.trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
  return cleaned.length > 0 ? cleaned : null;
}

function sanitizeMapSpriteSubPath(category: unknown): string {
  if (!category) return '';
  let sanitizedCategory = String(category)
    .replace(/[^a-zA-Z0-9_\-\/]/g, '')
    .replace(/\.\./g, '');
  sanitizedCategory = sanitizedCategory
    .replace(/^(tiles\/)?(maps|terrain|items)\//i, '')
    .replace(/^(tiles\/)?(maps|terrain|items)$/i, '');
  return sanitizedCategory;
}

function getAutoBorderSetsPath(): string {
  return path.resolve(__dirname, 'public/auto_border_sets.json');
}

function readAutoBorderManifest(): { version: number; sets: Record<string, unknown> } {
  const manifestPath = getAutoBorderSetsPath();
  if (!fs.existsSync(manifestPath)) {
    return { version: 1, sets: {} };
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(manifestPath, 'utf-8')) as {
      version?: number;
      sets?: Record<string, unknown>;
    };
    return { version: parsed.version ?? 1, sets: parsed.sets ?? {} };
  } catch {
    return { version: 1, sets: {} };
  }
}

function writeAutoBorderManifest(data: { version: number; sets: Record<string, unknown> }): void {
  fs.writeFileSync(getAutoBorderSetsPath(), JSON.stringify(data, null, 2));
}

function writePngBase64(targetPath: string, spriteBase64: string): void {
  if (!spriteBase64.startsWith('data:image/png;base64,')) return;
  const imageBuffer = Buffer.from(spriteBase64.replace(/^data:image\/png;base64,/, ''), 'base64');
  fs.writeFileSync(targetPath, imageBuffer);
}

function borderSetManifestToListEntry(setId: string, entry: Record<string, unknown>) {
  const category = String(entry.category ?? '');
  const sheetFile = String(entry.sheetFile ?? `${setId}_sheet`);
  const sheetRelativePath = category
    ? `tiles/maps/${category}/${sheetFile}.png`
    : `tiles/maps/${sheetFile}.png`;
  return {
    id: setId,
    label: String(entry.label ?? setId),
    fillTerrain: String(entry.fillTerrain ?? 'grass'),
    category,
    sheetFile,
    sheetRelativePath,
    calibration: entry.calibration ?? {},
    cells: entry.cells ?? [],
    masks: entry.masks ?? {},
    walkable: entry.walkable !== false, // Padrão true
  };
}

function getBorderSetManifestEntry(setId: string): Record<string, unknown> | null {
  const manifest = readAutoBorderManifest();
  const entry = manifest.sets[setId];
  return entry && typeof entry === 'object' ? (entry as Record<string, unknown>) : null;
}

function collectBorderSetFilenames(setId: string): string[] {
  const entry = getBorderSetManifestEntry(setId);
  const filenames = new Set<string>();
  if (entry) {
    filenames.add(String(entry.sheetFile ?? `${setId}_sheet`));
    const masks = (entry.masks ?? {}) as Record<string, string>;
    for (const filename of Object.values(masks)) {
      if (filename) filenames.add(filename);
    }
  }

  const propertiesPath = path.resolve(__dirname, 'tiles/tile_properties.json');
  if (fs.existsSync(propertiesPath)) {
    try {
      const props = JSON.parse(fs.readFileSync(propertiesPath, 'utf-8')) as Record<
        string,
        { borderSetId?: string }
      >;
      for (const [key, val] of Object.entries(props)) {
        if (val?.borderSetId === setId) filenames.add(key);
      }
    } catch {
      // ignore
    }
  }

  return [...filenames];
}

function collectBorderSetUsage(setId: string): {
  setId: string;
  label: string;
  maps: Array<{ mapId: string; mapFile: string; cellCount: number }>;
  totalCells: number;
} {
  const entry = getBorderSetManifestEntry(setId);
  const label = entry ? String(entry.label ?? setId) : setId;
  const filenames = collectBorderSetFilenames(setId);
  const filenameSet = new Set(filenames);
  const maps: Array<{ mapId: string; mapFile: string; cellCount: number }> = [];
  let totalCells = 0;

  if (filenameSet.size === 0) {
    return { setId, label, maps, totalCells };
  }

  const mapsDir = path.resolve(__dirname, 'public/maps');
  if (!fs.existsSync(mapsDir)) {
    return { setId, label, maps, totalCells };
  }

  const countRef = (
    ref: unknown,
    id: unknown,
    tileRefs: Record<string, { ref?: string }> | undefined,
    add: () => void
  ): void => {
    if (typeof ref === 'string') {
      for (const filename of filenameSet) {
        if (refMatchesMapSprite(ref, filename)) {
          add();
          return;
        }
      }
    }
    if (id !== undefined && tileRefs) {
      const fromCatalog = tileRefs[String(id)]?.ref;
      if (typeof fromCatalog === 'string') {
        for (const filename of filenameSet) {
          if (refMatchesMapSprite(fromCatalog, filename)) {
            add();
            return;
          }
        }
      }
    }
  };

  for (const mapFile of fs.readdirSync(mapsDir).filter((f) => f.endsWith('.json'))) {
    try {
      const content = JSON.parse(fs.readFileSync(path.join(mapsDir, mapFile), 'utf-8'));
      let cellCount = 0;
      const tileRefs = content.tileRefs as Record<string, { ref?: string }> | undefined;

      const bump = () => {
        cellCount++;
      };

      const scanTileEntries = (entries: unknown): void => {
        if (!Array.isArray(entries)) return;
        for (const entryItem of entries) {
          if (Array.isArray(entryItem) && entryItem.length >= 3) {
            countRef(undefined, entryItem[2], tileRefs, bump);
          } else if (entryItem && typeof entryItem === 'object') {
            const obj = entryItem as { ref?: string; id?: number };
            countRef(obj.ref, obj.id, tileRefs, bump);
          }
        }
      };

      if (content.tiles && typeof content.tiles === 'object') {
        for (const entries of Object.values(content.tiles as Record<string, unknown>)) {
          scanTileEntries(entries);
        }
      }

      if (Array.isArray(content.sparseTiles)) {
        for (const sparseEntry of content.sparseTiles) {
          if (!Array.isArray(sparseEntry) || sparseEntry.length < 4) continue;
          countRef(undefined, sparseEntry[3], tileRefs, bump);
        }
      }

      const layers = content.layers as
        | { grass?: Record<string, unknown>; border?: Record<string, unknown> }
        | undefined;
      if (layers?.border && typeof layers.border === 'object') {
        for (const entries of Object.values(layers.border)) {
          scanTileEntries(entries);
        }
      }

      if (cellCount > 0) {
        maps.push({
          mapId: typeof content.mapId === 'string' ? content.mapId : mapFile.replace(/\.json$/, ''),
          mapFile,
          cellCount,
        });
        totalCells += cellCount;
      }
    } catch (err) {
      console.warn(`[Vite Backend] Erro ao escanear mapa ${mapFile} (border-set):`, err);
    }
  }

  return { setId, label, maps, totalCells };
}

function deleteBorderSetFromDisk(setId: string): {
  deletedFiles: string[];
  removedProperties: string[];
} {
  const entry = getBorderSetManifestEntry(setId);
  if (!entry) {
    throw new Error(`Conjunto auto-borda "${setId}" não encontrado.`);
  }

  const category = String(entry.category ?? '');
  const targetDir = path.resolve(__dirname, 'tiles/maps', category);
  const sheetFile = String(entry.sheetFile ?? `${setId}_sheet`);
  const masks = (entry.masks ?? {}) as Record<string, string>;
  const filenames = new Set<string>([sheetFile, ...Object.values(masks)]);

  const propertiesPath = path.resolve(__dirname, 'tiles/tile_properties.json');
  let allProperties: Record<string, unknown> = {};
  if (fs.existsSync(propertiesPath)) {
    allProperties = JSON.parse(fs.readFileSync(propertiesPath, 'utf-8'));
    for (const [key, val] of Object.entries(allProperties)) {
      if ((val as { borderSetId?: string })?.borderSetId === setId) {
        filenames.add(key);
      }
    }
  }

  const deletedFiles: string[] = [];
  for (const filename of filenames) {
    const pngPath = path.resolve(targetDir, `${filename}.png`);
    if (fs.existsSync(pngPath)) {
      fs.unlinkSync(pngPath);
      deletedFiles.push(pngPath);
    }
  }

  const removedProperties: string[] = [];
  for (const filename of filenames) {
    if (allProperties[filename]) {
      delete allProperties[filename];
      removedProperties.push(filename);
    }
  }
  if (removedProperties.length > 0) {
    fs.writeFileSync(propertiesPath, JSON.stringify(allProperties, null, 2));
  }

  const manifest = readAutoBorderManifest();
  delete manifest.sets[setId];
  writeAutoBorderManifest(manifest);

  if (fs.existsSync(targetDir)) {
    try {
      const remaining = fs.readdirSync(targetDir);
      if (remaining.length === 0) {
        fs.rmdirSync(targetDir);
      }
    } catch {
      // ignore
    }
  }

  return { deletedFiles, removedProperties };
}

function refMatchesMapSprite(ref: string, filename: string): boolean {
  return ref === filename || ref.startsWith(`${filename}#`);
}

function collectCharacterUsage(relativePath: string): {
  relativePath: string;
  presetName: string | null;
  maps: Array<{ mapId: string; mapFile: string; spawnCount: number }>;
  totalSpawns: number;
} {
  const config = getGameConfig();
  const configPath = `${config.charactersDir}/${relativePath}`.replace(/\\/g, '/');

  let presetName: string | null = null;
  const presetsPath = path.resolve(__dirname, 'public/creature_presets.json');
  if (fs.existsSync(presetsPath)) {
    try {
      const presets = JSON.parse(fs.readFileSync(presetsPath, 'utf-8'));
      if (Array.isArray(presets)) {
        const found = presets.find((p) => p && typeof p === 'object' && p.configPath === configPath);
        if (found) {
          presetName = found.name;
        }
      }
    } catch (e) {
      console.warn('[Vite Backend] Erro ao ler creature_presets.json:', e);
    }
  }

  const maps: Array<{ mapId: string; mapFile: string; spawnCount: number }> = [];
  let totalSpawns = 0;

  if (presetName) {
    const mapsDir = path.resolve(__dirname, 'public/maps');
    if (fs.existsSync(mapsDir)) {
      for (const mapFile of fs.readdirSync(mapsDir).filter((f) => f.endsWith('.json'))) {
        try {
          const content = JSON.parse(fs.readFileSync(path.join(mapsDir, mapFile), 'utf-8'));
          let spawnCount = 0;
          if (Array.isArray(content.spawns)) {
            for (const spawn of content.spawns) {
              if (spawn && spawn.name === presetName) {
                spawnCount++;
              }
            }
          }
          if (spawnCount > 0) {
            maps.push({
              mapId: typeof content.mapId === 'string' ? content.mapId : mapFile.replace(/\.json$/, ''),
              mapFile,
              spawnCount,
            });
            totalSpawns += spawnCount;
          }
        } catch (err) {
          console.warn(`[Vite Backend] Erro ao escanear spawns em ${mapFile}:`, err);
        }
      }
    }
  }

  return { relativePath, presetName, maps, totalSpawns };
}

function collectMapSpriteUsage(filename: string): {
  filename: string;
  maps: Array<{ mapId: string; mapFile: string; cellCount: number }>;
  totalCells: number;
  variantGroups: string[];
  isPreviewTile: boolean;
} {
  const mapsDir = path.resolve(__dirname, 'public/maps');
  const maps: Array<{ mapId: string; mapFile: string; cellCount: number }> = [];
  let totalCells = 0;

  if (fs.existsSync(mapsDir)) {
    for (const mapFile of fs.readdirSync(mapsDir).filter((f) => f.endsWith('.json'))) {
      try {
        const content = JSON.parse(fs.readFileSync(path.join(mapsDir, mapFile), 'utf-8'));
        let cellCount = 0;
        const tileRefs = content.tileRefs as Record<string, { ref?: string }> | undefined;

        const countRef = (ref: unknown, id?: unknown): void => {
          if (typeof ref === 'string' && refMatchesMapSprite(ref, filename)) {
            cellCount++;
            return;
          }
          if (id !== undefined && tileRefs) {
            const fromCatalog = tileRefs[String(id)]?.ref;
            if (typeof fromCatalog === 'string' && refMatchesMapSprite(fromCatalog, filename)) {
              cellCount++;
            }
          }
        };

        if (content.tiles && typeof content.tiles === 'object') {
          for (const entries of Object.values(content.tiles as Record<string, unknown>)) {
            if (!Array.isArray(entries)) continue;
            for (const entry of entries) {
              if (Array.isArray(entry) && entry.length >= 3) {
                countRef(undefined, entry[2]);
              } else if (entry && typeof entry === 'object') {
                const obj = entry as { ref?: string; id?: number };
                countRef(obj.ref, obj.id);
              }
            }
          }
        }

        if (Array.isArray(content.sparseTiles)) {
          for (const entry of content.sparseTiles) {
            if (!Array.isArray(entry) || entry.length < 4) continue;
            countRef(undefined, entry[3]);
          }
        }

        if (cellCount > 0) {
          maps.push({
            mapId: typeof content.mapId === 'string' ? content.mapId : mapFile.replace(/\.json$/, ''),
            mapFile,
            cellCount,
          });
          totalCells += cellCount;
        }
      } catch (err) {
        console.warn(`[Vite Backend] Erro ao escanear mapa ${mapFile}:`, err);
      }
    }
  }

  const variantGroups: string[] = [];
  let isPreviewTile = false;
  const variantGroupsPath = path.resolve(__dirname, 'public/tile_variant_groups.json');
  if (fs.existsSync(variantGroupsPath)) {
    try {
      const vg = JSON.parse(fs.readFileSync(variantGroupsPath, 'utf-8'));
      for (const [groupKey, group] of Object.entries(vg.groups ?? {})) {
        const preview = (group as { previewTileFileKey?: string }).previewTileFileKey;
        if (preview === filename) {
          variantGroups.push(groupKey);
          isPreviewTile = true;
        }
      }
    } catch (err) {
      console.warn('[Vite Backend] Erro ao ler tile_variant_groups.json:', err);
    }
  }

  const propertiesPath = path.resolve(__dirname, 'tiles/tile_properties.json');
  if (fs.existsSync(propertiesPath)) {
    try {
      const props = JSON.parse(fs.readFileSync(propertiesPath, 'utf-8'));
      const group = props[filename]?.variantGroup;
      if (typeof group === 'string' && group.trim() && !variantGroups.includes(group.trim())) {
        variantGroups.push(group.trim());
      }
    } catch {
      // ignore
    }
  }

  return { filename, maps, totalCells, variantGroups, isPreviewTile };
}

function findMapSpritePngPath(filename: string, category?: string): string | null {
  const mapsDir = path.resolve(__dirname, 'tiles/maps');
  if (category) {
    const direct = path.resolve(mapsDir, category, `${filename}.png`);
    if (fs.existsSync(direct)) return direct;
  }

  function walk(dir: string): string | null {
    if (!fs.existsSync(dir)) return null;
    for (const entry of fs.readdirSync(dir)) {
      const full = path.join(dir, entry);
      if (fs.statSync(full).isDirectory()) {
        const nested = walk(full);
        if (nested) return nested;
      } else if (entry === `${filename}.png`) {
        return full;
      }
    }
    return null;
  }

  return walk(mapsDir);
}

function updateVariantGroupsAfterSpriteDelete(filename: string): void {
  const variantGroupsPath = path.resolve(__dirname, 'public/tile_variant_groups.json');
  if (!fs.existsSync(variantGroupsPath)) return;

  const vg = JSON.parse(fs.readFileSync(variantGroupsPath, 'utf-8'));
  const groups = (vg.groups ?? {}) as Record<string, { previewTileFileKey?: string; label?: string }>;
  const propertiesPath = path.resolve(__dirname, 'tiles/tile_properties.json');
  const props: Record<string, { variantGroup?: string }> = fs.existsSync(propertiesPath)
    ? JSON.parse(fs.readFileSync(propertiesPath, 'utf-8'))
    : {};

  for (const [groupKey, group] of Object.entries(groups)) {
    if (group.previewTileFileKey !== filename) continue;

    const remaining = Object.entries(props)
      .filter(([key, val]) => key !== filename && val?.variantGroup === groupKey)
      .map(([key]) => key);

    if (remaining.length === 0) {
      delete groups[groupKey];
    } else {
      group.previewTileFileKey = remaining[0];
    }
  }

  vg.groups = groups;
  fs.writeFileSync(variantGroupsPath, JSON.stringify(vg, null, 2));
}

function getJsonFiles(dir: string, filesList: string[] = []): string[] {
  if (!fs.existsSync(dir)) return filesList;
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const name = path.join(dir, file);
    if (fs.statSync(name).isDirectory()) {
      getJsonFiles(name, filesList);
    } else if (file.endsWith('.json')) {
      filesList.push(name);
    }
  }
  return filesList;
}

function getSubdirectories(dir: string, baseDir: string, foldersList: string[] = []): string[] {
  if (!fs.existsSync(dir)) return foldersList;
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const name = path.join(dir, file);
    if (fs.statSync(name).isDirectory()) {
      const relative = path.relative(baseDir, name).replace(/\\/g, '/');
      foldersList.push(relative);
      getSubdirectories(name, baseDir, foldersList);
    }
  }
  return foldersList;
}

export default defineConfig({
  build: {
    target: 'es2022',
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'index.html'),
        studio: path.resolve(__dirname, 'studio.html'),
        play: path.resolve(__dirname, 'play.html'),
        login: path.resolve(__dirname, 'login.html'),
        register: path.resolve(__dirname, 'register.html'),
        characters: path.resolve(__dirname, 'characters.html'),
        charactersNew: path.resolve(__dirname, 'characters-new.html'),
        terms: path.resolve(__dirname, 'terms.html'),
        privacy: path.resolve(__dirname, 'privacy.html'),
      },
    },
  },
  plugins: [
    {
      name: 'local-saving-backend',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          let reqPath = '';
          let reqSearch = new URLSearchParams();
          if (req.url) {
            try {
              const parsed = new URL(req.url, 'http://localhost');
              reqPath = parsed.pathname;
              reqSearch = parsed.searchParams;
            } catch {
              reqPath = req.url.split('?')[0] ?? '';
            }
          }

          if (reqPath === '/api/sprite-usage' && req.method === 'GET') {
            try {
              const filename = sanitizeMapSpriteFilename(reqSearch.get('filename'));
              if (!filename) {
                res.statusCode = 400;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: 'Parâmetro filename inválido.' }));
                return;
              }
              const usage = collectMapSpriteUsage(filename);
              res.statusCode = 200;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify(usage));
            } catch (err: unknown) {
              const message = err instanceof Error ? err.message : String(err);
              console.error('[Vite Backend] Erro em sprite-usage:', err);
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: message }));
            }
            return;
          }

          if (reqPath === '/api/delete-map-sprite' && req.method === 'DELETE') {
            try {
              const filename = sanitizeMapSpriteFilename(reqSearch.get('filename'));
              if (!filename) {
                res.statusCode = 400;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: 'Parâmetro filename inválido.' }));
                return;
              }
              const category = String(reqSearch.get('category') ?? '')
                .replace(/[^a-zA-Z0-9_\-/]/g, '')
                .replace(/\.\./g, '');
              const force = reqSearch.get('force') === 'true';

              const usage = collectMapSpriteUsage(filename);
              if (!force && usage.totalCells > 0) {
                res.statusCode = 409;
                res.setHeader('Content-Type', 'application/json');
                res.end(
                  JSON.stringify({
                    error: `Sprite em uso em ${usage.maps.length} mapa(s).`,
                    maps: usage.maps,
                    totalCells: usage.totalCells,
                  })
                );
                return;
              }

              const pngPath = findMapSpritePngPath(filename, category || undefined);
              if (pngPath && fs.existsSync(pngPath)) {
                fs.unlinkSync(pngPath);
                console.log(`[Vite Backend] PNG removido: ${pngPath}`);
              }

              const propertiesPath = path.resolve(__dirname, 'tiles/tile_properties.json');
              if (fs.existsSync(propertiesPath)) {
                const allProperties = JSON.parse(fs.readFileSync(propertiesPath, 'utf-8'));
                if (allProperties[filename]) {
                  delete allProperties[filename];
                  fs.writeFileSync(propertiesPath, JSON.stringify(allProperties, null, 2));
                  console.log(`[Vite Backend] tile_properties: removido "${filename}"`);
                }
              }

              updateVariantGroupsAfterSpriteDelete(filename);

              res.statusCode = 200;
              res.setHeader('Content-Type', 'application/json');
              res.end(
                JSON.stringify({
                  success: true,
                  filename,
                  deletedPng: pngPath ?? null,
                  variantGroups: usage.variantGroups,
                })
              );
            } catch (err: unknown) {
              const message = err instanceof Error ? err.message : String(err);
              console.error('[Vite Backend] Erro ao excluir sprite:', err);
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: message }));
            }
            return;
          }
          if (reqPath === '/api/delete-character' && req.method === 'DELETE') {
            try {
              const relativePath = reqSearch.get('relativePath') ?? '';
              const force = reqSearch.get('force') === 'true';

              if (!relativePath || relativePath.includes('..')) {
                res.statusCode = 400;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: 'Parâmetro relativePath inválido.' }));
                return;
              }

              const config = getGameConfig();
              const jsonPath = path.resolve(__dirname, config.charactersDir, relativePath);
              
              if (!fs.existsSync(jsonPath)) {
                res.statusCode = 404;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: 'Personagem não encontrado.' }));
                return;
              }

              const usage = collectCharacterUsage(relativePath);
              if (!force && usage.totalSpawns > 0) {
                res.statusCode = 409;
                res.setHeader('Content-Type', 'application/json');
                res.end(
                  JSON.stringify({
                    error: `Personagem em uso em ${usage.maps.length} mapa(s).`,
                    maps: usage.maps,
                    totalSpawns: usage.totalSpawns,
                  })
                );
                return;
              }

              // Lê o JSON para extrair o spriteSheetUrl
              let spriteSheetUrl: string | undefined;
              try {
                const charConfig = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
                spriteSheetUrl = charConfig.spriteSheetUrl;
              } catch (e) {
                console.warn('[Vite Backend] Erro ao ler JSON para extrair spritesheet:', e);
              }

              // Se a spritesheet for um arquivo local na pasta de personagens, exclui também
              if (spriteSheetUrl && typeof spriteSheetUrl === 'string') {
                const cleanBase = config.charactersDir.replace(/\/+$/, '');
                if (spriteSheetUrl.startsWith(cleanBase + '/')) {
                  const pngPath = path.resolve(__dirname, spriteSheetUrl);
                  if (fs.existsSync(pngPath)) {
                    fs.unlinkSync(pngPath);
                    console.log(`[Vite Backend] PNG do personagem removido: ${pngPath}`);
                  }
                }
              }

              // Exclui o arquivo JSON de configuração
              fs.unlinkSync(jsonPath);
              console.log(`[Vite Backend] JSON do personagem removido: ${jsonPath}`);

              // Remove do arquivo de presets
              const presetsPath = path.resolve(__dirname, 'public/creature_presets.json');
              if (fs.existsSync(presetsPath) && usage.presetName) {
                try {
                  const presets = JSON.parse(fs.readFileSync(presetsPath, 'utf-8'));
                  if (Array.isArray(presets)) {
                    const filtered = presets.filter((p) => !p || p.name !== usage.presetName);
                    fs.writeFileSync(presetsPath, JSON.stringify(filtered, null, 2) + '\n');
                    console.log(`[Vite Backend] Preset de criatura removido: ${usage.presetName}`);
                  }
                } catch (e) {
                  console.warn('[Vite Backend] Erro ao atualizar creature_presets.json:', e);
                }
              }

              // Remove do arquivo de outfit presets também
              const outfitPresetsPath = path.resolve(__dirname, 'public/outfit_presets.json');
              if (fs.existsSync(outfitPresetsPath)) {
                try {
                  const presets = JSON.parse(fs.readFileSync(outfitPresetsPath, 'utf-8'));
                  if (Array.isArray(presets)) {
                    const presetId = relativePath.split('/').pop()?.replace(/\.json$/, '');
                    if (presetId) {
                      const filtered = presets.filter((p) => !p || p.id !== presetId);
                      fs.writeFileSync(outfitPresetsPath, JSON.stringify(filtered, null, 2) + '\n');
                      console.log(`[Vite Backend] Outfit preset removido: ${presetId}`);
                    }
                  }
                } catch (e) {
                  console.warn('[Vite Backend] Erro ao atualizar outfit_presets.json:', e);
                }
              }

              res.statusCode = 200;
              res.setHeader('Content-Type', 'application/json');
              res.end(
                JSON.stringify({
                  success: true,
                  relativePath,
                  deletedJson: jsonPath,
                  deletedPng: spriteSheetUrl || null,
                  presetRemoved: usage.presetName || null,
                })
              );
            } catch (err: unknown) {
              const message = err instanceof Error ? err.message : String(err);
              console.error('[Vite Backend] Erro ao excluir personagem:', err);
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: message }));
            }
            return;
          }

          // Redireciona o erro de digitação clássico de 'stucio.html' para 'studio.html'
          if (req.url && req.url.toLowerCase().startsWith('/stucio.html')) {
            res.statusCode = 302;
            res.setHeader('Location', '/studio.html');
            res.end();
            return;
          }

          if (req.url === '/api/list-maps' && req.method === 'GET') {
            try {
              const mapsDir = path.resolve(__dirname, 'public/maps');
              const entries = fs.existsSync(mapsDir)
                ? fs
                    .readdirSync(mapsDir)
                    .filter((f) => f.endsWith('.json'))
                    .map((f) => ({
                      name: f,
                      mtime: fs.statSync(path.join(mapsDir, f)).mtimeMs,
                    }))
                    .sort((a, b) => b.mtime - a.mtime)
                : [];
              const files = entries.map((e) => e.name);
              const latest = entries[0]?.name ?? null;

              res.statusCode = 200;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ success: true, files, latest }));
            } catch (err: any) {
              console.error('[Vite Backend] Erro ao listar mapas:', err);
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: err.message }));
            }
          } else if (req.url === '/api/list-characters' && req.method === 'GET') {
            try {
              const config = getGameConfig();
              const charactersDir = path.resolve(__dirname, config.charactersDir);
              const jsonFiles = getJsonFiles(charactersDir);
              const folders = getSubdirectories(charactersDir, charactersDir);
              const characters = jsonFiles.map(filePath => {
                const content = fs.readFileSync(filePath, 'utf-8');
                const config = JSON.parse(content);
                const relativePath = path.relative(charactersDir, filePath).replace(/\\/g, '/');
                return {
                  name: config.name || path.basename(filePath, '.json'),
                  category: config.category || '',
                  relativePath: relativePath,
                  config: config
                };
              });

              res.statusCode = 200;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ success: true, characters, folders }));
            } catch (err: any) {
              console.error('[Vite Backend] Erro ao listar personagens:', err);
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: err.message }));
            }
          } else if (req.url === '/api/list-map-sprites' && req.method === 'GET') {
            try {
              const tilesDir = path.resolve(__dirname, 'tiles');
              const mapsTilesDir = path.resolve(tilesDir, 'maps');
              
              const getPngFiles = (dir: string, filesList: string[] = []): string[] => {
                if (!fs.existsSync(dir)) return filesList;
                const files = fs.readdirSync(dir);
                for (const file of files) {
                  const name = path.join(dir, file);
                  if (fs.statSync(name).isDirectory()) {
                    getPngFiles(name, filesList);
                  } else if (file.endsWith('.png')) {
                    filesList.push(name);
                  }
                }
                return filesList;
              };

              const allPngs = getPngFiles(mapsTilesDir);

              const folders = getSubdirectories(mapsTilesDir, mapsTilesDir);

              const propertiesPath = path.resolve(__dirname, 'tiles/tile_properties.json');
              let properties: Record<string, any> = {};
              if (fs.existsSync(propertiesPath)) {
                properties = JSON.parse(fs.readFileSync(propertiesPath, 'utf-8'));
              }

              const mapSprites = allPngs
                .map(filePath => {
                  const relativePath = path.relative(tilesDir, filePath).replace(/\\/g, '/');
                  const filename = path.basename(filePath, '.png');
                  
                  const relativeToMaps = path.relative(mapsTilesDir, filePath).replace(/\\/g, '/');
                  const parts = relativeToMaps.split('/');
                  
                  const props = properties[filename] || {};
                  // Determina assetType baseado na propriedade ou heurística
                  const assetType = props.assetType || (parts[0] === 'items' ? 'items' : 'terrain');
                  
                  // A categoria é a subpasta intermediária onde reside dentro de tiles/maps
                  const category = parts.length > 1 ? parts.slice(0, -1).join('/') : '';
                  
                  return {
                    name: props.nameOverride || filename.replace(/_/g, ' '),
                    filename,
                    assetType,
                    category,
                    relativePath: `tiles/${relativePath}`,
                    properties: props
                  };
                });

              res.statusCode = 200;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ success: true, sprites: mapSprites, folders }));
            } catch (err: any) {
              console.error('[Vite Backend] Erro ao listar sprites do mapa:', err);
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: err.message }));
            }
          } else if (req.url === '/api/list-auto-border-sets' && req.method === 'GET') {
            try {
              const manifest = readAutoBorderManifest();
              const sets = Object.entries(manifest.sets).map(([setId, entry]) =>
                borderSetManifestToListEntry(setId, entry as Record<string, unknown>)
              );
              res.statusCode = 200;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ success: true, sets }));
            } catch (err: any) {
              console.error('[Vite Backend] Erro ao listar conjuntos auto-borda:', err);
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: err.message }));
            }
          } else if (reqPath === '/api/border-set-usage' && req.method === 'GET') {
            try {
              const setId = sanitizeMapSpriteFilename(reqSearch.get('setId'));
              if (!setId) {
                res.statusCode = 400;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: 'Parâmetro setId inválido.' }));
                return;
              }
              if (!getBorderSetManifestEntry(setId)) {
                res.statusCode = 404;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: `Conjunto "${setId}" não encontrado.` }));
                return;
              }
              const usage = collectBorderSetUsage(setId);
              res.statusCode = 200;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify(usage));
            } catch (err: unknown) {
              const message = err instanceof Error ? err.message : String(err);
              console.error('[Vite Backend] Erro em border-set-usage:', err);
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: message }));
            }
            return;
          } else if (reqPath === '/api/delete-border-set' && req.method === 'DELETE') {
            try {
              const setId = sanitizeMapSpriteFilename(reqSearch.get('setId'));
              if (!setId) {
                res.statusCode = 400;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: 'Parâmetro setId inválido.' }));
                return;
              }
              const entry = getBorderSetManifestEntry(setId);
              if (!entry) {
                res.statusCode = 404;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: `Conjunto "${setId}" não encontrado.` }));
                return;
              }
              const force = reqSearch.get('force') === 'true';
              const usage = collectBorderSetUsage(setId);
              if (!force && usage.totalCells > 0) {
                res.statusCode = 409;
                res.setHeader('Content-Type', 'application/json');
                res.end(
                  JSON.stringify({
                    error: `Conjunto em uso em ${usage.maps.length} mapa(s).`,
                    maps: usage.maps,
                    totalCells: usage.totalCells,
                  })
                );
                return;
              }

              const result = deleteBorderSetFromDisk(setId);
              console.log(`[Vite Backend] Conjunto auto-borda excluído: ${setId}`);

              res.statusCode = 200;
              res.setHeader('Content-Type', 'application/json');
              res.end(
                JSON.stringify({
                  success: true,
                  setId,
                  label: usage.label,
                  deletedFiles: result.deletedFiles.length,
                  removedProperties: result.removedProperties,
                })
              );
            } catch (err: unknown) {
              const message = err instanceof Error ? err.message : String(err);
              console.error('[Vite Backend] Erro ao excluir conjunto auto-borda:', err);
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: message }));
            }
            return;
          } else if (req.url === '/api/save-border-set' && req.method === 'POST') {
            let body = '';
            req.on('data', chunk => body += chunk);
            req.on('end', () => {
              try {
                const parsed = JSON.parse(body || '{}');
                const setId = sanitizeMapSpriteFilename(parsed.setId);
                if (!setId) {
                  res.statusCode = 400;
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify({ error: 'ID do conjunto inválido.' }));
                  return;
                }

                const label = String(parsed.label ?? setId).trim() || setId;
                const fillTerrain = String(parsed.fillTerrain ?? 'grass').trim().toLowerCase() || 'grass';
                const subPath = sanitizeMapSpriteSubPath(parsed.category);
                const targetDir = path.resolve(__dirname, 'tiles/maps', subPath);
                if (!fs.existsSync(targetDir)) {
                  fs.mkdirSync(targetDir, { recursive: true });
                }

                const sheetFile = `${setId}_sheet`;
                const sheetPath = path.resolve(targetDir, `${sheetFile}.png`);
                if (parsed.sheetBase64) {
                  writePngBase64(sheetPath, String(parsed.sheetBase64));
                }

                const masksInput = Array.isArray(parsed.masks) ? parsed.masks : [];
                const masksMap: Record<string, string> = {};
                const propertiesPath = path.resolve(__dirname, 'tiles/tile_properties.json');
                let allProperties: Record<string, any> = {};
                if (fs.existsSync(propertiesPath)) {
                  allProperties = JSON.parse(fs.readFileSync(propertiesPath, 'utf-8'));
                }

                const isWalkable = parsed.walkable !== false;

                allProperties[sheetFile] = {
                  nameOverride: `${label} (spritesheet)`,
                  assetType: 'border',
                  tileRole: 'border_sheet',
                  borderSetId: setId,
                  paletteCategory: 'border',
                  walkable: isWalkable,
                  speedModifier: 1.0,
                  isStair: false,
                };

                const manifest = readAutoBorderManifest();
                const previousEntry = manifest.sets[setId] as Record<string, unknown> | undefined;
                const previousMasks = (previousEntry?.masks ?? {}) as Record<string, string>;
                for (const oldFilename of Object.values(previousMasks)) {
                  delete allProperties[oldFilename];
                  const oldPath = path.resolve(targetDir, `${oldFilename}.png`);
                  if (fs.existsSync(oldPath)) {
                    fs.unlinkSync(oldPath);
                  }
                }

                for (const maskEntry of masksInput) {
                  const maskNum = Math.floor(Number(maskEntry?.mask));
                  const filename = sanitizeMapSpriteFilename(maskEntry?.filename) ?? `${setId}_mask_${maskNum}`;
                  if (!Number.isFinite(maskNum) || maskNum < 1 || maskNum > 255) continue;

                  if (maskEntry?.spriteBase64) {
                    writePngBase64(path.resolve(targetDir, `${filename}.png`), String(maskEntry.spriteBase64));
                  }

                  masksMap[String(maskNum)] = filename;
                  allProperties[filename] = {
                    nameOverride: `${label} · máscara ${maskNum}`,
                    assetType: 'border',
                    tileRole: 'border_overlay',
                    borderMask: maskNum,
                    borderSetId: setId,
                    paletteCategory: 'border',
                    walkable: isWalkable,
                    speedModifier: 1.0,
                    isStair: false,
                  };
                }

                const cal = (parsed.calibration ?? {}) as Record<string, unknown>;
                const cells = Array.isArray(cal.borderSetCells) ? cal.borderSetCells : [];
                const { borderSetCells: _ignored, ...calibrationFields } = cal;

                manifest.sets[setId] = {
                  label,
                  fillTerrain,
                  category: subPath,
                  sheetFile,
                  calibration: calibrationFields,
                  cells,
                  masks: masksMap,
                  walkable: isWalkable,
                };
                writeAutoBorderManifest(manifest);
                fs.writeFileSync(propertiesPath, JSON.stringify(allProperties, null, 2));

                console.log(`[Vite Backend] Conjunto auto-borda salvo: ${setId} (${Object.keys(masksMap).length} máscaras, walkable=${isWalkable})`);

                res.statusCode = 200;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ success: true, setId, maskCount: Object.keys(masksMap).length }));
              } catch (err: any) {
                console.error('[Vite Backend] Erro ao salvar conjunto auto-borda:', err);
                res.statusCode = 500;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: err.message }));
              }
            });
          } else if (req.url === '/api/list-tile-properties' && req.method === 'GET') {
            try {
              const propertiesPath = path.resolve(__dirname, 'tiles/tile_properties.json');
              let properties = {};
              if (fs.existsSync(propertiesPath)) {
                properties = JSON.parse(fs.readFileSync(propertiesPath, 'utf-8'));
              }
              res.statusCode = 200;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ success: true, properties }));
            } catch (err: any) {
              console.error('[Vite Backend] Erro ao obter propriedades dos tiles:', err);
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: err.message }));
            }
          } else if (req.url === '/api/save-map-sprite' && req.method === 'POST') {
            let body = '';
            req.on('data', chunk => body += chunk);
            req.on('end', () => {
              try {
                const { name, assetType, category, spriteBase64, properties } = JSON.parse(body);
                const filename = name.toLowerCase().replace(/[^a-z0-9]/g, '_');
                
                let subPath = '';
                if (category) {
                  let sanitizedCategory = category
                    .replace(/[^a-zA-Z0-9_\-\/]/g, '')
                    .replace(/\.\./g, '');
                  
                  // Remove prefixos redundantes para evitar dupla-anestação no disco
                  sanitizedCategory = sanitizedCategory
                    .replace(/^(tiles\/)?(maps|terrain|items)\//i, '')
                    .replace(/^(tiles\/)?(maps|terrain|items)$/i, '');

                  subPath = sanitizedCategory;
                }

                const targetDir = path.resolve(__dirname, 'tiles/maps', subPath);
                if (!fs.existsSync(targetDir)) {
                  fs.mkdirSync(targetDir, { recursive: true });
                }

                if (spriteBase64 && spriteBase64.startsWith('data:image/png;base64,')) {
                  const imageBuffer = Buffer.from(spriteBase64.replace(/^data:image\/png;base64,/, ""), 'base64');
                  const imagePath = path.resolve(targetDir, `${filename}.png`);
                  fs.writeFileSync(imagePath, imageBuffer);
                  console.log(`[Vite Backend] Sprite de mapa salvo em: ${imagePath}`);
                } else if (spriteBase64 && typeof spriteBase64 === 'string' && spriteBase64.includes('/tiles/')) {
                  const urlParts = spriteBase64.split('/tiles/');
                  const sourceRelativePath = 'tiles/' + urlParts[urlParts.length - 1];
                  const sourcePath = path.resolve(__dirname, sourceRelativePath);
                  const imagePath = path.resolve(targetDir, `${filename}.png`);
                  
                  if (fs.existsSync(sourcePath) && sourcePath !== imagePath) {
                    fs.copyFileSync(sourcePath, imagePath);
                    console.log(`[Vite Backend] Sprite copiado de ${sourcePath} para ${imagePath}`);
                    
                    fs.unlinkSync(sourcePath);
                    console.log(`[Vite Backend] Sprite antigo removido em: ${sourcePath}`);
                  }
                }

                const propertiesPath = path.resolve(__dirname, 'tiles/tile_properties.json');
                let allProperties: Record<string, any> = {};
                if (fs.existsSync(propertiesPath)) {
                  allProperties = JSON.parse(fs.readFileSync(propertiesPath, 'utf-8'));
                }
                
                const entry: Record<string, unknown> = {
                  walkable: properties.walkable ?? true,
                  speedModifier: parseFloat(properties.speedModifier) || 1.0,
                  isStair: properties.isStair ?? false,
                  stairDirection: properties.isStair ? 'up' : undefined,
                  nameOverride: name,
                  assetType: assetType,
                };
                if (properties.variantGroup && String(properties.variantGroup).trim()) {
                  entry.variantGroup = String(properties.variantGroup).trim().toLowerCase();
                }
                if (properties.variantStripFrames && Number(properties.variantStripFrames) > 1) {
                  entry.variantStripFrames = Math.floor(Number(properties.variantStripFrames));
                }
                mergeMapSpriteCalibrationEntry(entry, properties);
                allProperties[filename] = entry;

                fs.writeFileSync(propertiesPath, JSON.stringify(allProperties, null, 2));
                console.log(`[Vite Backend] Propriedades salvas em: ${propertiesPath}`);

                res.statusCode = 200;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ success: true, name }));
              } catch (err: any) {
                console.error('[Vite Backend] Erro ao salvar sprite de mapa:', err);
                res.statusCode = 500;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: err.message }));
              }
            });
          } else if (req.url === '/api/save-map-sprites-batch' && req.method === 'POST') {
            let body = '';
            req.on('data', chunk => body += chunk);
            req.on('end', () => {
              try {
                const { assetType, category, sprites } = JSON.parse(body);
                if (!Array.isArray(sprites) || sprites.length === 0) {
                  res.statusCode = 400;
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify({ error: 'Lista de sprites vazia.' }));
                  return;
                }
                if (sprites.length > 100) {
                  res.statusCode = 400;
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify({ error: 'Máximo de 100 sprites por lote.' }));
                  return;
                }

                let subPath = '';
                if (category) {
                  let sanitizedCategory = String(category)
                    .replace(/[^a-zA-Z0-9_\-\/]/g, '')
                    .replace(/\.\./g, '');
                  sanitizedCategory = sanitizedCategory
                    .replace(/^(tiles\/)?(maps|terrain|items)\//i, '')
                    .replace(/^(tiles\/)?(maps|terrain|items)$/i, '');
                  subPath = sanitizedCategory;
                }

                const targetDir = path.resolve(__dirname, 'tiles/maps', subPath);
                if (!fs.existsSync(targetDir)) {
                  fs.mkdirSync(targetDir, { recursive: true });
                }

                const propertiesPath = path.resolve(__dirname, 'tiles/tile_properties.json');
                let allProperties: Record<string, any> = {};
                if (fs.existsSync(propertiesPath)) {
                  allProperties = JSON.parse(fs.readFileSync(propertiesPath, 'utf-8'));
                }

                let savedCount = 0;
                for (const sprite of sprites) {
                  const { name, spriteBase64, properties } = sprite;
                  const filename = String(name).toLowerCase().replace(/[^a-z0-9]/g, '_');

                  if (spriteBase64 && String(spriteBase64).startsWith('data:image/png;base64,')) {
                    const imageBuffer = Buffer.from(
                      String(spriteBase64).replace(/^data:image\/png;base64,/, ''),
                      'base64'
                    );
                    const imagePath = path.resolve(targetDir, `${filename}.png`);
                    fs.writeFileSync(imagePath, imageBuffer);
                    savedCount++;
                  }

                  const entry: Record<string, unknown> = {
                    walkable: properties?.walkable ?? true,
                    speedModifier: parseFloat(properties?.speedModifier) || 1.0,
                    isStair: properties?.isStair ?? false,
                    stairDirection: properties?.isStair ? 'up' : undefined,
                    nameOverride: name,
                    assetType: assetType ?? 'terrain',
                  };
                  if (properties?.variantGroup && String(properties.variantGroup).trim()) {
                    entry.variantGroup = String(properties.variantGroup).trim().toLowerCase();
                  }
                  if (properties?.variantStripFrames && Number(properties.variantStripFrames) > 1) {
                    entry.variantStripFrames = Math.floor(Number(properties.variantStripFrames));
                  }
                  mergeMapSpriteCalibrationEntry(entry, properties);
                  allProperties[filename] = entry;
                }

                fs.writeFileSync(propertiesPath, JSON.stringify(allProperties, null, 2));
                console.log(`[Vite Backend] Lote de ${savedCount} sprites salvo em: ${targetDir}`);

                res.statusCode = 200;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ success: true, saved: savedCount }));
              } catch (err: any) {
                console.error('[Vite Backend] Erro ao salvar lote de sprites:', err);
                res.statusCode = 500;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: err.message }));
              }
            });
          } else if (req.url === '/api/save-map' && req.method === 'POST') {
            let body = '';
            let bodySize = 0;
            req.on('data', (chunk: Buffer | string) => {
              bodySize += typeof chunk === 'string' ? chunk.length : chunk.length;
              if (bodySize > MAX_MAP_SAVE_BYTES) {
                res.statusCode = 413;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: 'JSON do mapa excede o limite de 20MB.' }));
                req.destroy();
                return;
              }
              body += chunk;
            });
            req.on('end', () => {
              try {
                const parsed = JSON.parse(body || '{}');
                const safeName = sanitizeMapSaveFilename(parsed.filename);
                if (!safeName) {
                  res.statusCode = 400;
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify({ error: 'Nome de arquivo inválido.' }));
                  return;
                }
                if (typeof parsed.json === 'string' && parsed.json.trim()) {
                  try {
                    JSON.parse(parsed.json);
                  } catch {
                    res.statusCode = 400;
                    res.setHeader('Content-Type', 'application/json');
                    res.end(JSON.stringify({ error: 'Campo json não é JSON válido.' }));
                    return;
                  }
                } else if (!parsed.document || typeof parsed.document !== 'object') {
                  res.statusCode = 400;
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify({ error: 'Campo json ou document ausente ou inválido.' }));
                  return;
                }

                const mapsDir = path.resolve(__dirname, 'public/maps');
                if (!fs.existsSync(mapsDir)) {
                  fs.mkdirSync(mapsDir, { recursive: true });
                }

                const targetPath = path.resolve(mapsDir, safeName);
                const normalizedMaps = path.normalize(mapsDir + path.sep);
                if (!targetPath.startsWith(normalizedMaps)) {
                  res.statusCode = 400;
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify({ error: 'Caminho de destino não permitido.' }));
                  return;
                }

                const fileContents =
                  typeof parsed.json === 'string' && parsed.json.trim()
                    ? parsed.json.endsWith('\n')
                      ? parsed.json
                      : `${parsed.json}\n`
                    : `${JSON.stringify(parsed.document, null, 2)}\n`;

                fs.writeFileSync(targetPath, fileContents, 'utf-8');
                console.log(`[Vite Backend] Mapa salvo em: ${targetPath}`);

                res.statusCode = 200;
                res.setHeader('Content-Type', 'application/json');
                res.end(
                  JSON.stringify({
                    success: true,
                    path: `public/maps/${safeName}`,
                  })
                );
              } catch (err: any) {
                console.error('[Vite Backend] Erro ao salvar mapa:', err);
                res.statusCode = 500;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: err.message }));
              }
            });
          } else if (req.url === '/api/save-tile-catalog' && req.method === 'POST') {
            let body = '';
            req.on('data', chunk => body += chunk);
            req.on('end', () => {
              try {
                const parsed = JSON.parse(body || '{}');
                if (!parsed.catalog || typeof parsed.catalog !== 'object') {
                  res.statusCode = 400;
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify({ error: 'Campo catalog ausente ou inválido.' }));
                  return;
                }

                const targetPath = path.resolve(__dirname, 'public/tile_catalog.json');
                fs.writeFileSync(
                  targetPath,
                  `${JSON.stringify(parsed.catalog, null, 2)}\n`,
                  'utf-8'
                );
                console.log(`[Vite Backend] Catálogo de tiles salvo em: ${targetPath}`);

                res.statusCode = 200;
                res.setHeader('Content-Type', 'application/json');
                res.end(
                  JSON.stringify({ success: true, path: 'public/tile_catalog.json' })
                );
              } catch (err: any) {
                console.error('[Vite Backend] Erro ao salvar catálogo de tiles:', err);
                res.statusCode = 500;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: err.message }));
              }
            });
          } else if (req.url === '/api/save-character' && req.method === 'POST') {
            let body = '';
            req.on('data', chunk => body += chunk);
            req.on('end', () => {
              try {
                const { name, category, spriteBase64, configJson } = JSON.parse(body);
                const filename = name.toLowerCase().replace(/[^a-z0-9]/g, '_');
                
                const config = getGameConfig();
                const baseDir = config.charactersDir;
                const baseDirClean = baseDir.replace(/\/+$/, '');
                
                // Organização de categorias/subpastas com sanitização robusta contra Directory Traversal
                let subPath = '';
                if (category) {
                  let sanitizedCategory = category
                    .replace(/[^a-zA-Z0-9_\-\/]/g, '') // Permite apenas caracteres seguros e barras
                    .replace(/\.\./g, '');             // Bloqueia subir níveis de diretórios
                  
                  // Evita duplo-aninhamento: Remove prefixo de pasta base ou 'characters/' se digitado
                  const basePrefixReg = new RegExp(`^(${baseDirClean}/|characters/|tiles/characters/)?`, 'i');
                  sanitizedCategory = sanitizedCategory.replace(basePrefixReg, '');
                  subPath = sanitizedCategory;
                }

                // Garante que o diretório {charactersDir}/{subPath} existe
                const targetDir = path.resolve(__dirname, baseDir, subPath);
                if (!fs.existsSync(targetDir)) {
                  fs.mkdirSync(targetDir, { recursive: true });
                }
                
                // 1. Se houver imagem em Base64 enviada, grava fisicamente no disco
                let spriteSheetUrl = configJson.spriteSheetUrl;
                const relativeUrlPrefix = subPath ? `${baseDirClean}/${subPath}` : baseDirClean;
                if (spriteBase64 && spriteBase64.startsWith('data:image/png;base64,')) {
                  const imageBuffer = Buffer.from(spriteBase64.replace(/^data:image\/png;base64,/, ""), 'base64');
                  const imagePath = path.resolve(targetDir, `${filename}.png`);
                  fs.writeFileSync(imagePath, imageBuffer);
                  spriteSheetUrl = `${relativeUrlPrefix}/${filename}.png`;
                  console.log(`[Vite Backend] Spritesheet salva em: ${imagePath}`);
                }
                
                // 2. Atualiza a URL da spritesheet no JSON para apontar para o caminho físico relativo
                configJson.spriteSheetUrl = spriteSheetUrl;
                
                // 3. Salva o arquivo JSON de configuração com o caminho físico
                const jsonPath = path.resolve(targetDir, `${filename}.json`);
                fs.writeFileSync(jsonPath, JSON.stringify(configJson, null, 2));
                console.log(`[Vite Backend] Configuração JSON salva em: ${jsonPath}`);

                res.statusCode = 200;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ 
                  success: true, 
                  spriteSheetUrl: spriteSheetUrl,
                  name: configJson.name
                }));
              } catch (err: any) {
                console.error('[Vite Backend] Erro no upload:', err);
                res.statusCode = 500;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: err.message }));
              }
            });
          } else if (req.url === '/api/upsert-creature-preset' && req.method === 'POST') {
            let body = '';
            req.on('data', (chunk) => { body += chunk; });
            req.on('end', () => {
              try {
                const entry = JSON.parse(body);
                if (!entry || typeof entry.name !== 'string' || !entry.name.trim()) {
                  throw new Error('Campo name é obrigatório.');
                }
                if (entry.type !== 'npc' && entry.type !== 'monster') {
                  throw new Error('Campo type deve ser "npc" ou "monster".');
                }
                if (typeof entry.configPath !== 'string' || !entry.configPath.trim()) {
                  throw new Error('Campo configPath é obrigatório.');
                }
                const validSizes = new Set(['tiny', 'small', 'medium', 'large', 'boss']);
                const presetsPath = path.resolve(__dirname, 'public/creature_presets.json');
                let presets: unknown[] = [];
                if (fs.existsSync(presetsPath)) {
                  const raw = JSON.parse(fs.readFileSync(presetsPath, 'utf-8'));
                  if (Array.isArray(raw)) presets = raw;
                }
                const sanitized = {
                  name: entry.name.trim(),
                  type: entry.type,
                  configPath: entry.configPath.trim().replace(/^\//, ''),
                  description: typeof entry.description === 'string' ? entry.description : '',
                  color: typeof entry.color === 'string' ? entry.color : undefined,
                  visualSize: validSizes.has(entry.visualSize) ? entry.visualSize : undefined,
                };
                const idx = presets.findIndex(
                  (p) => p && typeof p === 'object' && (p as { name?: string }).name === sanitized.name
                );
                if (idx >= 0) presets[idx] = sanitized;
                else presets.push(sanitized);
                fs.writeFileSync(presetsPath, JSON.stringify(presets, null, 2) + '\n');
                console.log(`[Vite Backend] Creature preset upserted: ${sanitized.name}`);
                 res.statusCode = 200;
                 res.setHeader('Content-Type', 'application/json');
                 res.end(JSON.stringify({ success: true, preset: sanitized }));
              } catch (err: unknown) {
                const message = err instanceof Error ? err.message : String(err);
                console.error('[Vite Backend] Erro ao upsert creature preset:', err);
                res.statusCode = 500;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: message }));
              }
            });
          } else if (req.url === '/api/upsert-outfit-preset' && req.method === 'POST') {
            let body = '';
            req.on('data', chunk => body += chunk);
            req.on('end', () => {
              try {
                const entry = JSON.parse(body || '{}');
                if (!entry.id || !entry.name || !entry.vocationId || !entry.gender || !entry.spriteSheetUrl) {
                  throw new Error('Campos id, name, vocationId, gender e spriteSheetUrl são obrigatórios.');
                }
                const presetsPath = path.resolve(__dirname, 'public/outfit_presets.json');
                let presets: any[] = [];
                if (fs.existsSync(presetsPath)) {
                  try {
                    presets = JSON.parse(fs.readFileSync(presetsPath, 'utf-8'));
                  } catch (e) {}
                }
                const sanitized = {
                  id: entry.id,
                  name: entry.name,
                  vocationId: entry.vocationId,
                  gender: entry.gender,
                  spriteSheetUrl: entry.spriteSheetUrl,
                  showInCreation: entry.showInCreation !== false
                };
                const idx = presets.findIndex(p => p && p.id === sanitized.id);
                if (idx >= 0) {
                  presets[idx] = sanitized;
                } else {
                  presets.push(sanitized);
                }
                fs.writeFileSync(presetsPath, JSON.stringify(presets, null, 2) + '\n');
                console.log(`[Vite Backend] Outfit preset upserted: ${sanitized.id}`);
                res.statusCode = 200;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ success: true, preset: sanitized }));
              } catch (err: any) {
                console.error('[Vite Backend] Erro ao upsert outfit preset:', err);
                res.statusCode = 500;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: err.message }));
              }
            });
          } else {
            next();
          }
        });
      }
    }
  ]
});
