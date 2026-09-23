import axios from "axios";
import type { LeaderboardEntry, Match, Player } from "./types";

const api = axios.create({
    baseURL: import.meta.env.VITE_API_URL,
});

/**
 * Registers a username with the backend.
 * Returns the created player, or `null` when the username is already taken —
 * since there is no authentication, that case is treated as a returning player
 * signing back in rather than an error. Other failures are rethrown.
 */
export async function createPlayer(username: string): Promise<Player | null> {
    try {
        const res = await api.post<Player>("/players", { username });
        return res.data;
    } catch (err) {
        if (axios.isAxiosError(err) && err.response?.status === 409) {
            // Username already exists — proceed as a returning player.
            return null;
        }
        throw err;
    }
}

/**
 * Creates a match with the given username as player 1 and returns it. The
 * match's `_id` is the room ID that the other player needs in order to join.
 */
export async function createRoom(username: string): Promise<Match> {
    const res = await api.post<Match>("/rooms", { username });
    return res.data;
}

/** Fetches the top players by high score for the lobby leaderboard. */
export async function getLeaderboard(): Promise<LeaderboardEntry[]> {
    const res = await api.get<LeaderboardEntry[]>("/players/leaderboard");
    return res.data;
}
