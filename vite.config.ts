import { defineConfig } from 'vite';
import fs from 'fs';
import path from 'path';

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
                let allProperties = {};
                if (fs.existsSync(propertiesPath)) {
                  allProperties = JSON.parse(fs.readFileSync(propertiesPath, 'utf-8'));
                }
                
                allProperties[filename] = {
                  walkable: properties.walkable ?? true,
                  speedModifier: parseFloat(properties.speedModifier) || 1.0,
                  isStair: properties.isStair ?? false,
                  stairDirection: properties.isStair ? 'up' : undefined,
                  nameOverride: name
                };

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
