// The socket payload types below are intentionally mirrored in
// backend/types/index.ts. The two projects are independent (no shared package),
// so a change here needs the same change there.

// ---------------------------------------------------------------------------
// REST models
// ---------------------------------------------------------------------------

export interface Player {
    _id: string;
    username: string;
    high_score: number;
    total_matches_played: number;
    total_wins: number;
    created_at: string;
}

export interface Match {
    _id: string;
    status: "waiting" | "in_progress" | "finished";
    player_1: { username: string; score: number };
    player_2: { username: string; score: number } | null;
    winner: string | null;
    created_at: string;
    ended_at: string | null;
}

export interface LeaderboardEntry {
    username: string;
    high_score: number;
    total_wins: number;
    total_matches_played: number;
}

// ---------------------------------------------------------------------------
// Game objects and socket payloads
// ---------------------------------------------------------------------------

export interface Coin {
    id: string;
    x: number;
    y: number;
}

export type MoveDirection = "up" | "down" | "left" | "right";

export interface Scores {
    player1: { username: string; score: number };
    player2: { username: string; score: number };
}

export interface RoomJoinedPayload {
    slot: 1 | 2;
    roomId: string;
}

export interface GameStartPayload {
    players: {
        player1: string;
        player2: string;
    };
    coins: Coin[];
    durationMs: number;
    canvasWidth: number;
    canvasHeight: number;
    playerSize: number;
    coinSize: number;
}

export interface PlayerMovedPayload {
    username: string;
    x: number;
    y: number;
}

export interface CoinCollectedPayload {
    coinId: string;
    username: string;
    scores: Scores;
}

export interface GameEndPayload {
    scores: Scores;
    winner: string | null;
}

// ---------------------------------------------------------------------------
// Event maps — these give socket.on / socket.emit full type checking
// ---------------------------------------------------------------------------

export interface ServerToClientEvents {
    "room:joined": (payload: RoomJoinedPayload) => void;
    "game:start": (payload: GameStartPayload) => void;
    "coin:spawned": (coin: Coin) => void;
    "player:moved": (payload: PlayerMovedPayload) => void;
    "coin:collected": (payload: CoinCollectedPayload) => void;
    "game:end": (payload: GameEndPayload) => void;
    error: (payload: { message: string }) => void;
}

export interface ClientToServerEvents {
    "room:join": (payload: { roomId: string; username: string }) => void;
    "player:move": (payload: { roomId: string; direction: MoveDirection }) => void;
    "coin:collect": (payload: {
        roomId: string;
        coinId: string;
        playerX: number;
        playerY: number;
    }) => void;
}
