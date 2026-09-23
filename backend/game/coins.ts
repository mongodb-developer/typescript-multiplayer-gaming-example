import { randomUUID } from "crypto";
import { Server } from "socket.io";
import { config } from "../config";
import { Coin, GameState } from "../types/index";

/** Returns a random integer between `min` and `max`, both inclusive. */
function randomInt(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Creates a coin with a fresh UUID at a random position fully inside the canvas
 * bounds (the coin's size is subtracted so it never hangs off an edge).
 */
export function generateCoin(): Coin {
    const { CANVAS_WIDTH, CANVAS_HEIGHT, COIN_SIZE } = config;

    return {
        id: randomUUID(),
        x: randomInt(0, CANVAS_WIDTH - COIN_SIZE),
        y: randomInt(0, CANVAS_HEIGHT - COIN_SIZE),
    };
}

/**
 * Begins spawning coins for a room on a `COIN_SPAWN_INTERVAL_MS` timer. Each tick
 * adds one coin — and broadcasts `coin:spawned` — unless the room is already at
 * `COIN_MAX_ON_SCREEN`. The interval stops itself if the match is no longer in
 * progress. The server's coin map is the source of truth for what is on screen.
 */
export function startCoinSpawner(
    io: Server,
    state: GameState
): void {
    state.coinSpawnInterval = setInterval(() => {
        if (state.status !== "in_progress") {
            stopCoinSpawner(state);
            return;
        }

        if (state.coins.size >= config.COIN_MAX_ON_SCREEN) return;

        const coin = generateCoin();
        state.coins.set(coin.id, coin);
        io.to(state.roomId).emit("coin:spawned", coin);
    }, config.COIN_SPAWN_INTERVAL_MS);
}

/** Clears a room's coin spawn interval, if one is running. Idempotent. */
export function stopCoinSpawner(state: GameState): void {
    if (state.coinSpawnInterval !== null) {
        clearInterval(state.coinSpawnInterval);
        state.coinSpawnInterval = null;
    }
}
