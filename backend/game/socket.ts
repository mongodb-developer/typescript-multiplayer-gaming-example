import { Server, Socket } from "socket.io";
import { Db, ObjectId } from "mongodb";
import { config } from "../config";
import {
    RoomJoinPayload,
    PlayerMovePayload,
    CoinCollectPayload,
    GameStartPayload,
    GameEndPayload,
    Match,
} from "../types/index";
import {
    createGameState,
    getGameState,
    deleteGameState,
    addPlayerToState,
    getPlayerBySocketId,
    applyMovement,
    validateCoinCollect,
} from "./state";
import { startCoinSpawner, stopCoinSpawner } from "./coins";

// ---------------------------------------------------------------------------
// End-of-match cleanup: persist results, notify clients, tear down state
// ---------------------------------------------------------------------------

/**
 * Finishes a match exactly once: marks the state `finished`, stops the coin
 * spawner and match timer, decides the winner (or a draw on equal scores),
 * persists the final scores to the match document, bumps each player's
 * `total_matches_played` / `total_wins` / `high_score`, broadcasts `game:end`,
 * and discards the in-memory room state.
 *
 * Called by the match duration timer, which is only armed once both players
 * have joined, so `player1`/`player2` are always set here.
 */
async function endMatch(
    io: Server,
    db: Db,
    roomId: string
): Promise<void> {
    const state = getGameState(roomId);
    if (!state || state.status === "finished") return;

    state.status = "finished";
    stopCoinSpawner(state);

    if (state.matchTimer !== null) {
        clearTimeout(state.matchTimer);
        state.matchTimer = null;
    }

    const p1 = state.player1!;
    const p2 = state.player2!;

    const winner =
        p1.score > p2.score
            ? p1.username
            : p2.score > p1.score
            ? p2.username
            : null; // draw

    const endedAt = new Date();

    // Persist match result
    await db.collection<Match>("matches").updateOne(
        { _id: new ObjectId(roomId) },
        {
            $set: {
                status: "finished",
                "player_1.score": p1.score,
                "player_2.score": p2.score,
                winner,
                ended_at: endedAt,
            },
        }
    );

    // Update each player's stats
    for (const { username, score } of [
        { username: p1.username, score: p1.score },
        { username: p2.username, score: p2.score },
    ]) {
        const isWinner = username === winner;
        await db.collection("players").updateOne(
            { username },
            {
                $inc: {
                    total_matches_played: 1,
                    total_wins: isWinner ? 1 : 0,
                },
                // $max only writes when score beats the player's stored high_score
                $max: { high_score: score },
            }
        );
    }

    const payload: GameEndPayload = {
        scores: {
            player1: { username: p1.username, score: p1.score },
            player2: { username: p2.username, score: p2.score },
        },
        winner,
    };

    io.to(roomId).emit("game:end", payload);
    deleteGameState(roomId);
}

// ---------------------------------------------------------------------------
// Socket event registration
// ---------------------------------------------------------------------------

/**
 * Wires up every socket event the game uses on each new connection:
 * `room:join`, `player:move`, `coin:collect`, and `disconnect`. Called once at
 * startup with the Socket.io server and the connected database handle.
 */
