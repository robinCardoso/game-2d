export type WorldMap = Record<number, number[][]>;

export function cloneWorldMap(map: WorldMap): WorldMap {
    const clone: WorldMap = {};
    for (const key in map) {
        if (Object.prototype.hasOwnProperty.call(map, key)) {
            const floor = map[key];
            clone[key] = floor.map(row => [...row]);
        }
    }
    return clone;
}

export class HistoryManager {
    private undoStack: WorldMap[] = [];
    private redoStack: WorldMap[] = [];
    private maxStates: number = 50;

    constructor() {}

    /**
     * Salva o estado atual do mapa antes de uma modificação ocorrer.
     */
    public saveState(state: WorldMap) {
        this.undoStack.push(cloneWorldMap(state));
        // Sempre que uma nova ação de desenho ocorre, limpamos a pilha de refazer
        this.redoStack = [];
        
        if (this.undoStack.length > this.maxStates) {
            this.undoStack.shift();
        }
    }

    /**
     * Retorna o estado anterior do mapa, movendo o estado atual para a pilha de refazer.
     */
    public undo(currentState: WorldMap): WorldMap | null {
        if (this.undoStack.length === 0) return null;
        
        this.redoStack.push(cloneWorldMap(currentState));
        const previousState = this.undoStack.pop()!;
        return previousState;
    }

    /**
     * Retorna o próximo estado do mapa (avançar), movendo o estado atual para a pilha de desfazer.
     */
    public redo(currentState: WorldMap): WorldMap | null {
        if (this.redoStack.length === 0) return null;
        
        this.undoStack.push(cloneWorldMap(currentState));
        const nextState = this.redoStack.pop()!;
        return nextState;
    }

    /**
     * Limpa o histórico.
     */
    public clear() {
        this.undoStack = [];
        this.redoStack = [];
    }

    /**
     * Retorna se há estados para desfazer.
     */
    public canUndo(): boolean {
        return this.undoStack.length > 0;
    }

    /**
     * Retorna se há estados para refazer.
     */
    public canRedo(): boolean {
        return this.redoStack.length > 0;
    }
}
