import { config } from "../config";
import { GameState, MoveDirection, PlayerGameState } from "../types/index";

// One entry per active room, keyed by roomId (string of ObjectId).
const gameRooms = new Map<string, GameState>();

/**
 * Creates the in-memory state for a room — no players, no coins, status
 * `waiting` — registers it in the room map, and returns it.
 */
export function createGameState(roomId: string): GameState {
    const state: GameState = {
        roomId,
        player1: null,
        player2: null,
        coins: new Map(),
        status: "waiting",
        matchTimer: null,
        coinSpawnInterval: null,
    };
    gameRooms.set(roomId, state);
    return state;
}

/** Looks up a room's live state, or `undefined` if the room is not active. */
export function getGameState(roomId: string): GameState | undefined {
    return gameRooms.get(roomId);
}

/**
 * Drops a room from the in-memory map once its match has ended. Callers are
 * responsible for stopping the room's timers first.
 */
export function deleteGameState(roomId: string): void {
    gameRooms.delete(roomId);
}

// ---------------------------------------------------------------------------
// Player management
// ---------------------------------------------------------------------------

/**
 * Spawn point for a player slot: player 1 near the left edge, player 2 near the
 * right edge, both vertically centered. The frontend mirrors this calculation so
 * the sprites appear where the server thinks they are before the first move.
 */
export function getStartingPosition(
    slot: 1 | 2
): { x: number; y: number } {
    const { CANVAS_WIDTH, CANVAS_HEIGHT, PLAYER_SIZE } = config;

    if (slot === 1) {
        return { x: PLAYER_SIZE * 2, y: Math.floor(CANVAS_HEIGHT / 2) };
    }
    return { x: CANVAS_WIDTH - PLAYER_SIZE * 3, y: Math.floor(CANVAS_HEIGHT / 2) };
}

/**
 * Places a player into the given slot of a room's state at that slot's starting
 * position with a score of zero, and returns the new player state.
 */
export function addPlayerToState(
    state: GameState,
    slot: 1 | 2,
    username: string,
    socketId: string
): PlayerGameState {
    const { x, y } = getStartingPosition(slot);
    const playerState: PlayerGameState = { username, socketId, x, y, score: 0 };

    if (slot === 1) {
        state.player1 = playerState;
    } else {
        state.player2 = playerState;
    }

    return playerState;
}

/**
 * Which player does this socket control? Returns `null` for a socket that is not
 * in the room. This is how the movement and collect handlers establish identity —
 * clients never get to name the player they are acting as.
 */
export function getPlayerBySocketId(
    state: GameState,
    socketId: string
): PlayerGameState | null {
    if (state.player1?.socketId === socketId) return state.player1;
    if (state.player2?.socketId === socketId) return state.player2;
    return null;
}

// ---------------------------------------------------------------------------
// Movement — server is authoritative; positions are clamped to canvas bounds
// ---------------------------------------------------------------------------

/**
 * Moves a player one `PLAYER_SPEED` step in the requested direction, clamps the
 * result to the canvas bounds, writes it back onto the player state, and returns
 * the new position. The server is authoritative: this is the only place a
 * player's position changes as a result of input.
 */
export function applyMovement(
    player: PlayerGameState,
    direction: MoveDirection
): { x: number; y: number } {
    const { CANVAS_WIDTH, CANVAS_HEIGHT, PLAYER_SIZE, PLAYER_SPEED } = config;

    let { x, y } = player;

    switch (direction) {
        case "up":    y -= PLAYER_SPEED; break;
        case "down":  y += PLAYER_SPEED; break;
        case "left":  x -= PLAYER_SPEED; break;
        case "right": x += PLAYER_SPEED; break;
    }

    // Clamp within canvas bounds
    x = Math.max(0, Math.min(CANVAS_WIDTH - PLAYER_SIZE, x));
    y = Math.max(0, Math.min(CANVAS_HEIGHT - PLAYER_SIZE, y));

    player.x = x;
    player.y = y;

    return { x, y };
}

// ---------------------------------------------------------------------------
// Coin collection validation
// ---------------------------------------------------------------------------

/**
 * Checks whether a player really is touching a coin, so a client cannot claim a
 * coin it is nowhere near. Performs an axis-aligned bounding box overlap test
 * between the player square and the coin square, with one player-speed unit of
 * slack on the player's box to absorb network latency.
 */
export function validateCoinCollect(
    player: PlayerGameState,
    coinX: number,
    coinY: number
): boolean {
    const { PLAYER_SIZE, COIN_SIZE, PLAYER_SPEED } = config;

    // AABB overlap check with one extra player-speed unit of server-side tolerance
    // to account for network latency between client detection and server validation.
    const tolerance = PLAYER_SPEED;

    const playerRight  = player.x + PLAYER_SIZE + tolerance;
    const playerBottom = player.y + PLAYER_SIZE + tolerance;
    const playerLeft   = player.x - tolerance;
    const playerTop    = player.y - tolerance;

    const coinRight  = coinX + COIN_SIZE;
    const coinBottom = coinY + COIN_SIZE;

    return (
        playerLeft   < coinRight  &&
        playerRight  > coinX      &&
        playerTop    < coinBottom &&
        playerBottom > coinY
    );
}
