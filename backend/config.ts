import "dotenv/config";

/**
 * Reads an environment variable and parses it as a base-10 integer.
 * Falls back to `fallback` when the variable is unset, and throws when it is
 * set to something that is not a number so a typo in `.env` fails at startup
 * rather than silently producing `NaN` during a match.
 */
function intFromEnv(name: string, fallback: number): number {
    const raw = process.env[name];
    if (raw === undefined) return fallback;

    const parsed = parseInt(raw, 10);
    if (Number.isNaN(parsed)) {
        throw new Error(`Environment variable ${name} must be a number, got "${raw}".`);
    }

    return parsed;
}

// Read once at startup so nothing re-parses process.env on a hot path such as
// player movement. MONGO_URI / MONGO_DB_NAME stay in libs/mongodb.ts.
export const config = {
    PORT: intFromEnv("PORT", 3000),
    FRONTEND_URL: process.env.FRONTEND_URL ?? "http://localhost:5173",

    CANVAS_WIDTH: intFromEnv("CANVAS_WIDTH", 1920),
    CANVAS_HEIGHT: intFromEnv("CANVAS_HEIGHT", 1080),

    PLAYER_SIZE: intFromEnv("PLAYER_SIZE", 40),
    PLAYER_SPEED: intFromEnv("PLAYER_SPEED", 10),

    COIN_SIZE: intFromEnv("COIN_SIZE", 20),
    COIN_MAX_ON_SCREEN: intFromEnv("COIN_MAX_ON_SCREEN", 10),
    COIN_SPAWN_INTERVAL_MS: intFromEnv("COIN_SPAWN_INTERVAL_MS", 2000),

    MATCH_DURATION_MS: intFromEnv("MATCH_DURATION_MS", 30000),
    LEADERBOARD_LIMIT: intFromEnv("LEADERBOARD_LIMIT", 10),
} as const;
