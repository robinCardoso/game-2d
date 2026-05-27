/// <reference types="vite/client" />

interface ImportMetaEnv {
    /** URL do WebSocket do game server. Em dev, padrão `ws://localhost:8787`. Use `false` para desligar. */
    readonly VITE_GAME_SERVER_WS?: string;
}

interface ImportMeta {
    readonly env: ImportMetaEnv;
}