export function registerGameSockets(io: Server, db: Db): void {
    io.on("connection", (socket: Socket) => {
        console.log(`Socket connected: ${socket.id}`);

        // ------------------------------------------------------------------
        // room:join — puts a socket into a match.
        //
        // Loads the match document, works out whether the caller is player 1
        // or the incoming player 2 (persisted to the document), and rejects
        // unknown/finished/full rooms. Once both slots are filled it flips the
        // match to `in_progress`, broadcasts `game:start` with the canvas and
        // sizing config, starts the coin spawner, and arms the match-duration
        // timer that ends the match.
        // ------------------------------------------------------------------
        socket.on("room:join", async (payload: RoomJoinPayload) => {
            const { roomId, username } = payload;

            try {
                let matchDoc = await db
                    .collection<Match>("matches")
                    .findOne({ _id: new ObjectId(roomId) });

                if (!matchDoc) {
                    socket.emit("error", { message: "Room not found." });
                    return;
                }

                if (matchDoc.status === "finished") {
                    socket.emit("error", { message: "This match has already ended." });
                    return;
                }

                // Determine which slot this player occupies
                let slot: 1 | 2;

                if (matchDoc.player_1.username === username) {
                    slot = 1;
                } else if (!matchDoc.player_2) {
                    // Assign as player 2 and update DB
                    await db.collection<Match>("matches").updateOne(
                        { _id: new ObjectId(roomId) },
                        { $set: { player_2: { username, score: 0 } } }
                    );
                    slot = 2;
                } else if (matchDoc.player_2.username === username) {
                    slot = 2;
                } else {
                    socket.emit("error", { message: "Room is full." });
                    return;
                }

                // Join the socket.io room
                socket.join(roomId);

                // Get or create in-memory game state
                let state = getGameState(roomId);
                if (!state) {
                    state = createGameState(roomId);
                }

                // Register player in game state
                addPlayerToState(state, slot, username, socket.id);

                socket.emit("room:joined", { slot, roomId });

                // Start the game once both players are present
                if (state.player1 && state.player2 && state.status === "waiting") {
                    state.status = "in_progress";

                    await db.collection<Match>("matches").updateOne(
                        { _id: new ObjectId(roomId) },
                        { $set: { status: "in_progress" } }
                    );

                    const startPayload: GameStartPayload = {
                        players: {
                            player1: state.player1.username,
                            player2: state.player2.username,
                        },
                        coins: [],
                        durationMs: config.MATCH_DURATION_MS,
                        canvasWidth: config.CANVAS_WIDTH,
                        canvasHeight: config.CANVAS_HEIGHT,
                        playerSize: config.PLAYER_SIZE,
                        coinSize: config.COIN_SIZE,
                    };

                    io.to(roomId).emit("game:start", startPayload);

                    startCoinSpawner(io, state);

                    state.matchTimer = setTimeout(
                        () => endMatch(io, db, roomId),
                        config.MATCH_DURATION_MS
                    );
                }
            } catch (err) {
                console.error("room:join error", err);
                socket.emit("error", { message: "Failed to join room." });
            }
        });

        // ------------------------------------------------------------------
        // player:move — a movement key was pressed on a client.
        //
        // Resolves the player from the socket ID, applies and clamps the move
        // server-side, then broadcasts the authoritative position to the room.
        // The client that pressed the key does not move until this comes back.
        // Ignored unless the match is in progress.
        // ------------------------------------------------------------------
        socket.on("player:move", (payload: PlayerMovePayload) => {
            const { roomId, direction } = payload;
            const state = getGameState(roomId);

            if (!state || state.status !== "in_progress") return;

            const player = getPlayerBySocketId(state, socket.id);
            if (!player) return;

            const { x, y } = applyMovement(player, direction);

            io.to(roomId).emit("player:moved", { username: player.username, x, y });
        });

        // ------------------------------------------------------------------
        // coin:collect — a client detected an overlap with a coin.
        //
        // The claim is checked before it counts: the coin must still be on
        // screen, the socket must belong to a player in the room, and the
        // reported position must actually overlap the coin. Only then is the
        // coin removed, the score incremented, and `coin:collected` broadcast
        // with both players' scores. Bogus claims are dropped silently.
        // ------------------------------------------------------------------
        socket.on("coin:collect", async (payload: CoinCollectPayload) => {
            const { roomId, coinId, playerX, playerY } = payload;
            const state = getGameState(roomId);

            if (!state || state.status !== "in_progress") return;

            const coin = state.coins.get(coinId);
            if (!coin) return; // already collected or never existed

            const player = getPlayerBySocketId(state, socket.id);
            if (!player) return;

            // Sync player's reported position before validation
            player.x = playerX;
            player.y = playerY;

            if (!validateCoinCollect(player, coin.x, coin.y)) {
                // Client reported a bogus position — ignore silently
                return;
            }

            state.coins.delete(coinId);
            player.score += 1;

            io.to(roomId).emit("coin:collected", {
                coinId,
                username: player.username,
                scores: {
                    player1: { username: state.player1!.username, score: state.player1!.score },
                    player2: { username: state.player2!.username, score: state.player2!.score },
                },
            });
        });

        // ------------------------------------------------------------------
        // disconnect — logs the drop and does nothing else.
        // ------------------------------------------------------------------
        socket.on("disconnect", () => {
            console.log(`Socket disconnected: ${socket.id}`);
            // The match continues; if the timer fires later, endMatch handles cleanup.
            // No auto-win is awarded on disconnect per the spec.
        });
    });
}
