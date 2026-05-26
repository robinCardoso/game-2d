# 🗺️ 2D World Builder / Map Editor

Um editor de mapas 2D interativo e modular desenvolvido para web utilizando TypeScript e HTML5 Canvas. Ideal para a criação de cenários de RPG e jogos 2D, permitindo a construção de múltiplos andares (Z-axis) e a configuração avançada de propriedades e funções dos tiles.

## ✨ Funcionalidades Principais

*   **Múltiplos Andares (Eixo Z):** Crie mapas complexos com elevações, como escadas, andares superiores e subsolos. O sistema gerencia onde o personagem pode pisar de acordo com o nível atual.
*   **Sistema de Camadas e Tiles Inteligentes:** Configure propriedades específicas para cada tile (Ex: Chão caminhável, Paredes bloqueadoras, Água, Escadas de transição).
*   **Ferramentas de Edição (Estilo Paint):**
    *   ✏️ **Lápis:** Desenho livre de tiles.
    *   🪣 **Balde de Tinta (Flood Fill):** Preenchimento rápido de áreas contínuas.
    *   🧽 **Borracha:** Remoção de tiles.
    *   ⬛ **Retângulo e Linha:** Criação ágil de estruturas geométricas.
    *   💧 **Conta-gotas:** Seleciona um tile existente no mapa para uso imediato.
*   **Histórico (Desfazer / Refazer):** Errou? Sem problemas! Utilize atalhos de teclado como `Ctrl+Z` (Desfazer) e `Ctrl+Y` / `Ctrl+X` (Refazer) graças a um sistema de pilha de estados.
*   **Gestão de Cargos (Roles):** Lógica estruturada para diferenciar `Player`, `GM` (Game Master) e `Tutor`, definindo quem tem permissões de edição, voo, ou limites de movimentação.
*   **Importação e Exportação JSON:** Salve e recarregue seus mapas facilmente no formato JSON.

## 🚀 Tecnologias Utilizadas

*   **TypeScript:** Código tipado e robusto.
*   **HTML5 Canvas API:** Renderização gráfica de alta performance.
*   **Vite:** Build tool ultrarrápido para desenvolvimento frontend (se aplicável, assumindo pelo uso do `npm run dev`).
*   **CSS (Vanilla):** Estilização moderna e modo escuro nativo para uma experiência agradável (Interface Premium).

## 📂 Estrutura do Projeto

*   `src/main.ts`: Arquivo principal contendo as lógicas de renderização, controle de ferramentas e loops do canvas.
*   `src/functions/`: Módulos de funcionalidades específicas (separação de responsabilidades).
    *   `history.ts`: Gerenciador do histórico de edições (Undo/Redo).
    *   `tileConfig.ts`: Definições das propriedades físicas e interações de cada tile.
    *   `roles.ts`: Controle de permissões (GM, Player).
*   `tiles/`: Diretório contendo os assets visuais e imagens de cada bloco organizados por categoria.

## 🛠️ Como rodar o projeto localmente

1.  **Clone o repositório:**
    ```bash
    git clone https://github.com/SEU_USUARIO/game-2d.git
    cd game-2d
    ```

2.  **Instale as dependências:**
    ```bash
    npm install
    ```

3.  **Inicie o servidor de desenvolvimento:**
    ```bash
    npm run dev
    ```

4.  **Acesse no navegador:** Clique no link gerado no terminal (geralmente `http://localhost:5173`).

## 🗺️ Controles do Editor

*   **Botão Esquerdo do Mouse:** Usar a ferramenta selecionada (pintar, preencher, etc).
*   **Botão Direito do Mouse:** Arrastar e navegar pelo mapa (Pan/Câmera).
*   **Scroll do Mouse (Roda):** Aumentar ou diminuir o zoom do mapa.
*   **Ctrl + Z:** Desfazer a última ação.
*   **Ctrl + Y / Ctrl + X:** Refazer a ação desfeita.

## 🤝 Próximos Passos (Roadmap)

- [ ] Aperfeiçoamento do movimento do personagem de acordo com as restrições físicas (colisões e elevações).
- [ ] Implementação total da interface in-game para diferentes "Roles" (Player vs GM).
- [ ] Otimização no carregamento massivo de tiles (Chunks).

---
*Desenvolvido com 💻 e ☕.*
