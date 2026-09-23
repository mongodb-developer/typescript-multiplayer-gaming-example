// The socket payload types below are intentionally mirrored in
// frontend/src/types.ts. The two projects are independent (no shared package),
// so a change here needs the same change there.

import { ObjectId } from "mongodb";

// ---------------------------------------------------------------------------
// Database models
// ---------------------------------------------------------------------------

export interface Player {
    _id?: ObjectId;
    username: string;
    high_score: number;
    total_matches_played: number;
    total_wins: number;
    created_at: Date;
}

export type MatchStatus = "waiting" | "in_progress" | "finished";

export interface MatchPlayer {
    username: string;
    score: number;
}

export interface Match {
    _id?: ObjectId;
    status: MatchStatus;
    player_1: MatchPlayer;
    player_2: MatchPlayer | null;
    winner: string | null;
    created_at: Date;
    ended_at: Date | null;
}

// ---------------------------------------------------------------------------
// In-memory game objects
// ---------------------------------------------------------------------------

export interface Coin {
    id: string;
    x: number;
    y: number;
}

export interface PlayerGameState {
    username: string;
    socketId: string;
    x: number;
    y: number;
    score: number;
}

export type GameStatus = "waiting" | "in_progress" | "finished";

export interface GameState {
    roomId: string;
    player1: PlayerGameState | null;
    player2: PlayerGameState | null;
    coins: Map<string, Coin>;
    status: GameStatus;
    matchTimer: ReturnType<typeof setTimeout> | null;
    coinSpawnInterval: ReturnType<typeof setInterval> | null;
}

// ---------------------------------------------------------------------------
// Socket event payloads (client → server)
// ---------------------------------------------------------------------------

export interface RoomJoinPayload {
    roomId: string;
    username: string;
}

export type MoveDirection = "up" | "down" | "left" | "right";

export interface PlayerMovePayload {
    roomId: string;
    direction: MoveDirection;
}

export interface CoinCollectPayload {
    roomId: string;
    coinId: string;
    playerX: number;
    playerY: number;
}

// ---------------------------------------------------------------------------
// Socket event payloads (server → client)
// ---------------------------------------------------------------------------

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

export interface Scores {
    player1: { username: string; score: number };
    player2: { username: string; score: number };
}

export interface GameEndPayload {
    scores: Scores;
    winner: string | null;
}
