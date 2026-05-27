import { defineConfig } from 'vite';
import fs from 'fs';
import path from 'path';

const MAX_MAP_SAVE_BYTES = 20 * 1024 * 1024;

function sanitizeMapSaveFilename(filename: unknown): string | null {
  if (typeof filename !== 'string') return null;
  const base = filename.replace(/^.*[/\\]/, '').trim().toLowerCase();
  const withExt = base.endsWith('.json') ? base : `${base}.json`;
  const id = withExt.slice(0, -5);
  if (!id || !/^[a-z0-9_-]+$/.test(id)) return null;
  return withExt;
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
          if (req.url === '/api/list-characters' && req.method === 'GET') {
            try {
              const charactersDir = path.resolve(__dirname, 'tiles/characters');
              const jsonFiles = getJsonFiles(charactersDir);
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
              res.end(JSON.stringify({ success: true, characters }));
            } catch (err: any) {
              console.error('[Vite Backend] Erro ao listar personagens:', err);
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: err.message }));
            }
          } else if (req.url === '/api/list-map-sprites' && req.method === 'GET') {
            try {
              const tilesDir = path.resolve(__dirname, 'tiles');
              
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

              const allPngs = getPngFiles(tilesDir);

              const propertiesPath = path.resolve(__dirname, 'tiles/tile_properties.json');
              let properties: Record<string, any> = {};
              if (fs.existsSync(propertiesPath)) {
                properties = JSON.parse(fs.readFileSync(propertiesPath, 'utf-8'));
              }

              const mapSprites = allPngs
                .filter(filePath => {
                  // Pula a subpasta characters
                  const relativeToTiles = path.relative(tilesDir, filePath).replace(/\\/g, '/');
                  return !relativeToTiles.startsWith('characters/');
                })
                .map(filePath => {
                  const relativePath = path.relative(tilesDir, filePath).replace(/\\/g, '/');
                  const filename = path.basename(filePath, '.png');
                  
                  // Identifica se é terreno ou item com base nas subpastas. Por padrão é terreno se não especificado.
                  const parts = relativePath.split('/');
                  const assetType = parts[0] === 'items' ? 'items' : 'terrain';
                  
                  // A categoria é a subpasta intermediária onde ele reside (ex: floors, nature, walls, etc.)
                  const category = parts.length > 2 ? parts.slice(1, -1).join('/') : parts[0];
                  const props = properties[filename] || {};
                  
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
              res.end(JSON.stringify({ success: true, sprites: mapSprites }));
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
                const baseDirName = assetType === 'items' ? 'items' : 'terrain';
                
                let subPath = '';
                if (category) {
                  const sanitizedCategory = category
                    .replace(/[^a-zA-Z0-9_\-\/]/g, '')
                    .replace(/\.\./g, '');
                  subPath = sanitizedCategory;
                }

                const targetDir = path.resolve(__dirname, 'tiles', baseDirName, subPath);
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
                };
                if (properties.participatesInAutoBorder) {
                  entry.participatesInAutoBorder = true;
                  entry.tileRole = properties.tileRole ?? 'fill';
                  if (properties.terrainGroup) entry.terrainGroup = properties.terrainGroup;
                  if (properties.tileRole === 'border') {
                    entry.borderSetId = properties.borderSetId;
                    entry.borderMask = properties.borderMask;
                  }
                }
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
          } else if (req.url === '/api/save-auto-border-set' && req.method === 'POST') {
            let body = '';
            req.on('data', (chunk) => (body += chunk));
            req.on('end', () => {
              try {
                const { set, pngs, allSets } = JSON.parse(body);
                if (!set?.id) throw new Error('Conjunto inválido');

                const borderDir = path.resolve(__dirname, 'tiles/terrain/borders', set.id);
                if (!fs.existsSync(borderDir)) {
                  fs.mkdirSync(borderDir, { recursive: true });
                }

                const propertiesPath = path.resolve(__dirname, 'tiles/tile_properties.json');
                let allProperties: Record<string, any> = {};
                if (fs.existsSync(propertiesPath)) {
                  allProperties = JSON.parse(fs.readFileSync(propertiesPath, 'utf-8'));
                }

                for (const item of pngs || []) {
                  const fileKey = item.fileKey as string;
                  const dataUrl = item.dataUrl as string;
                  if (!dataUrl?.startsWith('data:image/png;base64,')) continue;
                  const imageBuffer = Buffer.from(
                    dataUrl.replace(/^data:image\/png;base64,/, ''),
                    'base64'
                  );
                  fs.writeFileSync(path.resolve(borderDir, `${fileKey}.png`), imageBuffer);
                  allProperties[fileKey] = {
                    walkable: true,
                    speedModifier: 1.0,
                    nameOverride: `${set.label} máscara ${item.mask}`,
                    participatesInAutoBorder: true,
                    terrainGroup: set.fillTerrain,
                    tileRole: 'border',
                    borderSetId: set.id,
                    borderMask: item.mask,
                  };
                }

                fs.writeFileSync(propertiesPath, JSON.stringify(allProperties, null, 2));

                const manifestPath = path.resolve(__dirname, 'public/auto_border_sets.json');
                const manifest = {
                  version: 1,
                  sets: allSets || [set],
                };
                fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

                res.statusCode = 200;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ success: true, setId: set.id }));
              } catch (err: any) {
                console.error('[Vite Backend] Erro ao salvar auto-border set:', err);
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
                if (!parsed.document || typeof parsed.document !== 'object') {
                  res.statusCode = 400;
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify({ error: 'Campo document ausente ou inválido.' }));
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

                fs.writeFileSync(
                  targetPath,
                  JSON.stringify(parsed.document, null, 2),
                  'utf-8'
                );
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
          } else if (req.url === '/api/save-character' && req.method === 'POST') {
            let body = '';
            req.on('data', chunk => body += chunk);
            req.on('end', () => {
              try {
                const { name, category, spriteBase64, configJson } = JSON.parse(body);
                const filename = name.toLowerCase().replace(/[^a-z0-9]/g, '_');
                
                // Organização de categorias/subpastas com sanitização robusta contra Directory Traversal
                let subPath = '';
                if (category) {
                  const sanitizedCategory = category
                    .replace(/[^a-zA-Z0-9_\-\/]/g, '') // Permite apenas caracteres seguros e barras
                    .replace(/\.\./g, '');             // Bloqueia subir níveis de diretórios
                  subPath = sanitizedCategory;
                }

                // Garante que o diretório tiles/characters/{subPath} existe
                const targetDir = path.resolve(__dirname, 'tiles/characters', subPath);
                if (!fs.existsSync(targetDir)) {
                  fs.mkdirSync(targetDir, { recursive: true });
                }
                
                // 1. Se houver imagem em Base64 enviada, grava fisicamente no disco
                let spriteSheetUrl = configJson.spriteSheetUrl;
                const relativeUrlPrefix = subPath ? `tiles/characters/${subPath}` : 'tiles/characters';
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
          } else {
            next();
          }
        });
      }
    }
  ]
});
