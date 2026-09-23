import { Router, Request, Response } from "express";
import { z } from "zod";
import { config } from "./config";
import { getDb } from "./libs/mongodb";
import { Match, Player } from "./types/index";

// Only the three endpoints the game actually calls. Everything else about a
// match (joining, movement, scoring) happens over sockets in game/socket.ts.
const router = Router();

const UsernameSchema = z.object({
    username: z.string().min(1).max(20),
});

/**
 * POST /players — registers a new player.
 * Validates the username, rejects duplicates with a 409, and otherwise inserts a
 * player document with zeroed stats. Responds 201 with the created document.
 */
router.post("/players", async (req: Request, res: Response) => {
    const parsed = UsernameSchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: parsed.error.flatten() });
        return;
    }

    const { username } = parsed.data;

    try {
        const db = getDb();

        const existing = await db.collection<Player>("players").findOne({ username });
        if (existing) {
            res.status(409).json({ error: "Username already exists." });
            return;
        }

        const player: Player = {
            username,
            high_score: 0,
            total_matches_played: 0,
            total_wins: 0,
            created_at: new Date(),
        };

        const result = await db.collection<Player>("players").insertOne(player);
        res.status(201).json({ _id: result.insertedId, ...player });
    } catch (err) {
        console.error("POST /players", err);
        res.status(500).json({ error: "Internal server error" });
    }
});

/**
 * GET /players/leaderboard — read-only leaderboard.
 * Returns the top `LEADERBOARD_LIMIT` players sorted by `high_score` descending,
 * projected down to the stat fields the lobby displays.
 */
router.get("/players/leaderboard", async (_req: Request, res: Response) => {
    try {
        const db = getDb();

        const players = await db
            .collection<Player>("players")
            .find({})
            .sort({ high_score: -1 })
            .limit(config.LEADERBOARD_LIMIT)
            .project({ username: 1, high_score: 1, total_wins: 1, total_matches_played: 1 })
            .toArray();

        res.json(players);
    } catch (err) {
        console.error("GET /players/leaderboard", err);
        res.status(500).json({ error: "Internal server error" });
    }
});

/**
 * POST /rooms — creates a match in the `waiting` state with the requesting
 * player as `player_1`. Responds 404 if that username has not been registered.
 * The returned `_id` is the room ID the second player uses to join over sockets.
 */
router.post("/rooms", async (req: Request, res: Response) => {
    const parsed = UsernameSchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: parsed.error.flatten() });
        return;
    }

    const { username } = parsed.data;

    try {
        const db = getDb();

        const player = await db.collection<Player>("players").findOne({ username });
        if (!player) {
            res.status(404).json({ error: "Player not found. Create a player first." });
            return;
        }

        const match: Match = {
            status: "waiting",
            player_1: { username, score: 0 },
            player_2: null,
            winner: null,
            created_at: new Date(),
            ended_at: null,
        };

        const result = await db.collection<Match>("matches").insertOne(match);

        res.status(201).json({ _id: result.insertedId, ...match });
    } catch (err) {
        console.error("POST /rooms", err);
        res.status(500).json({ error: "Internal server error" });
    }
});

export default router;
