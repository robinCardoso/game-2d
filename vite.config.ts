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
          } else {
            next();
          }
        });
      }
    }
  ]
});
